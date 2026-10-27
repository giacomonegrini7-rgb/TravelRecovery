import { test } from 'node:test';
import assert from 'node:assert/strict';
import { QUESTIONNAIRE_V1 } from '../src/config/questionnaire';
import { DEMO_CASES, compute } from '../src/config/demoCases';
import { QUESTIONNAIRE_EN, QUESTIONNAIRE_EN_TEXTS, localizeQuestionnaire } from '../src/i18n/questionnaire.en';
import { DEMO_EN, localizeCase } from '../src/i18n/demoCases.en';
import { UI, ERRORS } from '../src/i18n/ui';
import { setLang, t } from '../src/i18n';
import { toggleMulti } from '../src/lib/flow';

test('inglese: ogni domanda, opzione e testo del questionario è tradotto', () => {
  for (const k of Object.keys(QUESTIONNAIRE_V1.texts)) assert.ok(QUESTIONNAIRE_EN_TEXTS[k], `testo ${k}`);
  for (const q of QUESTIONNAIRE_V1.questions) {
    const tx = QUESTIONNAIRE_EN[q.id];
    assert.ok(tx?.title, `domanda ${q.id}`);
    if (q.help) assert.ok(tx.help, `aiuto ${q.id}`);
    for (const o of q.options ?? []) assert.ok(tx.options?.[o.id], `opzione ${q.id}.${o.id}`);
    for (const n of Object.keys(q.notes ?? {})) assert.ok(tx.notes?.[n], `nota ${q.id}.${n}`);
  }
});

test('inglese: stessi ID, stessa struttura, stesse regole', () => {
  const en = localizeQuestionnaire(QUESTIONNAIRE_V1);
  assert.equal(en.version, QUESTIONNAIRE_V1.version);
  en.questions.forEach((q, i) => {
    const it = QUESTIONNAIRE_V1.questions[i];
    assert.equal(q.id, it.id);
    assert.equal(q.type, it.type);
    assert.equal(q.max, it.max);
    assert.equal(q.required, it.required);
    assert.deepEqual(q.options?.map((o) => [o.id, !!o.exclusive]), it.options?.map((o) => [o.id, !!o.exclusive]));
  });
});

test('inglese: ogni caso demo, clausola e alternativa è tradotto, importi invariati', () => {
  for (const c of DEMO_CASES) {
    const tx = DEMO_EN[c.id];
    assert.ok(tx, c.id);
    assert.equal(tx.paidBreakdown.length, c.paidBreakdown.length, `${c.id} paidBreakdown`);
    assert.equal(tx.details.length, c.details.length, `${c.id} details`);
    for (const cl of c.clauses) assert.ok(tx.clauses[cl.id], `${c.id} clausola ${cl.id}`);
    for (const a of c.alternatives) {
      const at = tx.alternatives[a.id];
      assert.ok(at, `${c.id} alternativa ${a.id}`);
      assert.equal((at.conditions ?? []).length, a.conditions.length, `${a.id} condizioni`);
      assert.equal((at.steps ?? []).length, a.steps.length, `${a.id} passaggi`);
      if (a.reason) assert.ok(at.reason, `${a.id} motivo`);
      if (a.notGuaranteed) assert.ok(at.notGuaranteed, `${a.id} non garantito`);
      if (a.deadline) assert.ok(at.deadline, `${a.id} scadenza`);
      if (a.credit) assert.ok(at.creditValidity, `${a.id} validità`);
      if (a.provider) assert.ok(at.provider, `${a.id} fornitore`);
      assert.equal((at.deductions ?? []).length, (a.deductions ?? []).length, `${a.id} trattenute`);
      assert.equal((at.extraCosts ?? []).length, (a.extraCosts ?? []).length, `${a.id} costi`);
      assert.equal((at.toVerify ?? []).length, (a.toVerify ?? []).length, `${a.id} da verificare`);
    }
    const en = localizeCase(c);
    c.alternatives.forEach((a, i) => assert.deepEqual(compute(en, en.alternatives[i]), compute(c, a), `${a.id} importi`));
  }
});

test('inglese: interfaccia ed errori completi, messaggi nella lingua scelta', () => {
  for (const k of Object.keys(UI.it)) assert.ok(UI.en[k as keyof typeof UI.en], k);
  for (const k of Object.keys(ERRORS.it)) assert.ok(ERRORS.en[k], k);
  const q8 = QUESTIONNAIRE_V1.questions.find((q) => q.id === 'Q8')!;
  setLang('en', { persist: false });
  assert.match(toggleMulti(q8, ['costs', 'deadlines', 'compare'], 'other').error ?? '', /up to 3 answers/);
  assert.equal(t('start'), 'Start');
  setLang('it', { persist: false });
  assert.equal(t('start'), 'Inizia');
});
