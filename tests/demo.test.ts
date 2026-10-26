import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEMO_CASES, alternativesFor, compute, highestRefund, type NeedId } from '../src/config/demoCases';

test('cinque categorie, un caso coerente per ciascuna, con ID e versione', () => {
  assert.deepEqual(DEMO_CASES.map((c) => c.category), ['hotel', 'train', 'flight', 'sport', 'concert']);
  for (const c of DEMO_CASES) {
    assert.ok(c.id && c.version === 'demo-v1');
    const sum = Math.round(c.paidBreakdown.reduce((s, b) => s + b.amount, 0) * 100) / 100;
    assert.equal(sum, c.paid, `${c.id}: il dettaglio del pagato deve sommare all'importo`);
  }
});

test('ogni esigenza ha almeno un’alternativa non disponibile o da confermare, con motivo', () => {
  for (const c of DEMO_CASES) {
    for (const need of Object.keys(c.needs) as NeedId[]) {
      const alts = alternativesFor(c, need);
      assert.ok(alts.some((a) => a.status !== 'available'), `${c.id}/${need}`);
      for (const a of alts.filter((x) => x.status !== 'available')) assert.ok(a.reason, `${a.id} senza motivo`);
    }
  }
});

test('rimborsi: costi sottratti una volta, mai oltre il pagato, voucher non è denaro', () => {
  for (const c of DEMO_CASES) {
    for (const a of c.alternatives) {
      const k = compute(c, a);
      if (k.refundNet !== null) {
        assert.ok(k.refundNet <= c.paid, a.id);
        assert.ok(k.refundNet >= 0, a.id);
        assert.equal(k.refundNet, Math.round((Math.min(a.refundGross!, c.paid) - k.deductionsTotal) * 100) / 100, a.id);
      }
      if (a.benefit === 'credit') assert.equal(k.refundNet, null, `${a.id}: un credito non è un rimborso`);
      if (a.benefit === 'change') assert.equal(k.refundNet, null, `${a.id}: un cambio data non è un rimborso`);
      if (a.status === 'not_provided') assert.equal(k.refundNet, null);
    }
  }
  const h = DEMO_CASES[0];
  assert.equal(compute(h, h.alternatives.find((a) => a.id === 'h-cancel-late')!).refundNet, 156);
  const t = DEMO_CASES[1];
  assert.equal(compute(t, t.alternatives.find((a) => a.id === 't-refund')!).refundNet, 47.92);
  const f = DEMO_CASES[2];
  assert.equal(compute(f, f.alternatives.find((a) => a.id === 'f-taxes')!).refundNet, 23.6);
});

test('differenze sconosciute restano «da verificare», senza totali inventati', () => {
  const f = DEMO_CASES[2].alternatives.find((a) => a.id === 'f-change')!;
  const k = compute(DEMO_CASES[2], f);
  assert.equal(k.extraKnown, 60);
  assert.equal(k.hasUnknownCosts, true);
});

test('maggior rimborso in denaro: solo alternative disponibili, il credito non conta', () => {
  const f = DEMO_CASES[2];
  assert.equal(highestRefund(f, f.needs.cancel!), 'f-taxes');
  const concert = DEMO_CASES[4];
  assert.equal(highestRefund(concert, concert.needs.cancel!), null);
  const h = DEMO_CASES[0];
  assert.equal(highestRefund(h, h.needs.cancel!), 'h-cancel-free');
});

test('sport e concerti: passaggio al canale autorizzato, nessuna vendita garantita', () => {
  const resale = DEMO_CASES[3].alternatives.find((a) => a.benefit === 'resale')!;
  assert.equal(resale.status, 'to_confirm');
  assert.equal(resale.refundGross, undefined);
  assert.ok(resale.provider);
  assert.match(resale.notGuaranteed!, /non è garantito/);
});

test('correzione del nome distinta dalla sostituzione', () => {
  const f = DEMO_CASES[2];
  assert.equal(f.alternatives.find((a) => a.id === 'f-substitute')!.status, 'not_provided');
  assert.equal(f.alternatives.find((a) => a.id === 'f-name-fix')!.benefit, 'correction');
});

test('ogni alternativa cita clausole esistenti del caso', () => {
  for (const c of DEMO_CASES) for (const a of c.alternatives) for (const id of a.clauseIds) assert.ok(c.clauses.some((x) => x.id === id), `${a.id}→${id}`);
});
