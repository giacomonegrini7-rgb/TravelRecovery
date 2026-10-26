import type { AnswerValue, Answers, Path, StepId } from '../flow';

export type Mode = 'local' | 'test' | 'research';

export interface PrivacyFields {
  controller: string | null;
  contact: string | null;
  legal_basis: string | null;
  retention: string | null;
  recipients: string | null;
  extra: string | null;
}

export interface PublicConfig {
  projectName: string;
  mode: Mode;
  questionnaireVersion: string;
  demoVersion: string;
  privacyVersion: string;
  consentVersion: string;
  consentText: string;
  privacy: PrivacyFields;
}

export interface ExplorationState {
  id: string;
  seq: number;
  category: string;
  case_id: string;
  need_id: string;
  reference_date: string;
  details_opened: string[];
  choice: string | null;
  provider_clicked: boolean;
}

export type EmailScreen = 'not_shown' | 'shown' | 'declined' | 'subscribed';

export interface ParticipationState {
  id: string;
  code: string;
  status: 'in_progress' | 'completed';
  path: Path | null;
  current_step: StepId;
  is_test: boolean;
  email_screen: EmailScreen;
  f1_exploration_id: string | null;
  answers: Answers;
  explorations: ExplorationState[];
}

export type DemoAction = 'open_detail' | 'choose' | 'provider_click' | 'end';

/** Errore applicativo. `retryable` indica che la stessa operazione può essere ripetuta senza duplicati. */
export class BackendError extends Error {
  constructor(
    public code: string,
    message: string,
    public retryable = false,
    public detail?: string,
  ) {
    super(message);
    this.name = 'BackendError';
  }
}

export interface PublicBackend {
  kind: 'local' | 'supabase';
  getConfig(): Promise<PublicConfig>;
  start(clientKey: string): Promise<ParticipationState>;
  load(id: string): Promise<ParticipationState>;
  saveStep(id: string, answers: Record<string, AnswerValue | null>, nextStep: StepId): Promise<{ path: Path | null }>;
  demoStart(id: string, clientKey: string, caseId: string, need: string, referenceDate: string): Promise<string>;
  demoAction(id: string, explorationId: string, action: DemoAction, alt?: string): Promise<void>;
  submitFinal(id: string, f1ExplorationId: string, answers: Record<string, AnswerValue | null>): Promise<{ code: string }>;
  emailShown(id: string): Promise<void>;
  subscribe(id: string, email: string, consent: boolean, consentVersion: string): Promise<void>;
  decline(id: string): Promise<void>;
}

// ——— Area privata ———

export type Role = 'owner' | 'creator';

export interface DatasetAnswer {
  question_id: string;
  status: 'answered' | 'not_applicable';
  value_single: string | null;
  value_multi: string[] | null;
  value_text: string | null;
  confirmed_at: string;
}

export interface DatasetExploration {
  id: string;
  seq: number;
  category: string;
  case_id: string;
  case_version: string;
  need_id: string;
  reference_date: string;
  started_at: string;
  details_opened: string[];
  first_detail_at: string | null;
  choice: string | null;
  choice_at: string | null;
  provider_clicked: boolean;
  provider_alt: string | null;
  provider_clicked_at: string | null;
  ended_at: string | null;
}

export interface DatasetSubscription {
  contact_id: string;
  email: string;
  contact_status: 'active' | 'revoked';
  verification: 'unverified' | 'verified';
  consented_at: string;
  consent_version: string;
  consent_text: string;
  contact_status_at_request: 'new' | 'active' | 'revoked';
}

export type EventType =
  | 'started' | 'initial_done' | 'demo_started' | 'demo_explored'
  | 'feedback_submitted' | 'email_shown' | 'email_subscribed' | 'email_declined';

export interface DatasetParticipation {
  id: string;
  code: string;
  started_at: string;
  completed_at: string | null;
  last_activity_at: string;
  questionnaire_version: string;
  demo_version: string;
  privacy_version: string;
  path: Path | null;
  current_step: string;
  status: 'in_progress' | 'completed';
  is_test: boolean;
  email_screen: EmailScreen;
  f1_exploration_id: string | null;
  answers: DatasetAnswer[];
  explorations: DatasetExploration[];
  events: Partial<Record<EventType, string>>;
  subscription: DatasetSubscription | null;
}

export interface AppConfigRow {
  project_name: string;
  mode: 'test' | 'research';
  questionnaire_version: string;
  demo_version: string;
  privacy_version: string;
  consent_version: string;
  privacy_controller: string | null;
  privacy_contact: string | null;
  privacy_legal_basis: string | null;
  privacy_retention: string | null;
  privacy_recipients: string | null;
  privacy_extra: string | null;
  updated_at: string;
}

export interface Dataset {
  generated_at: string;
  role: Role;
  config: AppConfigRow;
  questionnaire_versions: { version: string; definition: unknown }[];
  demo_versions: { version: string; definition: unknown }[];
  participations: DatasetParticipation[];
  /** true se i dati sono fixture dimostrative (solo anteprima locale). */
  sample?: boolean;
}

export interface ServerFilters {
  from: string | null; // ISO
  to: string | null; // ISO (esclusivo)
  includeTest: boolean;
  includeResearch: boolean;
  version: string | null;
}

export interface ContactRow {
  id: string;
  email: string;
  status: 'active' | 'revoked';
  verification: 'unverified' | 'verified';
  created_at: string;
  revoked_at: string | null;
  revoke_note: string | null;
  requests: {
    participation_id: string;
    code: string;
    is_test: boolean;
    path: Path | null;
    consented_at: string;
    consent_version: string;
    contact_status_at_request: 'new' | 'active' | 'revoked';
  }[];
}

export interface AccessList {
  roles: { user_id: string; email: string | null; role: Role; granted_at: string }[];
  invites: { email: string; invited_at: string; claimed_at: string | null }[];
}

export interface AdminApi {
  kind: 'local' | 'supabase';
  sessionEmail(): string | null;
  signIn(email: string, password: string): Promise<void>;
  signUp(email: string, password: string): Promise<'confirm_email' | 'signed_in'>;
  recover(email: string): Promise<void>;
  updatePassword(password: string): Promise<void>;
  /** Consuma un link di recupero (hash dell'URL). true se è stato trovato. */
  consumeRecoveryLink(): boolean;
  signOut(): Promise<void>;
  whoami(): Promise<{ email: string | null; role: Role | null }>;
  dataset(f: ServerFilters): Promise<Dataset>;
  contacts(): Promise<ContactRow[]>;
  revokeContact(id: string, note: string): Promise<void>;
  deleteContact(id: string): Promise<void>;
  deleteParticipation(id: string): Promise<void>;
  applyRetention(beforeISO: string): Promise<{ participations_deleted: number; orphan_contacts_deleted: number }>;
  updateConfig(patch: Partial<Record<string, string>>): Promise<void>;
  setMode(mode: 'test' | 'research'): Promise<void>;
  listAccess(): Promise<AccessList>;
  invite(email: string): Promise<void>;
  removeAccess(target: { userId?: string; email?: string }): Promise<void>;
}

export const ERROR_TEXT: Record<string, string> = {
  network: 'Connessione non riuscita. Controlla la rete e riprova: la risposta non è ancora stata salvata.',
  timeout: 'Il server non ha risposto in tempo. Riprova: la risposta non è ancora stata salvata.',
  server: 'Il servizio non è disponibile in questo momento. Riprova tra poco.',
  rate_limited: 'Troppe richieste in poco tempo. Attendi qualche minuto e riprova.',
  auth: 'La sessione non è più valida. Ricarica la pagina per continuare.',
  auth_required: 'La sessione non è più valida. Ricarica la pagina per continuare.',
  not_found: 'Questa compilazione non è disponibile in questo browser.',
  forbidden: 'Non hai l’autorizzazione per questa operazione.',
  invalid_email: 'Controlla l’indirizzo email: sembra incompleto o non valido.',
  consent_required: 'Per iscriverti seleziona la casella del consenso.',
  incomplete: 'Mancano alcune risposte obbligatorie. Torna indietro per completarle.',
  demo_not_explored: 'Apri il dettaglio di almeno un’alternativa nella demo prima di proseguire.',
  already_completed: 'Questa compilazione è già stata inviata.',
  privacy_incomplete: 'Completa i campi essenziali dell’informativa prima di attivare la ricerca.',
  cannot_remove_self: 'Non puoi rimuovere il tuo stesso accesso di owner.',
  not_configured: 'Il backend non è ancora configurato.',
};

export function errorText(e: unknown): string {
  if (e instanceof BackendError) return ERROR_TEXT[e.code] ?? e.message;
  return 'Si è verificato un errore imprevisto. Riprova.';
}
