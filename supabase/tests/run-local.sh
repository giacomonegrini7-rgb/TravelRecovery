#!/usr/bin/env bash
# Applica le migrazioni a un PostgreSQL locale temporaneo (con lo stub di auth) ed esegue i test SQL.
# Richiede i binari PostgreSQL (initdb, pg_ctl, psql). Non tocca alcun progetto Supabase.
set -euo pipefail
cd "$(dirname "$0")/../.."

PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
TMP="$(mktemp -d)"
PORT="${PGPORT_TEST:-54329}"
trap '"$PGBIN/pg_ctl" -D "$TMP/data" stop -m immediate >/dev/null 2>&1 || true; rm -rf "$TMP"' EXIT

RUNAS=()
if [ "$(id -u)" = "0" ]; then
  id pgtest >/dev/null 2>&1 || useradd -M pgtest
  chown -R pgtest "$TMP"
  RUNAS=(runuser -u pgtest --)
fi

"${RUNAS[@]}" "$PGBIN/initdb" -D "$TMP/data" -U postgres -A trust >/dev/null
"${RUNAS[@]}" "$PGBIN/pg_ctl" -D "$TMP/data" -o "-p $PORT -k $TMP -c listen_addresses=''" -l "$TMP/log" start -w >/dev/null

PSQL=(psql -h "$TMP" -p "$PORT" -U postgres -v ON_ERROR_STOP=1 -q -X)
"${PSQL[@]}" -d postgres -c "create database tr" >/dev/null
"${PSQL[@]}" -d tr -f supabase/tests/auth_stub.sql >/dev/null
for f in supabase/migrations/*.sql; do
  "${PSQL[@]}" -d tr -f "$f" >/dev/null
done
echo "Migrazioni applicate."
"${PSQL[@]}" -d tr -f supabase/tests/security_and_flow.sql
