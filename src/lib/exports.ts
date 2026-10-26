// Esportazioni generate nel browser del creator autorizzato (mai pubblicate a un URL aperto).
// CSV con separatore ";" (compatibile con Excel in italiano), BOM UTF-8 per gli accenti,
// virgolette per testi multilinea e protezione dalle formule nei fogli di calcolo.

import type { ContactRow, Dataset, DatasetParticipation } from './backend/types';
import { QUESTIONNAIRES, type QuestionnaireDefinition } from '../config/questionnaire';
import { altLabel, catLabel, computeFunnel, computeKpis, definitionsOf, distribution, emailStates, fmtPct, highUtility, pathComparison, PATH_LABEL, type AnswerScope, type ClientFilters } from './stats';
import { dateTimeRome } from './format';
import { NEED_LABEL, type NeedId } from '../config/demoCases';

export const SEP = ';';

/** Neutralizza valori che un foglio di calcolo interpreterebbe come formule. */
export function safeCell(v: unknown): string {
  let s = v === null || v === undefined ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[";\n\r,]/.test(s) || s !== s.trim()) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(rows: unknown[][]): string {
  return '﻿' + rows.map((r) => r.map(safeCell).join(SEP)).join('\r\n') + '\r\n';
}

export function download(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function stamp(d = new Date()): string {
  return d.toISOString().slice(0, 16).replace(/[-:T]/g, '');
}

const STATUS_LABEL = { in_progress: 'In corso', completed: 'Completato' } as const;
const EMAIL_SCREEN_LABEL = { not_shown: 'Non visualizzata', shown: 'Visualizzata, nessuna decisione', declined: 'Rifiutata', subscribed: 'Iscrizione registrata' } as const;

export function answerText(def: QuestionnaireDefinition | undefined, p: DatasetParticipation, qid: string): string {
  const a = p.answers.find((x) => x.question_id === qid);
  if (!a) return 'Nessuna risposta';
  if (a.status === 'not_applicable') return 'Non applicabile';
  const q = def?.questions.find((x) => x.id === qid);
  const lbl = (id: string) => q?.options?.find((o) => o.id === id)?.label ?? id;
  if (a.value_multi) return a.value_multi.map(lbl).join(' | ');
  if (a.value_single) return lbl(a.value_single);
  return a.value_text ?? '';
}

export function participationsCsv(ds: Dataset, ps: DatasetParticipation[], includeEmail: boolean): string {
  const defs = definitionsOf(ds);
  const latest = defs[ps[0]?.questionnaire_version ?? Object.keys(QUESTIONNAIRES)[0]] ?? Object.values(QUESTIONNAIRES)[0];
  const qids = latest.questions.map((q) => q.id);
  const header = [
    'Codice', 'Avvio (Europe/Rome)', 'Completamento (Europe/Rome)', 'Stato', 'Percorso', 'Test',
    'Versione questionario', 'Versione demo', 'Fase corrente', 'Schermata email',
    'Esempi provati', 'Riferimento F1 (categoria)', 'Alternative aperte', 'Scelte', 'Clic passaggio al fornitore',
    ...qids.map((id) => `${id} — ${latest.questions.find((q) => q.id === id)?.short ?? ''}`),
    ...(includeEmail ? ['Email', 'Stato contatto', 'Verifica', 'Consenso (Europe/Rome)'] : []),
  ];
  const rows = ps.map((p) => {
    const def = defs[p.questionnaire_version];
    const f1 = p.explorations.find((e) => e.id === p.f1_exploration_id);
    return [
      p.code, dateTimeRome(p.started_at), dateTimeRome(p.completed_at), STATUS_LABEL[p.status],
      p.path ? PATH_LABEL[p.path] : 'Non determinato', p.is_test ? 'Sì' : 'No',
      p.questionnaire_version, p.demo_version, p.current_step, EMAIL_SCREEN_LABEL[p.email_screen],
      p.explorations.map((e) => `${catLabel(e.category)} (${NEED_LABEL[e.need_id as NeedId]?.title ?? e.need_id})`).join(' | '),
      f1 ? catLabel(f1.category) : '',
      p.explorations.flatMap((e) => e.details_opened.map((a) => altLabel(ds, e.case_id, e.case_version, a))).join(' | '),
      p.explorations.filter((e) => e.choice).map((e) => altLabel(ds, e.case_id, e.case_version, e.choice)).join(' | '),
      p.explorations.filter((e) => e.provider_clicked).length,
      ...qids.map((id) => answerText(def, p, id)),
      ...(includeEmail ? [p.subscription?.email ?? '', p.subscription ? (p.subscription.contact_status === 'active' ? 'Attivo' : 'Revocato') : '',
        p.subscription ? (p.subscription.verification === 'verified' ? 'Verificata' : 'Non verificata') : '',
        p.subscription ? dateTimeRome(p.subscription.consented_at) : ''] : []),
    ];
  });
  return toCsv([header, ...rows]);
}

export function contactsCsv(cs: ContactRow[]): string {
  const header = ['Email', 'Stato attuale', 'Verifica', 'Prima richiesta (Europe/Rome)', 'Ultima richiesta (Europe/Rome)', 'Partecipazioni collegate', 'Codici partecipazione', 'Revoca (Europe/Rome)'];
  const rows = cs.map((c) => [
    c.email, c.status === 'active' ? 'Attivo' : 'Revocato', c.verification === 'verified' ? 'Verificata' : 'Non verificata',
    dateTimeRome(c.requests[0]?.consented_at), dateTimeRome(c.requests[c.requests.length - 1]?.consented_at),
    c.requests.length, c.requests.map((r) => r.code).join(' | '), dateTimeRome(c.revoked_at),
  ]);
  return toCsv([header, ...rows]);
}

export function statsCsv(ds: Dataset, ps: DatasetParticipation[], filterLines: string[], scope: AnswerScope, f: ClientFilters): string {
  const rows: unknown[][] = [['Sezione', 'Metrica', 'Valore', 'Numeratore', 'Denominatore', 'Percentuale']];
  rows.push(['Esportazione', 'Data (Europe/Rome)', dateTimeRome(new Date().toISOString()), '', '', '']);
  for (const l of filterLines) rows.push(['Filtri', l, '', '', '', '']);
  rows.push(['Filtri', 'Risposte considerate', scope === 'completed' ? 'Solo questionari completati' : 'Tutte, incluse le compilazioni parziali', '', '', '']);
  const k = computeKpis(ps);
  const r = (sec: string, m: string, rt: { num: number; den: number; pct: number | null }) =>
    rows.push([sec, m, '', rt.num, rt.den, fmtPct(rt.pct)]);
  rows.push(['KPI', 'Partecipazioni avviate', k.started, '', '', '']);
  rows.push(['KPI', 'Questionari completati', k.completed, '', '', '']);
  r('KPI', 'Tasso di completamento', k.completionRate);
  rows.push(['KPI', 'Partecipazioni che hanno visualizzato l’invito email', k.emailShown, '', '', '']);
  rows.push(['KPI', 'Partecipazioni con richiesta di iscrizione', k.subscribed, '', '', '']);
  r('KPI', 'Iscrizione tra chi ha visto l’invito', k.subscribeAmongShown);
  r('KPI', 'Iscrizione tra i completamenti', k.subscribeAmongCompleted);
  rows.push(['KPI', 'Email uniche associate', k.uniqueEmails, '', '', '']);
  rows.push(['KPI', 'Contatti attualmente attivi associati (stato attuale)', k.activeContacts, '', '', '']);
  for (const s of computeFunnel(ps)) {
    rows.push(['Funnel', s.label, s.count, s.count, s.fromStart.den, fmtPct(s.fromStart.pct)]);
  }
  const hu = highUtility(ps);
  r('Feedback', 'Utilità elevata percepita (Molto + Estremamente utile / risposte valutabili a F2)', hu.ratio);
  rows.push(['Feedback', 'F2 «Non saprei valutarlo»', hu.cannotSay, '', '', '']);
  for (const e of emailStates(ps)) rows.push(['Schermata email', e.label, e.count, '', '', '']);
  for (const c of pathComparison(ps)) {
    rows.push(['Percorsi', `${c.label}: partecipazioni`, c.n, '', '', '']);
    r('Percorsi', `${c.label}: completamento`, c.completion);
    r('Percorsi', `${c.label}: iscrizione tra i completamenti`, c.subscribeAmongCompleted);
  }
  const def = Object.values(definitionsOf(ds)).at(-1)!;
  for (const q of def.questions) {
    if (q.type === 'text') continue;
    const d = distribution(ds, ps, q.id, scope, { f1Category: f.category !== 'all' ? f.category : undefined });
    if (!d) continue;
    for (const row of d.rows) {
      rows.push([`Risposte ${q.id}${d.multi ? ' (multipla: % sui rispondenti, somma > 100% possibile)' : ''}`, row.label, row.count, row.count, d.respondents, fmtPct(row.pct)]);
    }
    rows.push([`Risposte ${q.id}`, 'Non applicabile (escluse dal denominatore)', d.notApplicable, '', '', '']);
  }
  return toCsv(rows);
}

export function datasetJson(ds: Dataset, ps: DatasetParticipation[], filterLines: string[]): string {
  return JSON.stringify({
    exported_at: new Date().toISOString(),
    timezone_for_display: 'Europe/Rome',
    filters: filterLines,
    sample_data: Boolean(ds.sample),
    questionnaire_versions: ds.questionnaire_versions,
    demo_versions: ds.demo_versions,
    participations: ps,
  }, null, 2);
}

export function participationJson(ds: Dataset, p: DatasetParticipation): string {
  return JSON.stringify({
    exported_at: new Date().toISOString(),
    sample_data: Boolean(ds.sample),
    questionnaire_version: ds.questionnaire_versions.find((v) => v.version === p.questionnaire_version) ?? null,
    demo_version: ds.demo_versions.find((v) => v.version === p.demo_version) ?? null,
    participation: p,
  }, null, 2);
}
