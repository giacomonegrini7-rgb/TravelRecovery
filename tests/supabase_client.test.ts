import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { SupabasePublicBackend } from '../src/lib/backend/supabaseBackend';
import { BackendError } from '../src/lib/backend/types';

// localStorage minimale per Node
const mem = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k), clear: () => mem.clear(), key: () => null, length: 0,
};
beforeEach(() => mem.clear());

type Call = { url: string; init: RequestInit };
function fakeFetch(handler: (url: string, init: RequestInit) => { status: number; body?: unknown } | Error) {
  const calls: Call[] = [];
  const fn = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const r = handler(url, init);
    if (r instanceof Error) throw r;
    return new Response(r.body === undefined ? '' : JSON.stringify(r.body), { status: r.status });
  }) as unknown as typeof fetch;
  return { fn, calls };
}
const session = { access_token: 'tok1', refresh_token: 'ref1', expires_in: 3600, user: { id: 'u1', is_anonymous: true } };

test('errore di rete: BackendError ripetibile, nessun falso successo', async () => {
  const { fn } = fakeFetch(() => new TypeError('Failed to fetch'));
  const b = new SupabasePublicBackend('https://x.supabase.co', 'anon', fn);
  await assert.rejects(b.getConfig(), (e: unknown) => e instanceof BackendError && e.code === 'network' && e.retryable);
});

test('start: sessione anonima, poi RPC con token e chiave di idempotenza', async () => {
  const { fn, calls } = fakeFetch((url) => {
    if (url.endsWith('/auth/v1/signup')) return { status: 200, body: session };
    if (url.endsWith('/rest/v1/rpc/start_participation')) return { status: 200, body: { id: 'p1', answers: {}, explorations: [] } };
    return { status: 404 };
  });
  const b = new SupabasePublicBackend('https://x.supabase.co/', 'anon', fn);
  const st = await b.start('key-1');
  assert.equal(st.id, 'p1');
  const rpc = calls.find((c) => c.url.includes('start_participation'))!;
  assert.equal((rpc.init.headers as Record<string, string>).Authorization, 'Bearer tok1');
  assert.equal((rpc.init.headers as Record<string, string>).apikey, 'anon');
  assert.deepEqual(JSON.parse(rpc.init.body as string), { p_client_key: 'key-1' });
  // seconda chiamata: riusa la sessione, non crea un nuovo utente anonimo
  await b.start('key-1');
  assert.equal(calls.filter((c) => c.url.endsWith('/signup')).length, 1);
});

test('errori applicativi TR: mappati con codice', async () => {
  const { fn } = fakeFetch((url) => url.endsWith('/signup') ? { status: 200, body: session }
    : { status: 400, body: { code: 'P0001', message: 'TR:invalid_answer', details: 'Q8:too_many' } });
  const b = new SupabasePublicBackend('https://x.supabase.co', 'anon', fn);
  await b.start('k').catch(() => undefined);
  await assert.rejects(b.saveStep('p1', {}, 'Q2'), (e: unknown) => e instanceof BackendError && e.code === 'invalid_answer' && e.detail === 'Q8:too_many');
});

test('permesso negato e 5xx', async () => {
  let n = 0;
  const { fn } = fakeFetch(() => (++n === 1 ? { status: 401, body: { code: '42501', message: 'permission denied' } } : { status: 503, body: { message: 'down' } }));
  const b = new SupabasePublicBackend('https://x.supabase.co', 'anon', fn);
  await assert.rejects(b.getConfig(), (e: unknown) => e instanceof BackendError && e.code === 'forbidden');
  await assert.rejects(b.getConfig(), (e: unknown) => e instanceof BackendError && e.code === 'server' && e.retryable);
});

test('token scaduto: rinnovo con refresh token e nuovo tentativo', async () => {
  mem.set('tr.participant.session', JSON.stringify({ access_token: 'old', refresh_token: 'r0', expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'u1' } }));
  const { fn, calls } = fakeFetch((url, init) => {
    if (url.includes('grant_type=refresh_token')) return { status: 200, body: { ...session, access_token: 'new' } };
    const auth = (init.headers as Record<string, string>).Authorization;
    return auth === 'Bearer old' ? { status: 401, body: { message: 'JWT expired' } } : { status: 200, body: { ok: true, path: 'experience' } };
  });
  const b = new SupabasePublicBackend('https://x.supabase.co', 'anon', fn);
  const r = await b.saveStep('p1', { Q1: { kind: 'multi', values: ['hotel'] } }, 'Q2');
  assert.equal(r.path, 'experience');
  assert.equal(calls.filter((c) => c.url.includes('save_step')).length, 2);
});

test('load senza sessione nel browser: non disponibile, nessuna chiamata', async () => {
  const { fn, calls } = fakeFetch(() => ({ status: 200, body: {} }));
  const b = new SupabasePublicBackend('https://x.supabase.co', 'anon', fn);
  await assert.rejects(b.load('p1'), (e: unknown) => e instanceof BackendError && e.code === 'not_found');
  assert.equal(calls.length, 0);
});
