import type { AnswerValue, StepId } from '../flow';
import { SupabaseRest } from './supabaseRest';
import {
  BackendError,
  type AccessList, type AdminApi, type ContactRow, type Dataset, type DemoAction,
  type ParticipationState, type PublicBackend, type PublicConfig, type Role, type ServerFilters,
} from './types';

interface RawConfig {
  project_name: string; mode: 'test' | 'research'; questionnaire_version: string; demo_version: string;
  privacy_version: string; consent_version: string; consent_text: string; privacy: PublicConfig['privacy'];
}

export class SupabasePublicBackend implements PublicBackend {
  kind = 'supabase' as const;
  private client: SupabaseRest;

  constructor(url: string, anonKey: string, fetchFn?: typeof fetch) {
    this.client = new SupabaseRest(url, anonKey, 'tr.participant.session', fetchFn);
  }

  async getConfig(): Promise<PublicConfig> {
    const c = await this.client.rpc<RawConfig | null>('get_public_config', {});
    if (!c) throw new BackendError('not_configured', 'Configurazione mancante');
    return {
      projectName: c.project_name, mode: c.mode, questionnaireVersion: c.questionnaire_version,
      demoVersion: c.demo_version, privacyVersion: c.privacy_version, consentVersion: c.consent_version,
      consentText: c.consent_text, privacy: c.privacy,
    };
  }

  async start(clientKey: string): Promise<ParticipationState> {
    await this.client.ensureAnonymous();
    return this.client.rpc<ParticipationState>('start_participation', { p_client_key: clientKey }, { requireSession: true });
  }

  async load(id: string): Promise<ParticipationState> {
    if (!this.client.session) throw new BackendError('not_found', 'Nessuna sessione');
    return this.client.rpc<ParticipationState>('get_participation', { p_id: id }, { requireSession: true });
  }

  async saveStep(id: string, answers: Record<string, AnswerValue | null>, nextStep: StepId) {
    const r = await this.client.rpc<{ path: ParticipationState['path'] }>('save_step', { p_id: id, p_answers: answers, p_next_step: nextStep }, { requireSession: true });
    return { path: r.path };
  }

  async demoStart(id: string, clientKey: string, caseId: string, need: string, referenceDate: string) {
    const r = await this.client.rpc<{ exploration_id: string }>('demo_start', {
      p_id: id, p_client_key: clientKey, p_case_id: caseId, p_need: need, p_reference_date: referenceDate,
    }, { requireSession: true });
    return r.exploration_id;
  }

  async demoAction(id: string, explorationId: string, action: DemoAction, alt?: string) {
    await this.client.rpc('demo_action', { p_id: id, p_exploration_id: explorationId, p_action: action, p_alt: alt ?? null }, { requireSession: true });
  }

  async submitFinal(id: string, f1ExplorationId: string, answers: Record<string, AnswerValue | null>) {
    const r = await this.client.rpc<{ code: string }>('submit_final', { p_id: id, p_f1_exploration_id: f1ExplorationId, p_answers: answers }, { requireSession: true });
    return { code: r.code };
  }

  async emailShown(id: string) {
    await this.client.rpc('email_screen_shown', { p_id: id }, { requireSession: true });
  }

  async subscribe(id: string, email: string, consent: boolean, consentVersion: string) {
    await this.client.rpc('subscribe_email', { p_id: id, p_email: email, p_consent: consent, p_consent_version: consentVersion }, { requireSession: true });
  }

  async decline(id: string) {
    await this.client.rpc('decline_email', { p_id: id }, { requireSession: true });
  }
}

export class SupabaseAdminApi implements AdminApi {
  kind = 'supabase' as const;
  private client: SupabaseRest;

  constructor(url: string, anonKey: string, private redirectBase: string, fetchFn?: typeof fetch) {
    // sessione amministrativa separata da quella anonima usata per il questionario
    this.client = new SupabaseRest(url, anonKey, 'tr.admin.session', fetchFn);
  }

  sessionEmail() { return this.client.session?.user?.email ?? null; }
  async signIn(email: string, password: string) { await this.client.signInWithPassword(email.trim(), password); }
  signUp(email: string, password: string) { return this.client.signUp(email.trim(), password, this.redirectBase); }
  recover(email: string) { return this.client.recover(email.trim(), this.redirectBase); }
  updatePassword(password: string) { return this.client.updatePassword(password); }
  consumeRecoveryLink() {
    if (typeof location === 'undefined' || !location.hash.includes('access_token=')) return false;
    const r = this.client.consumeHashSession(location.hash);
    history.replaceState(null, '', location.pathname + location.search);
    return r?.type === 'recovery';
  }
  signOut() { return this.client.signOut(); }

  async whoami() {
    if (!this.client.session) return { email: null, role: null };
    const r = await this.client.rpc<{ email: string | null; role: Role | null }>('admin_whoami', {}, { requireSession: true });
    return { email: r.email, role: r.role };
  }

  dataset(f: ServerFilters) {
    return this.client.rpc<Dataset>('admin_dataset', {
      p_from: f.from, p_to: f.to, p_include_test: f.includeTest, p_include_research: f.includeResearch, p_version: f.version,
    }, { requireSession: true });
  }
  contacts() { return this.client.rpc<ContactRow[]>('admin_contacts', {}, { requireSession: true }); }
  async revokeContact(id: string, note: string) { await this.client.rpc('admin_revoke_contact', { p_contact_id: id, p_note: note || null }, { requireSession: true }); }
  async deleteContact(id: string) { await this.client.rpc('admin_delete_contact', { p_contact_id: id }, { requireSession: true }); }
  async deleteParticipation(id: string) { await this.client.rpc('admin_delete_participation', { p_id: id }, { requireSession: true }); }
  applyRetention(beforeISO: string) {
    return this.client.rpc<{ participations_deleted: number; orphan_contacts_deleted: number }>('admin_apply_retention', { p_before: beforeISO }, { requireSession: true });
  }
  async updateConfig(patch: Partial<Record<string, string>>) { await this.client.rpc('admin_update_config', { p_patch: patch }, { requireSession: true }); }
  async setMode(mode: 'test' | 'research') { await this.client.rpc('admin_set_mode', { p_mode: mode }, { requireSession: true }); }
  listAccess() { return this.client.rpc<AccessList>('admin_list_access', {}, { requireSession: true }); }
  async invite(email: string) { await this.client.rpc('admin_invite_creator', { p_email: email }, { requireSession: true }); }
  async removeAccess(t: { userId?: string; email?: string }) {
    await this.client.rpc('admin_remove_access', { p_user_id: t.userId ?? null, p_email: t.email ?? null }, { requireSession: true });
  }
}
