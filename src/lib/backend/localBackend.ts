// Backend dell'ANTEPRIMA LOCALE: nessun servizio collegato, nessun dato inviato al gruppo.
// Applica le stesse regole di validazione del server per rendere l'anteprima fedele,
// e conserva lo stato solo in questo browser per recuperare una sessione interrotta.

import { QUESTIONNAIRES, getQuestion } from '../../config/questionnaire';
import { DEMO_CASES } from '../../config/demoCases';
import { PROJECT, CONSENT_TEXT } from '../../config/project';
import { isApplicable, missingRequired, pathOf, pruneInapplicable, validateAnswer, type AnswerValue, type Answers, type StepId } from '../flow';
import { BackendError, type DemoAction, type ParticipationState, type PublicBackend, type PublicConfig } from './types';

const KEY = 'tr.local.preview.v1';

interface Store { participations: Record<string, ParticipationState & { client_key: string }> }

function load(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as Store;
  } catch { /* storage non disponibile */ }
  return { participations: {} };
}

function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

const def = QUESTIONNAIRES[PROJECT.questionnaireVersion];

export class LocalPublicBackend implements PublicBackend {
  kind = 'local' as const;
  private store: Store = load();

  private persist() {
    try { localStorage.setItem(KEY, JSON.stringify(this.store)); } catch { /* ignorato in anteprima */ }
  }

  private get(id: string) {
    const p = this.store.participations[id];
    if (!p) throw new BackendError('not_found', 'not found');
    return p;
  }

  async getConfig(): Promise<PublicConfig> {
    return {
      projectName: PROJECT.name, mode: 'local', questionnaireVersion: PROJECT.questionnaireVersion,
      demoVersion: PROJECT.demoVersion, privacyVersion: PROJECT.privacyVersion, consentVersion: PROJECT.consentVersion,
      consentText: CONSENT_TEXT,
      privacy: { controller: null, contact: null, legal_basis: null, retention: null, recipients: null, extra: null },
    };
  }

  async start(clientKey: string) {
    const existing = Object.values(this.store.participations).find((p) => p.client_key === clientKey);
    if (existing) return structuredClone(existing);
    const id = uuid();
    const p: ParticipationState & { client_key: string } = {
      id, client_key: clientKey, code: 'ANTEPRIMA', status: 'in_progress', path: null, current_step: 'Q1',
      is_test: true, email_screen: 'not_shown', f1_exploration_id: null, answers: {}, explorations: [],
    };
    this.store.participations[id] = p;
    this.persist();
    return structuredClone(p);
  }

  async load(id: string) { return structuredClone(this.get(id)); }

  private apply(p: ParticipationState, answers: Record<string, AnswerValue | null>) {
    const next: Answers = { ...p.answers };
    for (const [qid, v] of Object.entries(answers)) {
      const q = getQuestion(def, qid);
      if (v === null || (v.kind === 'text' && v.text.trim() === '')) { delete next[qid]; continue; }
      const err = validateAnswer(q, v);
      if (err) throw new BackendError('invalid_answer', err);
      next[qid] = v.kind === 'text' ? { kind: 'text', text: v.text.trim() } : v;
    }
    for (const qid of Object.keys(answers)) {
      if (next[qid] && !isApplicable(qid, def, next)) throw new BackendError('not_applicable', qid);
    }
    p.answers = pruneInapplicable(def, next);
    p.path = pathOf(p.answers);
  }

  async saveStep(id: string, answers: Record<string, AnswerValue | null>, nextStep: StepId) {
    const p = this.get(id);
    if (p.status === 'completed') throw new BackendError('already_completed', 'completed');
    this.apply(p, answers);
    p.current_step = nextStep;
    this.persist();
    return { path: p.path };
  }

  async demoStart(id: string, clientKey: string, caseId: string, need: string, referenceDate: string) {
    const p = this.get(id);
    const ex = p.explorations.find((e) => (e as unknown as { client_key?: string }).client_key === clientKey);
    if (ex) return ex.id;
    const c = DEMO_CASES.find((x) => x.id === caseId);
    if (!c || !(need in c.needs)) throw new BackendError('unknown_case', 'case');
    const e = {
      id: uuid(), client_key: clientKey, seq: p.explorations.length + 1, category: c.category, case_id: c.id,
      need_id: need, reference_date: referenceDate, details_opened: [] as string[], choice: null, provider_clicked: false,
    };
    p.explorations.push(e);
    p.current_step = 'demo';
    this.persist();
    return e.id;
  }

  async demoAction(id: string, explorationId: string, action: DemoAction, alt?: string) {
    const p = this.get(id);
    const e = p.explorations.find((x) => x.id === explorationId);
    if (!e) throw new BackendError('not_found', 'exploration');
    if (action === 'open_detail' && alt && !e.details_opened.includes(alt)) e.details_opened.push(alt);
    if (action === 'choose') e.choice = alt ?? null;
    if (action === 'provider_click') e.provider_clicked = true;
    this.persist();
  }

  async submitFinal(id: string, f1ExplorationId: string, answers: Record<string, AnswerValue | null>) {
    const p = this.get(id);
    if (p.status === 'completed') return { code: p.code };
    const e = p.explorations.find((x) => x.id === f1ExplorationId);
    if (!e || e.details_opened.length === 0) throw new BackendError('demo_not_explored', 'demo');
    const snapshot = structuredClone(p.answers);
    this.apply(p, { F3_other: null, ...answers });
    const missing = missingRequired(def, p.answers);
    if (missing.length) { p.answers = snapshot; throw new BackendError('incomplete', 'incomplete', false, missing.join(',')); }
    p.status = 'completed';
    p.f1_exploration_id = f1ExplorationId;
    p.current_step = 'email';
    this.persist();
    return { code: p.code };
  }

  async emailShown(id: string) {
    const p = this.get(id);
    if (p.email_screen === 'not_shown') p.email_screen = 'shown';
    this.persist();
  }

  async subscribe(id: string, email: string, consent: boolean) {
    const p = this.get(id);
    if (!consent) throw new BackendError('consent_required', 'consent');
    const e = email.trim().toLowerCase();
    if (!/^[^\s@<>(),;:"[\]]+@[^\s@<>(),;:"[\]]+\.[^\s@<>(),;:"[\]]{2,}$/.test(e) || e.length > 254) throw new BackendError('invalid_email', 'email');
    // In anteprima l'indirizzo NON viene conservato: solo lo stato della schermata.
    p.email_screen = 'subscribed';
    this.persist();
  }

  async decline(id: string) {
    const p = this.get(id);
    if (p.email_screen !== 'subscribed') p.email_screen = 'declined';
    this.persist();
  }

  /** Solo anteprima: azzera i dati locali. */
  reset() {
    this.store = { participations: {} };
    this.persist();
  }
}
