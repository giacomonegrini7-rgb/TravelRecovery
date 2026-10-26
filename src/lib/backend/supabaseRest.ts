// Client minimale per Supabase Auth (GoTrue) e PostgREST RPC, basato su fetch.
// Usa SOLO la chiave pubblica "anon" prevista dal provider; nessun segreto nel bundle.
// Sessioni separate per partecipante (anonima) e creator (storageKey diversi).

import { BackendError } from './types';

export interface Session {
  access_token: string;
  refresh_token: string;
  expires_at: number; // epoch secondi
  user: { id: string; email?: string | null; is_anonymous?: boolean };
}

type FetchFn = typeof fetch;

const TIMEOUT_MS = 15000;

function safeGet(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function safeSet(key: string, v: string | null) {
  try { if (v === null) localStorage.removeItem(key); else localStorage.setItem(key, v); } catch { /* storage non disponibile */ }
}

export class SupabaseRest {
  private refreshing: Promise<Session> | null = null;

  constructor(
    private url: string,
    private anonKey: string,
    private storageKey: string,
    private fetchFn: FetchFn = (...a) => fetch(...a),
  ) {
    this.url = url.replace(/\/+$/, '');
  }

  get session(): Session | null {
    const raw = safeGet(this.storageKey);
    if (!raw) return null;
    try { return JSON.parse(raw) as Session; } catch { return null; }
  }

  private setSession(s: Session | null) {
    safeSet(this.storageKey, s ? JSON.stringify(s) : null);
  }

  private async request(path: string, init: RequestInit & { token?: string | null }): Promise<{ status: number; body: unknown }> {
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), TIMEOUT_MS) : null;
    // La chiave pubblica va solo nell'header apikey (compatibile con chiavi "publishable" e legacy "anon");
    // Authorization porta soltanto il token di una sessione utente.
    const headers: Record<string, string> = { apikey: this.anonKey, 'Content-Type': 'application/json' };
    if (init.token) headers.Authorization = `Bearer ${init.token}`;
    let res: Response;
    try {
      res = await this.fetchFn(this.url + path, { ...init, headers: { ...headers, ...(init.headers as Record<string, string> | undefined) }, signal: ctrl?.signal });
    } catch (e) {
      const aborted = (e as { name?: string })?.name === 'AbortError';
      throw new BackendError(aborted ? 'timeout' : 'network', aborted ? 'Timeout' : 'Network error', true);
    } finally {
      if (timer) clearTimeout(timer);
    }
    const text = await res.text().catch(() => '');
    let body: unknown = null;
    if (text) { try { body = JSON.parse(text); } catch { body = text; } }
    return { status: res.status, body };
  }

  private toError(status: number, body: unknown): BackendError {
    const b = (body ?? {}) as { message?: string; msg?: string; code?: string; details?: string; error_description?: string; error_code?: string };
    const message = b.message ?? b.msg ?? b.error_description ?? `HTTP ${status}`;
    if (typeof message === 'string' && message.startsWith('TR:')) {
      const code = message.slice(3);
      return new BackendError(code, message, code === 'rate_limited', b.details);
    }
    if (b.code === '42501' || status === 403) return new BackendError('forbidden', message);
    if (status === 401) return new BackendError('auth', message);
    if (status === 429) return new BackendError('rate_limited', message, true);
    if (status >= 500) return new BackendError('server', message, true);
    if (b.error_code === 'invalid_credentials' || /invalid login/i.test(message)) return new BackendError('invalid_credentials', 'Email o password non corretti.');
    if (b.error_code === 'email_not_confirmed') return new BackendError('email_not_confirmed', 'Conferma prima l’indirizzo email dal messaggio ricevuto.');
    if (b.error_code === 'anonymous_provider_disabled') return new BackendError('not_configured', 'Accesso anonimo non abilitato in Supabase.');
    return new BackendError('request', message);
  }

  private toSession(body: unknown): Session {
    const b = body as { access_token: string; refresh_token: string; expires_in?: number; expires_at?: number; user: Session['user'] };
    if (!b?.access_token) throw new BackendError('auth', 'Sessione non ricevuta');
    return {
      access_token: b.access_token,
      refresh_token: b.refresh_token,
      expires_at: b.expires_at ?? Math.floor(Date.now() / 1000) + (b.expires_in ?? 3600),
      user: b.user,
    };
  }

  private async refresh(): Promise<Session> {
    const s = this.session;
    if (!s) throw new BackendError('auth', 'Nessuna sessione');
    if (!this.refreshing) {
      this.refreshing = (async () => {
        const r = await this.request('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: JSON.stringify({ refresh_token: s.refresh_token }) });
        if (r.status >= 400) {
          if (r.status < 500) this.setSession(null);
          throw this.toError(r.status, r.body);
        }
        const ns = this.toSession(r.body);
        this.setSession(ns);
        return ns;
      })().finally(() => { this.refreshing = null; });
    }
    return this.refreshing;
  }

  /** Restituisce un token valido, rinnovandolo se in scadenza. */
  async validToken(): Promise<string | null> {
    const s = this.session;
    if (!s) return null;
    if (s.expires_at - Date.now() / 1000 > 60) return s.access_token;
    return (await this.refresh()).access_token;
  }

  /** Sessione anonima per il partecipante (nessun account visibile). */
  async ensureAnonymous(): Promise<Session> {
    const tok = await this.validToken().catch((e) => { if (e instanceof BackendError && e.retryable) throw e; return null; });
    if (tok && this.session) return this.session;
    const r = await this.request('/auth/v1/signup', { method: 'POST', body: JSON.stringify({ data: {} }) });
    if (r.status >= 400) throw this.toError(r.status, r.body);
    const s = this.toSession(r.body);
    this.setSession(s);
    return s;
  }

  async signInWithPassword(email: string, password: string): Promise<Session> {
    const r = await this.request('/auth/v1/token?grant_type=password', { method: 'POST', body: JSON.stringify({ email, password }) });
    if (r.status >= 400) throw this.toError(r.status, r.body);
    const s = this.toSession(r.body);
    this.setSession(s);
    return s;
  }

  async signUp(email: string, password: string, redirectTo: string): Promise<'confirm_email' | 'signed_in'> {
    const r = await this.request(`/auth/v1/signup?redirect_to=${encodeURIComponent(redirectTo)}`, { method: 'POST', body: JSON.stringify({ email, password }) });
    if (r.status >= 400) throw this.toError(r.status, r.body);
    const b = r.body as { access_token?: string };
    if (b?.access_token) { this.setSession(this.toSession(r.body)); return 'signed_in'; }
    return 'confirm_email';
  }

  async recover(email: string, redirectTo: string): Promise<void> {
    const r = await this.request(`/auth/v1/recover?redirect_to=${encodeURIComponent(redirectTo)}`, { method: 'POST', body: JSON.stringify({ email }) });
    if (r.status >= 400 && r.status !== 429) throw this.toError(r.status, r.body);
    if (r.status === 429) throw this.toError(429, r.body);
  }

  async updatePassword(password: string): Promise<void> {
    const token = await this.validToken();
    if (!token) throw new BackendError('auth', 'Nessuna sessione');
    const r = await this.request('/auth/v1/user', { method: 'PUT', token, body: JSON.stringify({ password }) });
    if (r.status >= 400) throw this.toError(r.status, r.body);
  }

  /** Legge i token da un link di conferma/recupero (#access_token=…&type=recovery). */
  consumeHashSession(hash: string): { type: string | null } | null {
    const h = hash.startsWith('#') ? hash.slice(1) : hash;
    const p = new URLSearchParams(h);
    const access = p.get('access_token');
    const refresh = p.get('refresh_token');
    if (!access || !refresh) return null;
    let user: Session['user'] = { id: '' };
    try {
      const payload = JSON.parse(atob(access.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      user = { id: payload.sub, email: payload.email };
    } catch { /* token non decodificabile: resterà valido lato server */ }
    this.setSession({
      access_token: access,
      refresh_token: refresh,
      expires_at: Number(p.get('expires_at')) || Math.floor(Date.now() / 1000) + Number(p.get('expires_in') || 3600),
      user,
    });
    return { type: p.get('type') };
  }

  async signOut(): Promise<void> {
    const s = this.session;
    this.setSession(null);
    if (s) await this.request('/auth/v1/logout', { method: 'POST', token: s.access_token }).catch(() => undefined);
  }

  clearLocal() { this.setSession(null); }

  /** Chiamata RPC PostgREST con il token della sessione (rinnovato una volta in caso di 401). */
  async rpc<T>(fn: string, args: Record<string, unknown>, opts: { requireSession?: boolean } = {}): Promise<T> {
    let token = await this.validToken();
    if (opts.requireSession && !token) throw new BackendError('auth', 'Nessuna sessione');
    const call = (t: string | null) => this.request(`/rest/v1/rpc/${fn}`, { method: 'POST', token: t, body: JSON.stringify(args) });
    let r = await call(token);
    if (r.status === 401 && this.session) {
      token = (await this.refresh()).access_token;
      r = await call(token);
    }
    if (r.status >= 400) throw this.toError(r.status, r.body);
    return r.body as T;
  }
}
