// Area privata in ANTEPRIMA LOCALE: fixture deterministiche, sempre etichettate «Dati di esempio».
// Non sono mai inviate a un backend e non confluiscono nella ricerca.

import { QUESTIONNAIRE_V1, type Question } from '../../config/questionnaire';
import { DEMO_CASES, DEMO_VERSION, type NeedId } from '../../config/demoCases';
import { PROJECT, CONSENT_TEXT } from '../../config/project';
import { isApplicable, pathOf, type Answers } from '../flow';
import {
  BackendError, type AccessList, type AdminApi, type AppConfigRow, type ContactRow, type Dataset,
  type DatasetParticipation, type EventType, type ServerFilters,
} from './types';

function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickAnswer(q: Question, r: () => number) {
  const opts = q.options ?? [];
  if (q.type === 'single') return { kind: 'single' as const, value: opts[Math.floor(r() * opts.length)].id };
  const nonEx = opts.filter((o) => !o.exclusive);
  if (r() < 0.12) {
    const ex = opts.filter((o) => o.exclusive);
    return { kind: 'multi' as const, values: [ex[Math.floor(r() * ex.length)].id] };
  }
  const n = Math.min(q.max ?? 3, 1 + Math.floor(r() * 3));
  const vals = new Set<string>();
  while (vals.size < n) vals.add(nonEx[Math.floor(r() * nonEx.length)].id);
  return { kind: 'multi' as const, values: [...vals] };
}

const OPEN_SAMPLES = [
  'Le condizioni erano in un PDF allegato alla mail, ma l’app diceva una cosa diversa.',
  'Ho chiamato l’assistenza due volte e ho ricevuto risposte diverse sul rimborso.',
  'Non capivo se il voucher valesse quanto il rimborso.',
  'Avrei voluto sapere prima entro quando potevo cancellare gratis.',
];

export function buildSampleDataset(now = new Date()): { ds: Dataset; contacts: ContactRow[] } {
  const r = rng(20261026);
  const ps: DatasetParticipation[] = [];
  const emails = ['marta.r@esempio.test', 'luca@esempio.test', 'giulia.b@esempio.test', 'tommaso@esempio.test', 'sara.n@esempio.test', 'ale.f@esempio.test', 'chiara@esempio.test', 'p.romano@esempio.test', 'elena@esempio.test'];
  const contactMap = new Map<string, ContactRow>();
  for (let i = 0; i < 64; i++) {
    const started = new Date(now.getTime() - (r() * 20 + 0.02) * 86400000);
    const iso = (offMin: number) => new Date(started.getTime() + offMin * 60000).toISOString();
    const answers: Answers = {};
    const events: Partial<Record<EventType, string>> = { started: iso(0) };
    const isTest = i % 9 === 0;
    const depth = r(); // quanto avanti arriva la compilazione
    const q1 = QUESTIONNAIRE_V1.questions.find((q) => q.id === 'Q1')!;
    answers.Q1 = pickAnswer(q1, r);
    let step = 'Q2';
    if (depth > 0.06) {
      const q2v = r() < 0.58 ? ['yes_open', 'yes_once_closed', 'yes_many_closed'][Math.floor(r() * 3)] : r() < 0.7 ? 'no' : 'dont_remember';
      answers.Q2 = { kind: 'single', value: q2v };
      if (!q2v.startsWith('yes')) answers.A0 = { kind: 'single', value: r() < 0.12 ? 'never_purchased' : 'continue' };
      events.initial_done = iso(1);
      step = 'demo_intro';
      for (const q of QUESTIONNAIRE_V1.questions) {
        if (q.branch === 'common' || q.branch === 'alt_gate' || q.branch === 'feedback') continue;
        if (!isApplicable(q.id, QUESTIONNAIRE_V1, answers)) continue;
        if (q.type === 'text') { if (r() < 0.35) answers[q.id] = { kind: 'text', text: OPEN_SAMPLES[Math.floor(r() * OPEN_SAMPLES.length)] }; continue; }
        answers[q.id] = pickAnswer(q, r);
      }
    }
    const path = pathOf(answers);
    const explorations: DatasetParticipation['explorations'] = [];
    if (path && depth > 0.16) {
      const n = r() < 0.25 ? 2 : 1;
      for (let k = 0; k < n; k++) {
        const c = DEMO_CASES[Math.floor(r() * DEMO_CASES.length)];
        const needs = Object.keys(c.needs) as NeedId[];
        const need = needs[Math.floor(r() * needs.length)];
        const alts = c.needs[need]!;
        const opened = depth > 0.24 ? alts.filter(() => r() < 0.6) : [];
        if (depth > 0.24 && opened.length === 0) opened.push(alts[0]);
        const choice = opened.length && r() < 0.7 ? (r() < 0.2 ? 'none' : opened[0]) : null;
        const prov = choice && choice !== 'none' && c.alternatives.find((a) => a.id === choice)?.provider && r() < 0.5;
        explorations.push({
          id: `ex-${i}-${k}`, seq: k + 1, category: c.category, case_id: c.id, case_version: DEMO_VERSION, need_id: need,
          reference_date: started.toISOString().slice(0, 10), started_at: iso(4 + k * 3), details_opened: opened,
          first_detail_at: opened.length ? iso(5 + k * 3) : null, choice, choice_at: choice ? iso(6 + k * 3) : null,
          provider_clicked: Boolean(prov), provider_alt: prov ? choice : null, provider_clicked_at: prov ? iso(6 + k * 3) : null,
          ended_at: depth > 0.4 ? iso(8 + k * 3) : null,
        });
      }
      events.demo_started = iso(4);
      step = 'demo';
      if (explorations.some((e) => e.details_opened.length)) events.demo_explored = iso(5);
    }
    let status: 'in_progress' | 'completed' = 'in_progress';
    let completedAt: string | null = null;
    let f1: string | null = null;
    let emailScreen: DatasetParticipation['email_screen'] = 'not_shown';
    let subscription: DatasetParticipation['subscription'] = null;
    const explored = [...explorations].reverse().find((e) => e.details_opened.length);
    if (depth > 0.3 && explored) {
      for (const qid of ['F1a', 'F1b', 'F2', 'F3']) answers[qid] = pickAnswer(QUESTIONNAIRE_V1.questions.find((q) => q.id === qid)!, r);
      if (answers.F3?.kind === 'single' && answers.F3.value === 'other' && r() < 0.6) answers.F3_other = { kind: 'text', text: 'Vorrei sapere da dove arrivano le condizioni.' };
      status = 'completed';
      completedAt = iso(12);
      f1 = explored.id;
      step = 'email';
      events.feedback_submitted = completedAt;
      events.email_shown = iso(12.2);
      const d = r();
      if (d < 0.32) {
        emailScreen = 'subscribed';
        events.email_subscribed = iso(13);
        const email = emails[Math.floor(r() * emails.length)];
        let c = contactMap.get(email);
        if (!c) {
          c = { id: `ct-${contactMap.size + 1}`, email, status: email.startsWith('luca') ? 'revoked' : 'active', verification: 'unverified', created_at: iso(13), revoked_at: email.startsWith('luca') ? iso(60) : null, revoke_note: email.startsWith('luca') ? 'Richiesta di revoca ricevuta via email (esempio)' : null, requests: [] };
          contactMap.set(email, c);
        }
        c.requests.push({ participation_id: `p-${i}`, code: '', is_test: isTest, path, consented_at: iso(13), consent_version: PROJECT.consentVersion, contact_status_at_request: c.requests.length ? 'active' : 'new' });
        subscription = { contact_id: c.id, email, contact_status: c.status, verification: 'unverified', consented_at: iso(13), consent_version: PROJECT.consentVersion, consent_text: CONSENT_TEXT, contact_status_at_request: 'new' };
      } else if (d < 0.7) {
        emailScreen = 'declined';
        events.email_declined = iso(13);
      } else emailScreen = 'shown';
    }
    const ans: DatasetParticipation['answers'] = [];
    for (const q of QUESTIONNAIRE_V1.questions) {
      const v = answers[q.id];
      if (v) {
        ans.push({ question_id: q.id, status: 'answered', value_single: v.kind === 'single' ? v.value : null, value_multi: v.kind === 'multi' ? v.values : null, value_text: v.kind === 'text' ? v.text : null, confirmed_at: iso(2) });
      } else if (status === 'completed' && !isApplicable(q.id, QUESTIONNAIRE_V1, answers)) {
        ans.push({ question_id: q.id, status: 'not_applicable', value_single: null, value_multi: null, value_text: null, confirmed_at: iso(12) });
      }
    }
    const code = 'EX-' + (1000 + i * 37).toString(36).toUpperCase().padStart(4, '0');
    for (const c of contactMap.values()) for (const rq of c.requests) if (rq.participation_id === `p-${i}`) rq.code = code;
    ps.push({
      id: `p-${i}`, code, started_at: iso(0), completed_at: completedAt,
      last_activity_at: completedAt ?? iso(depth * 10), questionnaire_version: QUESTIONNAIRE_V1.version, demo_version: DEMO_VERSION,
      privacy_version: PROJECT.privacyVersion, path, current_step: step, status, is_test: isTest, email_screen: emailScreen,
      f1_exploration_id: f1, answers: ans, explorations, events, subscription,
    });
  }
  ps.sort((a, b) => b.started_at.localeCompare(a.started_at));
  const config: AppConfigRow = {
    project_name: PROJECT.name, mode: 'test', questionnaire_version: QUESTIONNAIRE_V1.version, demo_version: DEMO_VERSION,
    privacy_version: PROJECT.privacyVersion, consent_version: PROJECT.consentVersion,
    privacy_controller: null, privacy_contact: null, privacy_legal_basis: null, privacy_retention: null,
    privacy_recipients: null, privacy_extra: null, updated_at: now.toISOString(),
  };
  return {
    ds: {
      generated_at: now.toISOString(), role: 'owner', config, sample: true,
      questionnaire_versions: [{ version: QUESTIONNAIRE_V1.version, definition: QUESTIONNAIRE_V1 }],
      demo_versions: [{ version: DEMO_VERSION, definition: { version: DEMO_VERSION, cases: DEMO_CASES } }],
      participations: ps,
    },
    contacts: [...contactMap.values()],
  };
}

export class LocalAdminApi implements AdminApi {
  kind = 'local' as const;
  private signedIn = false;
  private data = buildSampleDataset();
  private access: AccessList = {
    roles: [{ user_id: 'owner-esempio', email: 'owner@esempio.test', role: 'owner', granted_at: new Date().toISOString() }],
    invites: [],
  };

  sessionEmail() { return this.signedIn ? 'anteprima@esempio.test' : null; }
  async signIn() { this.signedIn = true; }
  async signUp(): Promise<'signed_in'> { this.signedIn = true; return 'signed_in'; }
  async recover() { /* nessun invio in anteprima */ }
  async updatePassword() { /* nessuna password in anteprima */ }
  consumeRecoveryLink() { return false; }
  async signOut() { this.signedIn = false; }
  async whoami() { return this.signedIn ? { email: 'anteprima@esempio.test', role: 'owner' as const } : { email: null, role: null }; }

  async dataset(f: ServerFilters): Promise<Dataset> {
    const ps = this.data.ds.participations.filter((p) =>
      (!f.from || p.started_at >= f.from) && (!f.to || p.started_at < f.to) &&
      (!f.version || p.questionnaire_version === f.version) &&
      ((p.is_test && f.includeTest) || (!p.is_test && f.includeResearch)));
    await new Promise((res) => setTimeout(res, 180));
    return structuredClone({ ...this.data.ds, generated_at: new Date().toISOString(), participations: ps });
  }

  async contacts() { return structuredClone(this.data.contacts); }

  async revokeContact(id: string, note: string) {
    const c = this.data.contacts.find((x) => x.id === id);
    if (!c) throw new BackendError('not_found', 'contact');
    c.status = 'revoked'; c.revoked_at = new Date().toISOString(); c.revoke_note = note || null;
    for (const p of this.data.ds.participations) if (p.subscription?.contact_id === id) p.subscription.contact_status = 'revoked';
  }
  async deleteContact(id: string) {
    this.data.contacts = this.data.contacts.filter((c) => c.id !== id);
    for (const p of this.data.ds.participations) if (p.subscription?.contact_id === id) p.subscription = null;
  }
  async deleteParticipation(id: string) {
    const p = this.data.ds.participations.find((x) => x.id === id);
    this.data.ds.participations = this.data.ds.participations.filter((x) => x.id !== id);
    if (p?.subscription) {
      const c = this.data.contacts.find((x) => x.id === p.subscription!.contact_id);
      if (c) {
        c.requests = c.requests.filter((r) => r.participation_id !== id);
        if (!c.requests.length) this.data.contacts = this.data.contacts.filter((x) => x !== c);
      }
    }
  }
  async applyRetention(before: string) {
    const old = this.data.ds.participations.filter((p) => p.started_at < before);
    for (const p of old) await this.deleteParticipation(p.id);
    return { participations_deleted: old.length, orphan_contacts_deleted: 0 };
  }
  async updateConfig(patch: Partial<Record<string, string>>) {
    Object.assign(this.data.ds.config, Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, v?.trim() || null])));
  }
  async setMode(mode: 'test' | 'research') {
    const c = this.data.ds.config;
    if (mode === 'research' && (!c.privacy_controller || !c.privacy_contact || !c.privacy_legal_basis || !c.privacy_retention)) {
      throw new BackendError('privacy_incomplete', 'privacy');
    }
    c.mode = mode;
  }
  async listAccess() { return structuredClone(this.access); }
  async invite(email: string) {
    const e = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)) throw new BackendError('invalid_email', 'email');
    if (!this.access.invites.some((i) => i.email === e)) this.access.invites.push({ email: e, invited_at: new Date().toISOString(), claimed_at: null });
  }
  async removeAccess(t: { userId?: string; email?: string }) {
    if (t.userId === 'owner-esempio') throw new BackendError('cannot_remove_self', 'self');
    this.access.roles = this.access.roles.filter((r) => r.user_id !== t.userId);
    this.access.invites = this.access.invites.filter((i) => i.email !== t.email);
  }
}
