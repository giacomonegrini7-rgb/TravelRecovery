// Genera la migrazione di seed con le definizioni versionate (questionario, demo, consenso)
// a partire dalla configurazione TypeScript, unica fonte di verità.
// Uso: npm run gen:seed
import { writeFileSync } from 'node:fs';
import { QUESTIONNAIRE_V1 } from '../src/config/questionnaire';
import { DEMO_CASES, DEMO_VERSION } from '../src/config/demoCases';
import { PROJECT, CONSENT_TEXT } from '../src/config/project';

const q = (s: string) => `$tr$${s}$tr$`;
const demo = { version: DEMO_VERSION, cases: DEMO_CASES };

const sql = `-- GENERATO da scripts/gen-seed.ts — non modificare a mano.
-- Definizioni versionate: una nuova versione va AGGIUNTA, non sovrascritta.

insert into public.questionnaire_versions (version, definition)
values (${q(QUESTIONNAIRE_V1.version)}, ${q(JSON.stringify(QUESTIONNAIRE_V1))}::jsonb)
on conflict (version) do nothing;

insert into public.demo_versions (version, definition)
values (${q(DEMO_VERSION)}, ${q(JSON.stringify(demo))}::jsonb)
on conflict (version) do nothing;

insert into public.consent_versions (version, text)
values (${q(PROJECT.consentVersion)}, ${q(CONSENT_TEXT)})
on conflict (version) do nothing;

insert into public.app_config (id, project_name, mode, questionnaire_version, demo_version, privacy_version, consent_version)
values (1, ${q(PROJECT.name)}, 'test', ${q(QUESTIONNAIRE_V1.version)}, ${q(DEMO_VERSION)}, ${q(PROJECT.privacyVersion)}, ${q(PROJECT.consentVersion)})
on conflict (id) do nothing;
`;

const out = new URL('../supabase/migrations/20261026000004_seed_v1.sql', import.meta.url);
writeFileSync(out, sql);
console.log('Seed scritto in', out.pathname);
