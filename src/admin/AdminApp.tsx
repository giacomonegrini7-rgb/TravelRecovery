import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { adminApi, isConnected } from '../lib/backend';
import { BackendError, errorText, type Dataset, type Role } from '../lib/backend/types';
import { addDaysISO, dateRome, dateTimeRome, romeDayStartISO } from '../lib/format';
import { applyClientFilters, catLabel, PATH_LABEL, type ClientFilters } from '../lib/stats';
import { href, navigate } from '../lib/router';
import { Alert, Brand, Button, SkipLink, Spinner } from '../ui/components';
import { DEMO_CASES } from '../config/demoCases';
import { PROJECT } from '../config/project';
import { StatsPage } from './StatsPage';
import { ParticipationsPage, ReportPage } from './ParticipationsPage';
import { ContactsPage } from './ContactsPage';
import { SettingsPage } from './SettingsPage';
import { LoginScreen, SetPasswordScreen } from './Login';
import { ConfirmProvider } from '../ui/confirm';

export interface AdminFilters {
  from: string; // YYYY-MM-DD (Europe/Rome), incluso
  to: string; // YYYY-MM-DD (Europe/Rome), incluso
  version: string;
  path: ClientFilters['path'];
  category: string;
  source: 'research' | 'test' | 'all';
}

export const DEFAULT_FILTERS: AdminFilters = { from: '', to: '', version: '', path: 'all', category: 'all', source: 'research' };

export function filterLines(f: AdminFilters): string[] {
  const l: string[] = [];
  l.push(`Dati: ${f.source === 'research' ? 'solo ricerca (test esclusi)' : f.source === 'test' ? 'solo test' : 'ricerca e test'}`);
  l.push(`Periodo di avvio: ${f.from ? dateRome(romeDayStartISO(f.from)) : 'dall’inizio'} – ${f.to ? dateRome(romeDayStartISO(f.to)) : 'oggi'}`);
  if (f.version) l.push(`Versione questionario: ${f.version}`);
  if (f.path !== 'all') l.push(`Percorso: ${PATH_LABEL[f.path]}`);
  if (f.category !== 'all') l.push(`Categoria demo esplorata: ${catLabel(f.category)}`);
  return l;
}

export interface AdminCtx {
  ds: Dataset;
  rows: Dataset['participations'];
  filters: AdminFilters;
  role: Role;
  reload: () => void;
}

type AuthState =
  | { s: 'checking' }
  | { s: 'signed_out' }
  | { s: 'recovery' }
  | { s: 'denied'; email: string | null }
  | { s: 'ok'; email: string | null; role: Role }
  | { s: 'error'; msg: string };

const NAV = [
  { path: '/admin', label: 'Statistiche' },
  { path: '/admin/partecipazioni', label: 'Partecipazioni' },
  { path: '/admin/contatti', label: 'Contatti' },
  { path: '/admin/impostazioni', label: 'Impostazioni' },
];

export function AdminApp({ path }: { path: string }) {
  const api = adminApi();
  const [auth, setAuth] = useState<AuthState>({ s: 'checking' });

  const check = useCallback(async () => {
    setAuth({ s: 'checking' });
    try {
      if (api.consumeRecoveryLink()) { setAuth({ s: 'recovery' }); return; }
      const w = await api.whoami();
      if (!api.sessionEmail() && !w.email) { setAuth({ s: 'signed_out' }); return; }
      setAuth(w.role ? { s: 'ok', email: w.email, role: w.role } : { s: 'denied', email: w.email });
    } catch (e) {
      if (e instanceof BackendError && (e.code === 'auth' || e.code === 'auth_required')) { setAuth({ s: 'signed_out' }); return; }
      setAuth({ s: 'error', msg: errorText(e) });
    }
  }, [api]);

  useEffect(() => { document.title = `Area creator · ${PROJECT.name}`; void check(); }, [check]);

  const signOut = async () => { await api.signOut(); setAuth({ s: 'signed_out' }); navigate('/admin', true); };

  if (auth.s === 'checking') return <AdminFrame><div className="admin-center"><Spinner label="Verifica dell’accesso…" /></div></AdminFrame>;
  if (auth.s === 'error') {
    return <AdminFrame><div className="admin-center"><Alert action={<Button variant="secondary" onClick={() => void check()}>Riprova</Button>}>{auth.msg}</Alert></div></AdminFrame>;
  }
  if (auth.s === 'signed_out') return <AdminFrame><LoginScreen api={api} onSignedIn={() => void check()} /></AdminFrame>;
  if (auth.s === 'recovery') return <AdminFrame><SetPasswordScreen api={api} onDone={() => void check()} /></AdminFrame>;
  if (auth.s === 'denied') {
    return (
      <AdminFrame>
        <div className="admin-center admin-card">
          <h1 className="h-screen">Accesso non autorizzato</h1>
          <p>L’account {auth.email ? <strong>{auth.email}</strong> : 'corrente'} non ha un ruolo creator. L’accesso viene concesso solo dall’owner del progetto.</p>
          <p className="muted small">Se sei stato invitato, verifica di aver confermato l’indirizzo email e accedi di nuovo.</p>
          <Button variant="secondary" onClick={() => void signOut()}>Esci</Button>
        </div>
      </AdminFrame>
    );
  }
  return <ConfirmProvider><AdminShell path={path} email={auth.email} role={auth.role} onSignOut={() => void signOut()} /></ConfirmProvider>;
}

function AdminFrame({ children }: { children: ReactNode }) {
  return (
    <div className="admin admin-bare">
      <header className="admin-bar"><Brand name={PROJECT.name} light /><span className="admin-bar-tag">Area creator</span></header>
      {!isConnected && <SampleNotice />}
      <main id="contenuto">{children}</main>
    </div>
  );
}

function SampleNotice() {
  return (
    <div className="sample-banner" role="note">
      <strong>Dati di esempio</strong>: anteprima locale senza backend collegato. I numeri sono fixture dimostrative e non provengono dalla ricerca.
    </div>
  );
}

function AdminShell({ path, email, role, onSignOut }: { path: string; email: string | null; role: Role; onSignOut: () => void }) {
  const api = adminApi();
  const [filters, setFilters] = useState<AdminFilters>(DEFAULT_FILTERS);
  const [ds, setDs] = useState<Dataset | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const serverKey = `${filters.from}|${filters.to}|${filters.version}|${filters.source}|${tick}`;
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    api.dataset({
      from: filters.from ? romeDayStartISO(filters.from) : null,
      to: filters.to ? romeDayStartISO(addDaysISO(filters.to, 1)) : null,
      includeTest: filters.source !== 'research',
      includeResearch: filters.source !== 'test',
      version: filters.version || null,
    }).then((d) => { if (alive) setDs(d); })
      .catch((e) => { if (alive) setError(errorText(e)); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverKey]);

  const rows = useMemo(() => (ds ? applyClientFilters(ds.participations, { path: filters.path, category: filters.category }) : []), [ds, filters.path, filters.category]);
  const reload = () => setTick((t) => t + 1);

  const section = path.startsWith('/admin/partecipazioni') ? 'p' : path.startsWith('/admin/contatti') ? 'c' : path.startsWith('/admin/impostazioni') ? 's' : 'stats';
  const reportId = path.match(/^\/admin\/partecipazioni\/([^/]+)$/)?.[1] ?? null;

  let body: ReactNode = null;
  if (section === 'c') body = <ContactsPage role={role} sample={!isConnected} />;
  else if (section === 's') body = <SettingsPage role={role} onChanged={reload} sample={!isConnected} />;
  else if (error) body = <Alert action={<Button variant="secondary" onClick={reload}>Riprova</Button>}>Impossibile caricare i dati. {error}</Alert>;
  else if (!ds) body = <Spinner label="Caricamento dei dati…" />;
  else {
    const ctx: AdminCtx = { ds, rows, filters, role, reload };
    if (section === 'p' && reportId) body = <ReportPage ctx={ctx} id={decodeURIComponent(reportId)} />;
    else if (section === 'p') body = <ParticipationsPage ctx={ctx} />;
    else body = <StatsPage ctx={ctx} />;
  }

  const showFilters = section === 'stats' || (section === 'p' && !reportId);

  return (
    <div className="admin">
      <SkipLink />
      <header className="admin-bar">
        <a href={href('/admin')} className="brand-link"><Brand name={ds?.config.project_name ?? PROJECT.name} light /></a>
        <span className="admin-bar-tag">Area creator</span>
        <span className="admin-bar-user">{email ?? ''} <span className="role-tag">{role}</span></span>
        <button className="admin-bar-out" onClick={onSignOut}>Esci</button>
      </header>
      {(!isConnected || ds?.sample) && <SampleNotice />}
      <div className="admin-layout">
        <nav className="admin-nav" aria-label="Sezioni">
          {NAV.map((n) => {
            const active = n.path === '/admin' ? section === 'stats' : path.startsWith(n.path);
            return <a key={n.path} href={href(n.path)} aria-current={active ? 'page' : undefined} className={active ? 'is-active' : ''}>{n.label}</a>;
          })}
          {ds && <p className="admin-mode">Modalità: <strong>{ds.config.mode === 'research' ? 'Ricerca attiva' : 'Test'}</strong></p>}
        </nav>
        <main className="admin-main" id="contenuto">
          {showFilters && (
            <FiltersBar filters={filters} setFilters={setFilters} versions={ds?.questionnaire_versions.map((v) => v.version) ?? []}
              loading={loading} updatedAt={ds?.generated_at ?? null} onRefresh={reload} />
          )}
          {body}
        </main>
      </div>
    </div>
  );
}

function FiltersBar({ filters, setFilters, versions, loading, updatedAt, onRefresh }: {
  filters: AdminFilters; setFilters: (f: AdminFilters) => void; versions: string[]; loading: boolean; updatedAt: string | null; onRefresh: () => void;
}) {
  const set = <K extends keyof AdminFilters>(k: K, v: AdminFilters[K]) => setFilters({ ...filters, [k]: v });
  const active = filterLines(filters);
  const dirty = JSON.stringify(filters) !== JSON.stringify(DEFAULT_FILTERS);
  const invalidRange = filters.from && filters.to && filters.from > filters.to;
  return (
    <section className="filters" aria-label="Filtri">
      <div className="filters-grid">
        <label>Avvio dal<input type="date" value={filters.from} onChange={(e) => set('from', e.target.value)} /></label>
        <label>al<input type="date" value={filters.to} onChange={(e) => set('to', e.target.value)} /></label>
        <label>Versione
          <select value={filters.version} onChange={(e) => set('version', e.target.value)}>
            <option value="">Tutte</option>
            {versions.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </label>
        <label>Percorso
          <select value={filters.path} onChange={(e) => set('path', e.target.value as AdminFilters['path'])}>
            <option value="all">Tutti</option>
            <option value="experience">{PATH_LABEL.experience}</option>
            <option value="alternative">{PATH_LABEL.alternative}</option>
            <option value="never_purchased">{PATH_LABEL.never_purchased}</option>
          </select>
        </label>
        <label>Categoria demo
          <select value={filters.category} onChange={(e) => set('category', e.target.value)}>
            <option value="all">Tutte</option>
            {DEMO_CASES.map((c) => <option key={c.category} value={c.category}>{c.categoryLabel}</option>)}
          </select>
        </label>
        <label>Dati
          <select value={filters.source} onChange={(e) => set('source', e.target.value as AdminFilters['source'])}>
            <option value="research">Ricerca (test esclusi)</option>
            <option value="test">Solo test</option>
            <option value="all">Ricerca e test</option>
          </select>
        </label>
      </div>
      {invalidRange && <p className="inline-msg inline-error">La data iniziale è successiva a quella finale: nessun risultato possibile.</p>}
      <div className="filters-foot">
        <ul className="chips" aria-label="Filtri attivi">{active.map((l) => <li key={l}>{l}</li>)}</ul>
        <div className="filters-actions">
          {dirty && <button className="link-quiet" onClick={() => setFilters(DEFAULT_FILTERS)}>Azzera filtri</button>}
          <span className="updated" aria-live="polite">{loading ? 'Aggiornamento…' : updatedAt ? `Aggiornato alle ${dateTimeRome(updatedAt).split(' ').pop()}` : ''}</span>
          <Button variant="secondary" onClick={onRefresh} busy={loading}>Aggiorna</Button>
        </div>
      </div>
    </section>
  );
}
