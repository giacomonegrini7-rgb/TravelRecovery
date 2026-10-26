import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Dataset, DatasetParticipation } from '../src/lib/backend/types';
import { applyClientFilters, computeFunnel, computeKpis, distribution, fmtRatio, highUtility, ratio } from '../src/lib/stats';
import { contactsCsv, participationsCsv, safeCell, statsCsv, toCsv } from '../src/lib/exports';
import { QUESTIONNAIRE_V1 } from '../src/config/questionnaire';
import { buildSampleDataset } from '../src/lib/backend/localAdmin';

function p(over: Partial<DatasetParticipation> & { id: string }): DatasetParticipation {
  return {
    code: over.id.toUpperCase(), started_at: '2026-10-20T10:00:00Z', completed_at: null, last_activity_at: '2026-10-20T10:05:00Z',
    questionnaire_version: 'q-v1', demo_version: 'demo-v1', privacy_version: 'privacy-v1', path: null, current_step: 'Q1',
    status: 'in_progress', is_test: false, email_screen: 'not_shown', f1_exploration_id: null, answers: [], explorations: [],
    events: { started: '2026-10-20T10:00:00Z' }, subscription: null, ...over,
  };
}
const ans = (question_id: string, v: string | string[] | null, status: 'answered' | 'not_applicable' = 'answered') => ({
  question_id, status, value_single: typeof v === 'string' ? v : null, value_multi: Array.isArray(v) ? v : null, value_text: null, confirmed_at: '2026-10-20T10:01:00Z',
});
const ex = (id: string, category: string, opened: string[]) => ({
  id, seq: 1, category, case_id: `${category}-01`, case_version: 'demo-v1', need_id: 'cancel', reference_date: '2026-10-20', started_at: '', details_opened: opened,
  first_detail_at: null, choice: null, choice_at: null, provider_clicked: false, provider_alt: null, provider_clicked_at: null, ended_at: null,
});
const sub = (email: string, status: 'active' | 'revoked' = 'active') => ({
  contact_id: email, email, contact_status: status, verification: 'unverified' as const, consented_at: '', consent_version: 'consent-v1', consent_text: '', contact_status_at_request: 'new' as const,
});

const completedEv = { started: 'x', initial_done: 'x', demo_started: 'x', demo_explored: 'x', feedback_submitted: 'x', email_shown: 'x' };
const rows: DatasetParticipation[] = [
  p({ id: 'a', path: 'experience', status: 'completed', email_screen: 'subscribed', events: { ...completedEv, email_subscribed: 'x' }, subscription: sub('x@e.it'), f1_exploration_id: 'e1', explorations: [ex('e0', 'hotel', ['h-cancel-free']), ex('e1', 'flight', ['f-credit'])], answers: [ans('Q5', ['confirmation', 'customer_care']), ans('A1', null, 'not_applicable'), ans('F1a', 'very'), ans('F2', 'very')] }),
  p({ id: 'b', path: 'alternative', status: 'completed', email_screen: 'subscribed', events: { ...completedEv, email_subscribed: 'x' }, subscription: sub('x@e.it'), f1_exploration_id: 'e2', explorations: [ex('e2', 'hotel', ['h-voucher'])], answers: [ans('Q5', null, 'not_applicable'), ans('A1', 'fairly'), ans('F1a', 'slightly'), ans('F2', 'cannot_say')] }),
  p({ id: 'c', path: 'experience', status: 'completed', email_screen: 'declined', events: { ...completedEv, email_declined: 'x' }, f1_exploration_id: 'e3', explorations: [ex('e3', 'train', ['t-change'])], answers: [ans('Q5', ['confirmation']), ans('F2', 'slightly')] }),
  p({ id: 'd', events: { started: 'x' } }),
];
const ds: Dataset = { generated_at: '', role: 'owner', config: {} as Dataset['config'], questionnaire_versions: [{ version: 'q-v1', definition: QUESTIONNAIRE_V1 }], demo_versions: [], participations: rows };

test('KPI: rapporti con numeratore e denominatore; email uniche', () => {
  const k = computeKpis(rows);
  assert.equal(k.started, 4);
  assert.equal(k.completed, 3);
  assert.equal(fmtRatio(k.completionRate), '3 su 4 — 75%');
  assert.equal(k.emailShown, 3);
  assert.equal(k.subscribed, 2);
  assert.equal(fmtRatio(k.subscribeAmongShown), '2 su 3 — 67%');
  assert.equal(k.uniqueEmails, 1, 'stessa email su due partecipazioni');
  assert.equal(fmtRatio(ratio(0, 0)), '0 su 0 — Non disponibile');
});

test('funnel: una volta per passaggio, perdite tra step', () => {
  const f = computeFunnel(rows);
  assert.equal(f[0].count, 4);
  assert.equal(f[1].count, 3);
  assert.equal(f[1].lostFromPrevious, 1);
  assert.equal(f[6].count, 2);
});

test('domande multiple: denominatore = rispondenti applicabili, somma può superare 100%', () => {
  const d = distribution(ds, rows, 'Q5', 'completed')!;
  assert.equal(d.respondents, 2);
  assert.equal(d.notApplicable, 1);
  assert.equal(d.rows.find((r) => r.optionId === 'confirmation')!.pct, 100);
  assert.equal(d.rows.find((r) => r.optionId === 'customer_care')!.pct, 50);
  assert.ok(d.rows.reduce((s, r) => s + (r.pct ?? 0), 0) > 100);
});

test('filtro categoria: F1 conta solo se riferita a quella categoria', () => {
  const hotel = applyClientFilters(rows, { path: 'all', category: 'hotel' });
  assert.deepEqual(hotel.map((x) => x.id), ['a', 'b']);
  const d = distribution(ds, hotel, 'F1a', 'completed', { f1Category: 'hotel' })!;
  assert.equal(d.respondents, 1, 'la partecipazione a ha valutato il volo, non l’hotel');
});

test('utilità elevata percepita esclude «Non saprei» dal denominatore', () => {
  const h = highUtility(rows);
  assert.equal(h.ratio.num, 1);
  assert.equal(h.ratio.den, 2);
  assert.equal(h.cannotSay, 1);
});

test('CSV: protezione da formule, separatori, accenti e testi multilinea', () => {
  assert.equal(safeCell('=SUM(A1)'), "'=SUM(A1)");
  assert.equal(safeCell('+39 333'), "'+39 333");
  assert.equal(safeCell('@cmd'), "'@cmd");
  assert.equal(safeCell('a;b'), '"a;b"');
  assert.equal(safeCell('riga 1\nriga "2"'), '"riga 1\nriga ""2"""');
  const csv = toCsv([['città', 'perché']]);
  assert.ok(csv.startsWith('﻿'));
  assert.ok(csv.includes('città;perché'));
});

test('CSV partecipazioni: tutte le righe, email solo su richiesta, etichette leggibili', () => {
  const big = buildSampleDataset(new Date('2026-10-26T12:00:00Z')).ds;
  const all = big.participations;
  const csv = participationsCsv(big, all, false);
  assert.ok(all.length > 25, 'più di una pagina');
  for (const x of all) assert.ok(csv.includes(`\r\n${x.code};`), `manca ${x.code}`);
  assert.ok(!csv.includes('@esempio.test'), 'email escluse per impostazione predefinita');
  assert.ok(participationsCsv(big, all, true).includes('@esempio.test'));
  assert.ok(csv.includes('Non applicabile'));
});

test('CSV contatti: un contatto per email, senza duplicati', () => {
  const { contacts } = buildSampleDataset(new Date('2026-10-26T12:00:00Z'));
  const csv = contactsCsv(contacts);
  const emails = csv.trim().split('\r\n').slice(1).map((l) => l.split(';')[0]);
  assert.equal(new Set(emails).size, emails.length);
});

test('CSV statistiche: include filtri, denominatori e data di esportazione', () => {
  const csv = statsCsv(ds, rows, ['Dati: solo ricerca (test esclusi)'], 'completed', { path: 'all', category: 'all' });
  assert.ok(csv.includes('Data (Europe/Rome)'));
  assert.ok(csv.includes('Dati: solo ricerca'));
  assert.ok(csv.includes('Tasso di completamento;;3;4;75%'));
});
