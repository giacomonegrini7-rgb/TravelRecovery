// Configurazione centrale del progetto. Il nome è provvisorio: cambialo qui.
// Nella versione collegata, il nome mostrato può essere sovrascritto dalle
// impostazioni del database (app_config.project_name).

export const PROJECT = {
  name: 'Travel Recovery',
  questionnaireVersion: 'q-v1',
  demoVersion: 'demo-v1',
  privacyVersion: 'privacy-v1',
  consentVersion: 'consent-v1',
  timezone: 'Europe/Rome',
  locale: 'it-IT',
} as const;

export const CONSENT_TEXT =
  'Desidero ricevere via email aggiornamenti sul lancio di Travel Recovery. Posso revocare il consenso in qualsiasi momento.';

export const OPEN_TEXT_MAX = 1200;
export const F3_OTHER_MAX = 300;

/** Variabili pubbliche (previste dal provider) lette dal bundle. Nessun segreto. */
export interface PublicEnv {
  supabaseUrl: string | null;
  supabaseAnonKey: string | null;
  routerMode: 'history' | 'hash';
}

export function readEnv(): PublicEnv {
  // import.meta.env è sostituito a build time (Vite / esbuild define)
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
  const url = (env.VITE_SUPABASE_URL ?? '').trim();
  const key = (env.VITE_SUPABASE_ANON_KEY ?? '').trim();
  return {
    supabaseUrl: url || null,
    supabaseAnonKey: key || null,
    routerMode: env.VITE_ROUTER_MODE === 'hash' ? 'hash' : 'history',
  };
}
