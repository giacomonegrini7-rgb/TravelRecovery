// Calcolo deterministico di KPI, funnel e distribuzioni per la dashboard e per gli export.
// Un'unica implementazione garantisce che filtri e formule siano coerenti ovunque.

import type { Question, QuestionnaireDefinition } from '../config/questionnaire';
import { QUESTIONNAIRES } from '../config/questionnaire';
import { DEMO_CASES, type DemoCase } from '../config/demoCases';
import type { Dataset, DatasetAnswer, DatasetParticipation, EventType } from './backend/types';
import type { Path } from './flow';

export interface ClientFilters {
  path: 'all' | Path;
  category: 'all' | string;
}

export const PATH_LABEL: Record<Path, string> = {
  experience: 'Esperienza',
  alternative: 'Alternativo',
  never_purchased: 'Mai acquistato personalmente',
};

export function applyClientFilters(ps: DatasetParticipation[], f: ClientFilters): DatasetParticipation[] {
  return ps.filter((p) =>
    (f.path === 'all' || p.path === f.path) &&
    (f.category === 'all' || p.explorations.some((e) => e.category === f.category)));
}

// ——— Rapporti ———

export interface Ratio { num: number; den: number; pct: number | null }

export function ratio(num: number, den: number): Ratio {
  return { num, den, pct: den > 0 ? (num / den) * 100 : null };
}

export function fmtPct(p: number | null): string {
  if (p === null) return 'Non disponibile';
  return `${p.toLocaleString('it-IT', { maximumFractionDigits: p < 10 && p % 1 ? 1 : 0 })}%`;
}

export function fmtRatio(r: Ratio): string {
  if (r.pct === null) return `${r.num} su ${r.den} — Non disponibile`;
  return `${r.num} su ${r.den} — ${fmtPct(r.pct)}`;
}

// ——— KPI ———

const has = (p: DatasetParticipation, e: EventType) => Boolean(p.events?.[e]);

export interface Kpis {
  started: number;
  completed: number;
  completionRate: Ratio;
  emailShown: number;
  subscribed: number;
  subscribeAmongShown: Ratio;
  subscribeAmongCompleted: Ratio;
  uniqueEmails: number;
  activeContacts: number;
}

export function computeKpis(ps: DatasetParticipation[]): Kpis {
  const started = ps.filter((p) => has(p, 'started')).length;
  const completed = ps.filter((p) => p.status === 'completed').length;
  const emailShown = ps.filter((p) => has(p, 'email_shown')).length;
  const subscribed = ps.filter((p) => has(p, 'email_subscribed')).length;
  const emails = new Set<string>();
  const active = new Set<string>();
  for (const p of ps) {
    if (!p.subscription) continue;
    emails.add(p.subscription.email);
    if (p.subscription.contact_status === 'active') active.add(p.subscription.email);
  }
  return {
    started, completed, completionRate: ratio(completed, started),
    emailShown, subscribed,
    subscribeAmongShown: ratio(subscribed, emailShown),
    subscribeAmongCompleted: ratio(subscribed, completed),
    uniqueEmails: emails.size, activeContacts: active.size,
  };
}

// ——— Funnel ———

export const FUNNEL_STEPS: { id: EventType; label: string }[] = [
  { id: 'started', label: 'Avvio' },
  { id: 'initial_done', label: 'Domande iniziali completate' },
  { id: 'demo_started', label: 'Demo iniziata' },
  { id: 'demo_explored', label: 'Demo esplorata' },
  { id: 'feedback_submitted', label: 'Feedback inviato' },
  { id: 'email_shown', label: 'Invito email visualizzato' },
  { id: 'email_subscribed', label: 'Richiesta email registrata' },
];

export interface FunnelRow { id: EventType; label: string; count: number; fromStart: Ratio; lostFromPrevious: number }

export function computeFunnel(ps: DatasetParticipation[]): FunnelRow[] {
  const startN = ps.filter((p) => has(p, 'started')).length;
  let prev: number | null = null;
  return FUNNEL_STEPS.map((s) => {
    const count = ps.filter((p) => has(p, s.id)).length;
    const row = { ...s, count, fromStart: ratio(count, startN), lostFromPrevious: prev === null ? 0 : Math.max(0, prev - count) };
    prev = count;
    return row;
  });
}

/** Compilazioni non completate: in corso (attività recente) o inattive (abbandono solo ipotizzato). */
export function inProgressSplit(ps: DatasetParticipation[], now: Date, hours = 24) {
  const limit = now.getTime() - hours * 3600 * 1000;
  const open = ps.filter((p) => p.status !== 'completed');
  const recent = open.filter((p) => new Date(p.last_activity_at).getTime() >= limit).length;
  return { recent, inactive: open.length - recent, hours };
}

// ——— Distribuzioni delle risposte ———

export interface DistRow { optionId: string; label: string; count: number; pct: number | null }
export interface Distribution {
  question: Question;
  respondents: number;
  notApplicable: number;
  missing: number;
  rows: DistRow[];
  multi: boolean;
}

export type AnswerScope = 'completed' | 'all';

/** Definizione da usare per le etichette: la più recente tra le versioni presenti (le opzioni sono unite per ID). */
export function definitionsOf(ds: Dataset): Record<string, QuestionnaireDefinition> {
  const out: Record<string, QuestionnaireDefinition> = { ...QUESTIONNAIRES };
  for (const v of ds.questionnaire_versions ?? []) out[v.version] = v.definition as QuestionnaireDefinition;
  return out;
}

function mergedQuestion(defs: Record<string, QuestionnaireDefinition>, versions: string[], qid: string): Question | null {
  let base: Question | null = null;
  const seen = new Map<string, string>();
  for (const v of versions) {
    const q = defs[v]?.questions.find((x) => x.id === qid);
    if (!q) continue;
    base = q;
    for (const o of q.options ?? []) seen.set(o.id, o.label);
  }
  if (!base) return null;
  return { ...base, options: [...seen.entries()].map(([id, label]) => ({ id, label })) };
}

export function answerOf(p: DatasetParticipation, qid: string): DatasetAnswer | undefined {
  return p.answers.find((a) => a.question_id === qid);
}

export function distribution(
  ds: Dataset, ps: DatasetParticipation[], qid: string, scope: AnswerScope, opts: { f1Category?: string } = {},
): Distribution | null {
  const defs = definitionsOf(ds);
  const versions = [...new Set(ps.map((p) => p.questionnaire_version))].sort();
  if (versions.length === 0) versions.push(Object.keys(QUESTIONNAIRES)[0]);
  const q = mergedQuestion(defs, versions, qid);
  if (!q || q.type === 'text') return null;
  let pool = scope === 'completed' ? ps.filter((p) => p.status === 'completed') : ps;
  // F1 con filtro di categoria: solo i giudizi riferiti a un esempio di quella categoria
  if (opts.f1Category && (qid === 'F1a' || qid === 'F1b')) {
    pool = pool.filter((p) => p.explorations.find((e) => e.id === p.f1_exploration_id)?.category === opts.f1Category);
  }
  const counts = new Map<string, number>();
  let respondents = 0, notApplicable = 0, missing = 0;
  for (const p of pool) {
    const a = answerOf(p, qid);
    if (!a) { missing++; continue; }
    if (a.status === 'not_applicable') { notApplicable++; continue; }
    respondents++;
    const vals = a.value_multi ?? (a.value_single ? [a.value_single] : []);
    for (const v of vals) counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  const rows = (q.options ?? []).map((o) => {
    const c = counts.get(o.id) ?? 0;
    return { optionId: o.id, label: o.label, count: c, pct: respondents ? (c / respondents) * 100 : null };
  });
  return { question: q, respondents, notApplicable, missing, rows, multi: q.type === 'multi' };
}

/** "Utilità elevata percepita": (Molto + Estremamente utile) / risposte valutabili a F2 (esclude "Non saprei"). */
export function highUtility(ps: DatasetParticipation[]) {
  let high = 0, assessable = 0, cannotSay = 0;
  for (const p of ps.filter((x) => x.status === 'completed')) {
    const v = answerOf(p, 'F2')?.value_single;
    if (!v) continue;
    if (v === 'cannot_say') { cannotSay++; continue; }
    assessable++;
    if (v === 'very' || v === 'extremely') high++;
  }
  return { ratio: ratio(high, assessable), cannotSay };
}

// ——— Demo (conteggio per esplorazione, dichiarato) ———

export function caseOf(ds: Dataset, caseId: string, version: string): DemoCase | undefined {
  const dv = ds.demo_versions?.find((d) => d.version === version)?.definition as { cases?: DemoCase[] } | undefined;
  return dv?.cases?.find((c) => c.id === caseId) ?? DEMO_CASES.find((c) => c.id === caseId);
}

export function altLabel(ds: Dataset, caseId: string, version: string, altId: string | null): string {
  if (!altId) return '—';
  if (altId === 'none') return 'Nessuna di queste';
  const c = caseOf(ds, caseId, version);
  return c?.alternatives.find((a) => a.id === altId)?.title ?? altId;
}

export interface Tally { key: string; label: string; count: number }

export function demoStats(ds: Dataset, ps: DatasetParticipation[], category: string) {
  const ex = ps.flatMap((p) => p.explorations).filter((e) => category === 'all' || e.category === category);
  const byCat = new Map<string, number>();
  const opened = new Map<string, Tally>();
  const chosen = new Map<string, Tally>();
  let none = 0, providerClicks = 0, explored = 0;
  for (const e of ex) {
    byCat.set(e.category, (byCat.get(e.category) ?? 0) + 1);
    if (e.details_opened.length) explored++;
    for (const a of e.details_opened) {
      const k = `${e.case_id}:${a}`;
      const t = opened.get(k) ?? { key: k, label: `${altLabel(ds, e.case_id, e.case_version, a)} (${catLabel(e.category)})`, count: 0 };
      t.count++; opened.set(k, t);
    }
    if (e.choice === 'none') none++;
    else if (e.choice) {
      const k = `${e.case_id}:${e.choice}`;
      const t = chosen.get(k) ?? { key: k, label: `${altLabel(ds, e.case_id, e.case_version, e.choice)} (${catLabel(e.category)})`, count: 0 };
      t.count++; chosen.set(k, t);
    }
    if (e.provider_clicked) providerClicks++;
  }
  const sort = (m: Map<string, Tally>) => [...m.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  return {
    explorations: ex.length,
    explored,
    byCategory: DEMO_CASES.map((c) => ({ key: c.category, label: c.categoryLabel, count: byCat.get(c.category) ?? 0 })),
    opened: sort(opened),
    chosen: sort(chosen),
    none,
    noChoice: ex.length - none - [...chosen.values()].reduce((s, t) => s + t.count, 0),
    providerClicks,
  };
}

export function catLabel(cat: string): string {
  return DEMO_CASES.find((c) => c.category === cat)?.categoryLabel ?? cat;
}

// ——— Confronto fra percorsi e stati della schermata email ———

export function pathComparison(ps: DatasetParticipation[]) {
  return (['experience', 'alternative', 'never_purchased'] as Path[]).map((path) => {
    const g = ps.filter((p) => p.path === path);
    const completed = g.filter((p) => p.status === 'completed').length;
    const feedback = g.filter((p) => has(p, 'feedback_submitted')).length;
    const subscribed = g.filter((p) => has(p, 'email_subscribed')).length;
    const shown = g.filter((p) => has(p, 'email_shown')).length;
    return {
      path, label: PATH_LABEL[path], n: g.length,
      completion: ratio(completed, g.length),
      feedback: ratio(feedback, g.length),
      subscribeAmongShown: ratio(subscribed, shown),
      subscribeAmongCompleted: ratio(subscribed, completed),
      high: highUtility(g).ratio,
    };
  });
}

export function emailStates(ps: DatasetParticipation[]) {
  const c = { not_shown: 0, shown: 0, declined: 0, subscribed: 0 };
  for (const p of ps) c[p.email_screen]++;
  return [
    { key: 'not_shown', label: 'Non visualizzata', count: c.not_shown },
    { key: 'shown', label: 'Visualizzata, nessuna decisione registrata', count: c.shown },
    { key: 'declined', label: 'Rifiutata esplicitamente («No grazie, termina»)', count: c.declined },
    { key: 'subscribed', label: 'Richiesta di iscrizione registrata', count: c.subscribed },
  ];
}

/** Partecipazioni senza percorso definito (ferme alle domande iniziali). */
export function withoutPath(ps: DatasetParticipation[]) {
  return ps.filter((p) => !p.path).length;
}
