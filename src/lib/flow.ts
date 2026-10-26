// Logica del percorso: puramente deterministica, condivisa da UI, backend locale e test.
// Le stesse regole sono applicate lato server nelle funzioni SQL (validate_answer / required set).

import type { Question, QuestionnaireDefinition } from '../config/questionnaire';

export type Path = 'experience' | 'alternative' | 'never_purchased';

export type StepId =
  | 'intro'
  | 'Q1' | 'Q2'
  | 'exp_intro' | 'Q3' | 'Q4' | 'Q5' | 'Q6' | 'Q7' | 'Q8' | 'Q9' | 'O1'
  | 'alt_intro' | 'A1' | 'A2' | 'A3' | 'A4' | 'O2'
  | 'demo_intro' | 'demo'
  | 'F1' | 'F2' | 'F3'
  | 'email' | 'thanks';

export type AnswerValue =
  | { kind: 'single'; value: string }
  | { kind: 'multi'; values: string[] }
  | { kind: 'text'; text: string };

export type Answers = Record<string, AnswerValue>;

export const EXPERIENCE_Q2 = ['yes_open', 'yes_once_closed', 'yes_many_closed'];
export const ALTERNATIVE_Q2 = ['no', 'dont_remember'];

export function pathFrom(q2: string | undefined, a0: string | undefined): Path | null {
  if (!q2) return null;
  if (EXPERIENCE_Q2.includes(q2)) return 'experience';
  if (ALTERNATIVE_Q2.includes(q2)) {
    // il percorso alternativo è determinato solo dopo la scelta del sottogruppo (A0)
    if (a0 === 'never_purchased') return 'never_purchased';
    if (a0 === 'continue') return 'alternative';
  }
  return null;
}

export function pathOf(answers: Answers): Path | null {
  const q2 = answers.Q2?.kind === 'single' ? answers.Q2.value : undefined;
  const a0 = answers.A0?.kind === 'single' ? answers.A0.value : undefined;
  return pathFrom(q2, a0);
}

/** Branca grezza (prima della scelta del sottogruppo) dedotta da Q2. */
export function branchFromQ2(q2: string | undefined): 'experience' | 'alternative' | null {
  if (!q2) return null;
  if (EXPERIENCE_Q2.includes(q2)) return 'experience';
  if (ALTERNATIVE_Q2.includes(q2)) return 'alternative';
  return null;
}

const EXPERIENCE_STEPS: StepId[] = ['exp_intro', 'Q3', 'Q4', 'Q5', 'Q6', 'Q7', 'Q8', 'Q9', 'O1'];
const ALTERNATIVE_STEPS: StepId[] = ['alt_intro', 'A1', 'A2', 'A3', 'A4', 'O2'];
const TAIL: StepId[] = ['demo_intro', 'demo', 'F1', 'F2', 'F3', 'email', 'thanks'];

/** Sequenza effettiva dei passaggi per le risposte correnti. */
export function stepsFor(answers: Answers): StepId[] {
  const q2 = answers.Q2?.kind === 'single' ? answers.Q2.value : undefined;
  const branch = branchFromQ2(q2);
  const head: StepId[] = ['intro', 'Q1', 'Q2'];
  if (branch === 'experience') return [...head, ...EXPERIENCE_STEPS, ...TAIL];
  if (branch === 'alternative') {
    const a0 = answers.A0?.kind === 'single' ? answers.A0.value : undefined;
    if (a0 === 'never_purchased') return [...head, 'alt_intro', ...TAIL];
    return [...head, ...ALTERNATIVE_STEPS, ...TAIL];
  }
  return head;
}

export function nextStep(current: StepId, answers: Answers): StepId | null {
  const s = stepsFor(answers);
  const i = s.indexOf(current);
  return i >= 0 && i < s.length - 1 ? s[i + 1] : null;
}

export function prevStep(current: StepId, answers: Answers): StepId | null {
  const s = stepsFor(answers);
  const i = s.indexOf(current);
  // dopo l'invio finale non si torna indietro
  if (current === 'email' || current === 'thanks') return null;
  return i > 0 ? s[i - 1] : null;
}

/** Fasi mostrate dall'indicatore di avanzamento (nessuna durata inventata). */
export type Stage = 'initial' | 'branch' | 'demo' | 'feedback';
export const STAGE_LABEL: Record<Stage, string> = {
  initial: 'Domande iniziali',
  branch: 'La tua esperienza',
  demo: 'Demo',
  feedback: 'Il tuo parere',
};

export function stageOf(step: StepId): Stage | null {
  if (step === 'Q1' || step === 'Q2') return 'initial';
  if (EXPERIENCE_STEPS.includes(step) || ALTERNATIVE_STEPS.includes(step)) return 'branch';
  if (step === 'demo_intro' || step === 'demo') return 'demo';
  if (step === 'F1' || step === 'F2' || step === 'F3') return 'feedback';
  return null;
}

export function progressFor(step: StepId, answers: Answers): { stages: Stage[]; current: Stage | null; index: number; total: number } {
  const steps = stepsFor(answers);
  const stage = stageOf(step);
  const stages: Stage[] = ['initial'];
  if (pathOf(answers) !== 'never_purchased') stages.push('branch');
  stages.push('demo', 'feedback');
  const inStage = steps.filter((s) => stageOf(s) === stage);
  return { stages, current: stage, index: inStage.indexOf(step) + 1, total: inStage.length };
}

// ——— Selezione delle opzioni ———

export interface ToggleResult {
  values: string[];
  error: string | null;
}

/** Applica una selezione multipla rispettando esclusività e limite massimo. */
export function toggleMulti(q: Question, current: string[], optionId: string): ToggleResult {
  const opt = q.options?.find((o) => o.id === optionId);
  if (!opt) return { values: current, error: null };
  if (current.includes(optionId)) {
    return { values: current.filter((v) => v !== optionId), error: null };
  }
  if (opt.exclusive) return { values: [optionId], error: null };
  const exclusiveIds = new Set((q.options ?? []).filter((o) => o.exclusive).map((o) => o.id));
  const kept = current.filter((v) => !exclusiveIds.has(v));
  if (q.max && kept.length >= q.max) {
    return { values: current, error: `Puoi scegliere al massimo ${q.max} risposte. Deseleziona un’opzione per sceglierne un’altra.` };
  }
  return { values: [...kept, optionId], error: null };
}

/** Validazione di una singola risposta (stesse regole applicate dal server). */
export function validateAnswer(q: Question, v: AnswerValue | undefined): string | null {
  if (q.type === 'text') {
    if (!v) return null;
    if (v.kind !== 'text') return 'Formato non valido.';
    if (q.maxLength && v.text.length > q.maxLength) return `Massimo ${q.maxLength} caratteri.`;
    return null;
  }
  if (!v) return q.required ? 'Seleziona una risposta per continuare.' : null;
  const ids = new Set((q.options ?? []).map((o) => o.id));
  if (q.type === 'single') {
    if (v.kind !== 'single' || !ids.has(v.value)) return 'Seleziona una risposta per continuare.';
    return null;
  }
  if (v.kind !== 'multi' || v.values.length === 0) return 'Seleziona almeno una risposta per continuare.';
  if (new Set(v.values).size !== v.values.length) return 'Risposta duplicata.';
  if (v.values.some((x) => !ids.has(x))) return 'Opzione non valida.';
  const excl = (q.options ?? []).filter((o) => o.exclusive).map((o) => o.id);
  if (v.values.some((x) => excl.includes(x)) && v.values.length > 1) return 'Questa opzione non può essere combinata con altre.';
  if (q.max && v.values.length > q.max) return `Puoi scegliere al massimo ${q.max} risposte.`;
  return null;
}

/** Domande applicabili per un percorso (F3_other dipende da F3). */
export function isApplicable(qid: string, def: QuestionnaireDefinition, answers: Answers): boolean {
  const q = def.questions.find((x) => x.id === qid);
  if (!q) return false;
  const path = pathOf(answers);
  const branch = branchFromQ2(answers.Q2?.kind === 'single' ? answers.Q2.value : undefined);
  switch (q.branch) {
    case 'common':
      return true;
    case 'experience':
      return branch === 'experience';
    case 'alt_gate':
      return branch === 'alternative';
    case 'alternative':
      return path === 'alternative';
    case 'feedback':
      if (qid === 'F3_other') return answers.F3?.kind === 'single' && answers.F3.value === 'other';
      return true;
  }
}

/** Rimuove le risposte del ramo non più applicabile (usato al cambio di percorso). */
export function pruneInapplicable(def: QuestionnaireDefinition, answers: Answers): Answers {
  const out: Answers = {};
  for (const [k, v] of Object.entries(answers)) if (isApplicable(k, def, answers)) out[k] = v;
  // seconda passata: A0 rimosso può cambiare l'applicabilità di A1–A4
  const again: Answers = {};
  for (const [k, v] of Object.entries(out)) if (isApplicable(k, def, out)) again[k] = v;
  return again;
}

/** Domande chiuse obbligatorie ancora senza risposta valida. */
export function missingRequired(def: QuestionnaireDefinition, answers: Answers): string[] {
  return def.questions
    .filter((q) => q.required && isApplicable(q.id, def, answers))
    .filter((q) => validateAnswer(q, answers[q.id]) !== null)
    .map((q) => q.id);
}

export function questionStepIds(step: StepId): string[] {
  if (step === 'F1') return ['F1a', 'F1b'];
  if (step === 'F3') return ['F3', 'F3_other'];
  if (step === 'alt_intro') return ['A0'];
  if (/^(Q\d|A\d|O\d|F2)$/.test(step)) return [step];
  return [];
}
