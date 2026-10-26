#!/usr/bin/env bash
# Verifica end-to-end in modalità COLLEGATA: frontend → API in stile Supabase → funzioni SQL reali su PostgreSQL locale.
# Richiede: PostgreSQL (initdb/pg_ctl/psql), Node, Python con Playwright. Non usa servizi esterni.
set -euo pipefail
cd "$(dirname "$0")/../.."
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
TMP="$(mktemp -d)"; PORT=54339
OUT="${1:-$TMP/shots}"
RUNAS=(); if [ "$(id -u)" = "0" ]; then id pgtest >/dev/null 2>&1 || useradd -M pgtest; chown -R pgtest "$TMP"; chmod 755 "$TMP"; RUNAS=(runuser -u pgtest --); fi
cleanup() { kill ${MOCK:-} ${WEB:-} 2>/dev/null || true; "${RUNAS[@]}" "$PGBIN/pg_ctl" -D "$TMP/data" stop -m immediate >/dev/null 2>&1 || true; }
trap cleanup EXIT
"${RUNAS[@]}" "$PGBIN/initdb" -D "$TMP/data" -U postgres -A trust >/dev/null
"${RUNAS[@]}" "$PGBIN/pg_ctl" -D "$TMP/data" -o "-p $PORT -k $TMP -c listen_addresses=''" -l "$TMP/log" start -w >/dev/null
PSQL=(psql -h "$TMP" -p "$PORT" -U postgres -v ON_ERROR_STOP=1 -q -X)
"${PSQL[@]}" -d postgres -c "create database tr" >/dev/null
"${PSQL[@]}" -d tr -f supabase/tests/auth_stub.sql >/dev/null
for f in supabase/migrations/*.sql; do "${PSQL[@]}" -d tr -f "$f" >/dev/null; done
"${PSQL[@]}" -d tr -c "insert into auth.users (id, email, email_confirmed_at) values (gen_random_uuid(), 'owner@test.example', now()); select public.bootstrap_owner('owner@test.example');" >/dev/null
node tests/e2e/mock-supabase.mjs 54321 "$TMP" "$PORT" > "$TMP/mock.log" 2>&1 & MOCK=$!
node scripts/build-esbuild.mjs --out "$TMP/web" --env-url http://127.0.0.1:54321 --env-key test-anon-key >/dev/null
node tests/e2e/static-server.mjs "$TMP/web" 4174 > /dev/null 2>&1 & WEB=$!
sleep 1
python3 tests/e2e/connected.py http://127.0.0.1:4174 "$OUT"
echo "— Verifica nel database"
"${PSQL[@]}" -d tr -At -F ' | ' -c "select 'partecipazioni', count(*), count(*) filter (where status='completed'), count(*) filter (where is_test) from participations;
select 'risposte F1a/F1b', count(*) from answers where question_id in ('F1a','F1b') and status='answered';
select 'contatti', count(*) from contacts; select 'richieste', count(*) from subscription_requests;
select 'eventi duplicati', count(*) - count(distinct (participation_id, event_type)) from events;
select 'IP o user agent salvati', count(*) from information_schema.columns where table_schema='public' and column_name in ('ip', 'ip_address', 'user_agent', 'location', 'geo', 'latitude', 'longitude');"
