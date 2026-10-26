// Gateway di TEST che imita le API Supabase (Auth + PostgREST RPC) sopra un PostgreSQL locale.
// Serve solo a verificare end-to-end il contratto tra frontend e funzioni SQL reali.
// NON è un componente di produzione. Uso: node tests/e2e/mock-supabase.mjs <porta> <socketdir> <pgport>
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';

const [port = '54321', host = '/tmp', pgport = '54329'] = process.argv.slice(2);
const PASSWORDS = new Map([['owner@test.example', 'password-owner-1']]);

function psql(sql) {
  return new Promise((resolve) => {
    execFile('psql', ['-h', host, '-p', pgport, '-U', 'postgres', '-d', 'tr', '-X', '-q', '-At', '-v', 'ON_ERROR_STOP=1', '-c', sql],
      { maxBuffer: 50 * 1024 * 1024 }, (err, stdout, stderr) => resolve({ err, stdout, stderr }));
  });
}
const lit = (v) => {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'boolean' || typeof v === 'number') return String(v);
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  const tag = `$q${randomUUID().slice(0, 8)}$`;
  return `${tag}${s}${tag}`;
};
const session = (id, email = null) => ({ access_token: `uid.${id}`, refresh_token: `ref.${id}`, expires_in: 3600, token_type: 'bearer', user: { id, email, is_anonymous: !email } });

createServer(async (req, res) => {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'apikey, authorization, content-type', 'Access-Control-Allow-Methods': 'POST, PUT, GET, OPTIONS' };
  if (req.method === 'OPTIONS') { res.writeHead(204, cors).end(); return; }
  let body = '';
  for await (const c of req) body += c;
  const json = body ? JSON.parse(body) : {};
  const url = new URL(req.url, 'http://x');
  const send = (status, obj) => { res.writeHead(status, { ...cors, 'Content-Type': 'application/json' }).end(obj === undefined ? '' : JSON.stringify(obj)); };
  if (req.headers.apikey !== 'test-anon-key') return send(401, { message: 'Invalid API key' });

  if (url.pathname === '/auth/v1/signup') {
    const id = randomUUID();
    await psql(`insert into auth.users (id, email, email_confirmed_at, is_anonymous) values ('${id}', NULL, NULL, true)`);
    return send(200, session(id));
  }
  if (url.pathname === '/auth/v1/token') {
    const g = url.searchParams.get('grant_type');
    if (g === 'refresh_token') return send(200, session(json.refresh_token.slice(4)));
    if (g === 'password') {
      if (PASSWORDS.get(json.email) !== json.password) return send(400, { error_code: 'invalid_credentials', msg: 'Invalid login credentials' });
      const r = await psql(`select id from auth.users where email = ${lit(json.email)}`);
      return send(200, session(r.stdout.trim(), json.email));
    }
  }
  if (url.pathname === '/auth/v1/logout') return send(204);
  if (url.pathname === '/auth/v1/recover') return send(200, {});

  const m = url.pathname.match(/^\/rest\/v1\/rpc\/([a-z_]+)$/);
  if (m) {
    const auth = (req.headers.authorization ?? '').replace('Bearer ', '');
    const uid = auth.startsWith('uid.') ? auth.slice(4) : null;
    const args = Object.entries(json).map(([k, v]) => `${k} => ${lit(v)}`).join(', ');
    const sql = `select set_config('request.jwt.claim.sub', ${lit(uid ?? '')}, false); set role ${uid ? 'authenticated' : 'anon'}; select coalesce(to_jsonb(public.${m[1]}(${args}))::text, 'null');`;
    const r = await psql(sql);
    if (r.err) {
      const msg = (r.stderr.match(/ERROR:\s+(.*)/) ?? [])[1] ?? 'error';
      const detail = (r.stderr.match(/DETAIL:\s+(.*)/) ?? [])[1] ?? '';
      if (/permission denied/.test(msg)) return send(uid ? 403 : 401, { code: '42501', message: msg });
      return send(400, { code: 'P0001', message: msg, details: detail });
    }
    const out = r.stdout.trim().split('\n').pop();
    return send(200, JSON.parse(out));
  }
  send(404, { message: 'not found' });
}).listen(Number(port), '127.0.0.1', () => console.log(`mock supabase su http://127.0.0.1:${port}`));
