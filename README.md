# Travel Recovery — prototipo di ricerca

Questionario, demo interattiva con dati inventati, raccolta facoltativa delle email e area privata dei creator (statistiche, report individuali, contatti, esportazioni).

- Frontend: React 19 + TypeScript + Vite, CSS organizzato per token (`src/styles`).
- Backend: Supabase (PostgreSQL, Auth anonima per i partecipanti, password per i creator, RLS, funzioni `SECURITY DEFINER`).
- Hosting: Netlify (o qualsiasi hosting statico con fallback SPA, vedi `netlify.toml` e `public/_redirects`).
- Il nome del progetto è in `src/config/project.ts` (e modificabile da *Impostazioni* nella versione collegata).

## Le tre modalità

| Modalità | Quando | Cosa succede ai dati |
|---|---|---|
| **Anteprima locale** | `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` non impostate | Nulla viene inviato. Le risposte restano nel browser; l’email non viene conservata. La dashboard mostra solo fixture etichettate «Dati di esempio». |
| **Test collegato** | Backend configurato, `app_config.mode = 'test'` (predefinito) | Salvataggio reale, partecipazioni marcate `is_test` ed escluse dalle statistiche per impostazione predefinita. |
| **Ricerca attiva** | L’owner la attiva da *Impostazioni* | Dati reali. Attivabile solo con i campi essenziali dell’informativa compilati. |

In modalità collegata un errore di rete mostra un errore con «Riprova»: non si passa mai in silenzio alla modalità locale e non si mostra «salvato» prima della conferma del server.

## Avvio locale

```bash
npm install
npm run dev          # http://localhost:5173 — anteprima locale senza backend
npm test             # test unitari (percorsi, demo, statistiche, CSV, client API)
npm run build        # typecheck + build di produzione in dist/
```

## Attivazione del backend (Supabase)

1. Crea un progetto su supabase.com (regione UE consigliata).
2. *Authentication → Sign In / Providers*: abilita **Anonymous sign-ins** (partecipanti) ed **Email** (creator). Lascia attiva la conferma email.
3. *Authentication → URL Configuration*: imposta **Site URL** all’indirizzo pubblico e aggiungi `https://<tuo-sito>/admin` ai **Redirect URLs** (conferma e recupero password).
4. Applica le migrazioni in ordine (`supabase/migrations/*.sql`):
   - con la CLI: `supabase link --project-ref <id>` poi `supabase db push`, oppure
   - dall’*SQL Editor*, incollando i quattro file in ordine.
5. Copia URL e chiave **anon/publishable** del progetto (*Project Settings → API*) in `.env` (vedi `.env.example`) o nelle variabili dell’hosting. **Non usare mai la chiave service_role nel frontend.**

### Primo owner (procedura sicura)

1. *Authentication → Users → Add user*: crea l’utente con la tua email e una password, con «Auto confirm».
2. Nell’*SQL Editor* (ruolo amministrativo) esegui:
   ```sql
   select public.bootstrap_owner('tua.email@esempio.it');
   ```
   La funzione non è invocabile dal browser. Nessuna registrazione pubblica dà accesso ai dati.

### Altri creator

L’owner autorizza un’email da `/admin/impostazioni`. La persona apre `/admin`, sceglie «Primo accesso con un invito», crea la password e conferma l’email: al primo accesso il server le assegna il ruolo creator. Il recupero password è in «Password dimenticata?».

## Deploy (Netlify)

1. Carica il progetto su un repository (o trascina la cartella `dist/` dopo `npm run build`).
2. Netlify legge `netlify.toml`: build `npm run build`, pubblica `dist`, fallback SPA per `/privacy` e `/admin/...`.
3. *Site configuration → Environment variables*: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`. Ridistribuisci.
4. Il link da condividere (anche via WhatsApp) è l’indirizzo del sito: i partecipanti non hanno bisogno di account.

## Deploy alternativo: Vercel o Render

- **Vercel**: *Add New → Project*, importa il repository GitHub. `vercel.json` imposta build, cartella `dist` e fallback SPA. Aggiungi `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` in *Environment Variables* prima del primo deploy.
- **Render**: *New → Blueprint* (legge `render.yaml`) oppure *New → Static Site* con build `npm install && npm run build`, publish `dist` e una regola *Rewrite* `/*` → `/index.html`. Inserisci le due variabili quando richiesto.

Le variabili `VITE_*` vengono incorporate durante la build: se le cambi, rifai il deploy.

## Dashboard

`/admin` (statistiche) · `/admin/partecipazioni` (elenco e report, stampa/PDF e JSON) · `/admin/contatti` (revoca, eliminazione, CSV destinatari attivi) · `/admin/impostazioni` (informativa, modalità, accessi, conservazione).
Tutti i dati arrivano da funzioni che verificano il ruolo lato server; nascondere `/admin` dal menu non è la misura di sicurezza.

## Da test a ricerca attiva

1. In modalità test, completa almeno un percorso per ramo (esperienza, alternativo, mai acquistato) e controlla dashboard ed export con il filtro «Dati: Solo test».
2. In *Impostazioni → Progetto e informativa* compila titolare, contatto, base giuridica e periodo di conservazione (informazioni da verificare con il docente/l’università: l’app non propone valori).
3. Premi «Attiva la ricerca». Le partecipazioni già avviate mantengono il flag test.

## Struttura

```
src/config/        questionario versionato (q-v1), dataset demo (demo-v1), nome progetto
src/lib/flow.ts    regole di percorso, esclusività, limiti (replicate in SQL)
src/lib/stats.ts   KPI, funnel, distribuzioni — un'unica implementazione per dashboard ed export
src/lib/backend/   client Supabase via fetch (Auth + RPC), anteprima locale, fixture di esempio
src/public/        introduzione, domande, demo, email, informativa
src/admin/         area creator
supabase/          migrazioni, test SQL (stub di auth solo per test locali)
tests/             test unitari (node:test) ed end-to-end (Playwright)
```

Per aggiornare domande o casi demo crea una **nuova versione** in `src/config`, poi `npm run gen:seed` per rigenerare la migrazione di seed (le versioni precedenti restano per i report storici).

## Verifiche incluse

- `npm test` — percorsi Q2/A0, esclusive, Q8, aperte, cambio ramo, calcoli della demo, KPI/denominatori, CSV (formule, accenti, multilinea), client API (rete, errori, refresh token).
- `npm run test:sql` — migrazioni e ~70 controlli su PostgreSQL locale: isolamento tra partecipazioni, RLS, ruoli, idempotenza, invio atomico, email/consenso/revoca, cancellazione.
- `tests/e2e/journey.py` — percorso completo nell’anteprima a 360–390, 768 e 1440 px.
- `tests/e2e/connected.sh` — percorso collegato: frontend → gateway di test in stile Supabase → funzioni SQL reali.
