import { test } from 'node:test';
import assert from 'node:assert/strict';
import { QUESTIONNAIRE_V1 as D, getQuestion } from '../src/config/questionnaire';
import { isApplicable, missingRequired, nextStep, pathOf, prevStep, progressFor, pruneInapplicable, stepsFor, toggleMulti, validateAnswer, type Answers } from '../src/lib/flow';

const s = (value: string) => ({ kind: 'single' as const, value });
const m = (...values: string[]) => ({ kind: 'multi' as const, values });

test('Q2 «Sì» → percorso esperienza Q3–Q9, O1', () => {
  for (const v of ['yes_open', 'yes_once_closed', 'yes_many_closed']) {
    const a: Answers = { Q1: m('none'), Q2: s(v) };
    assert.equal(pathOf(a), 'experience');
    assert.deepEqual(stepsFor(a).slice(3, 12), ['exp_intro', 'Q3', 'Q4', 'Q5', 'Q6', 'Q7', 'Q8', 'Q9', 'O1']);
  }
});

test('Q1 «Nessuno di questi» non elimina esperienze precedenti (tutti proseguono a Q2)', () => {
  const a: Answers = { Q1: m('none') };
  assert.equal(nextStep('Q1', a), 'Q2');
  assert.equal(pathOf({ ...a, Q2: s('yes_once_closed') }), 'experience');
});

test('Q2 «No» e «Non ricordo» → percorso alternativo dopo la scelta del sottogruppo', () => {
  for (const v of ['no', 'dont_remember']) {
    const a: Answers = { Q1: m('train'), Q2: s(v) };
    assert.equal(pathOf(a), null, 'senza A0 il percorso non è ancora determinato');
    assert.equal(nextStep('Q2', a), 'alt_intro');
    assert.equal(pathOf({ ...a, A0: s('continue') }), 'alternative');
    assert.deepEqual(stepsFor({ ...a, A0: s('continue') }).slice(3, 9), ['alt_intro', 'A1', 'A2', 'A3', 'A4', 'O2']);
  }
});

test('sottopercorso «mai acquistato»: dritto alla demo, A1–A4/O2 non applicabili', () => {
  const a: Answers = { Q1: m('none'), Q2: s('no'), A0: s('never_purchased') };
  assert.equal(pathOf(a), 'never_purchased');
  assert.equal(nextStep('alt_intro', a), 'demo_intro');
  for (const q of ['A1', 'A2', 'A3', 'A4', 'O2', 'Q3']) assert.equal(isApplicable(q, D, a), false, q);
});

test('opzioni esclusive deselezionano le altre e viceversa', () => {
  const q1 = getQuestion(D, 'Q1');
  assert.deepEqual(toggleMulti(q1, ['hotel', 'train'], 'none').values, ['none']);
  assert.deepEqual(toggleMulti(q1, ['none'], 'flight').values, ['flight']);
  const q8 = getQuestion(D, 'Q8');
  assert.deepEqual(toggleMulti(q8, ['no_difficulty'], 'did_not_search').values, ['did_not_search'], 'esclusive anche tra loro');
  const a4 = getQuestion(D, 'A4');
  assert.deepEqual(toggleMulti(a4, ['insurance', 'waited'], 'dont_remember').values, ['dont_remember']);
});

test('Q8: massimo tre risposte con messaggio chiaro', () => {
  const q8 = getQuestion(D, 'Q8');
  const r = toggleMulti(q8, ['costs', 'deadlines', 'compare'], 'other');
  assert.deepEqual(r.values, ['costs', 'deadlines', 'compare']);
  assert.match(r.error ?? '', /massimo 3/);
  assert.match(validateAnswer(q8, m('costs', 'deadlines', 'compare', 'other')) ?? '', /massimo 3/);
  assert.equal(validateAnswer(q8, m('costs', 'deadlines', 'compare')), null);
});

test('aperte facoltative con limite di 1.200 caratteri', () => {
  const o1 = getQuestion(D, 'O1');
  assert.equal(o1.required, false);
  assert.equal(validateAnswer(o1, undefined), null);
  assert.equal(validateAnswer(o1, { kind: 'text', text: 'x'.repeat(1200) }), null);
  assert.ok(validateAnswer(o1, { kind: 'text', text: 'x'.repeat(1201) }));
  assert.equal(getQuestion(D, 'F3_other').maxLength, 300);
});

test('cambio percorso: nessuna risposta incompatibile resta', () => {
  const a: Answers = { Q1: m('hotel'), Q2: s('no'), A0: s('continue'), A1: s('fairly'), A2: m('refund') };
  const switched = pruneInapplicable(D, { ...a, Q2: s('yes_open') });
  assert.equal(switched.A1, undefined);
  assert.equal(switched.A0, undefined);
  assert.equal(switched.Q1?.kind, 'multi');
});

test('indietro conserva le risposte e non torna oltre l’invio', () => {
  const a: Answers = { Q1: m('hotel'), Q2: s('yes_open') };
  assert.equal(prevStep('Q3', a), 'exp_intro');
  assert.equal(prevStep('email', a), null);
});

test('risposte obbligatorie mancanti per percorso', () => {
  const a: Answers = { Q1: m('hotel'), Q2: s('no'), A0: s('never_purchased'), F1a: s('very'), F1b: s('fairly'), F2: s('very'), F3: s('trust') };
  assert.deepEqual(missingRequired(D, a), []);
  assert.deepEqual(missingRequired(D, { ...a, Q2: s('yes_open') }).slice(0, 2), ['Q3', 'Q4']);
});

test('indicatore di avanzamento coerente con il percorso effettivo', () => {
  const exp = progressFor('Q4', { Q1: m('hotel'), Q2: s('yes_open') });
  assert.deepEqual(exp.stages, ['initial', 'branch', 'demo', 'feedback']);
  assert.equal(exp.total, 9);
  const never = progressFor('F2', { Q1: m('none'), Q2: s('no'), A0: s('never_purchased') });
  assert.deepEqual(never.stages, ['initial', 'demo', 'feedback']);
});

test('ID stabili e testi fedeli alla specifica', () => {
  assert.equal(getQuestion(D, 'Q2').title, 'Ti è mai capitato di dover modificare o rinunciare a una prenotazione o a un biglietto già acquistato?');
  assert.equal(getQuestion(D, 'Q5').options!.length, 9);
  assert.equal(getQuestion(D, 'Q8').options!.length, 11);
  assert.equal(getQuestion(D, 'F3').options!.length, 9);
  assert.ok(getQuestion(D, 'F3').options!.some((o) => o.label === 'Dovrei conoscere il prezzo prima di decidere'));
  const ids = D.questions.map((q) => q.id);
  assert.equal(new Set(ids).size, ids.length);
});
