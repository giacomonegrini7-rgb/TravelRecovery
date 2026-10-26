// Riepilogo deterministico dei fatti raccolti in una partecipazione.
// Nessuna interpretazione psicologica o classificazione generata da un modello.

import type { Dataset, DatasetParticipation } from './backend/types';
import { altLabel, catLabel, definitionsOf, PATH_LABEL } from './stats';
import { NEED_LABEL, type NeedId } from '../config/demoCases';

export function summaryLines(ds: Dataset, p: DatasetParticipation): string[] {
  const def = definitionsOf(ds)[p.questionnaire_version];
  const lbl = (qid: string, v: string | null | undefined) =>
    v ? def?.questions.find((q) => q.id === qid)?.options?.find((o) => o.id === v)?.label ?? v : null;
  const single = (qid: string) => {
    const a = p.answers.find((x) => x.question_id === qid && x.status === 'answered');
    return a?.value_single ?? null;
  };
  const lines: string[] = [];
  lines.push(p.status === 'completed' ? 'Questionario completato.' : `Compilazione non completata; ultima fase registrata: ${p.current_step}.`);
  if (p.is_test) lines.push('Partecipazione di test (esclusa dalle statistiche di ricerca per impostazione predefinita).');
  lines.push(p.path ? `Percorso: ${PATH_LABEL[p.path]}.` : 'Percorso non ancora determinato.');
  const q2 = lbl('Q2', single('Q2'));
  if (q2) lines.push(`Q2: «${q2}».`);
  if (p.path === 'experience') {
    const q3 = lbl('Q3', single('Q3'));
    const q9 = lbl('Q9', single('Q9'));
    if (q3) lines.push(`Episodio riferito a: ${q3.toLowerCase()}.`);
    if (q9) lines.push(`Risultato indicato: ${q9.toLowerCase()}.`);
  }
  if (p.explorations.length) {
    const ex = p.explorations.map((e) => `${catLabel(e.category)} (${NEED_LABEL[e.need_id as NeedId]?.title.toLowerCase() ?? e.need_id})`);
    lines.push(`Esempi provati: ${ex.join(', ')}.`);
    const opened = p.explorations.reduce((s, e) => s + e.details_opened.length, 0);
    lines.push(`Dettagli di alternative aperti: ${opened}.`);
    const choices = p.explorations.filter((e) => e.choice).map((e) => altLabel(ds, e.case_id, e.case_version, e.choice));
    if (choices.length) lines.push(`Scelte nella demo: ${choices.join(', ')}.`);
    const clicks = p.explorations.filter((e) => e.provider_clicked).length;
    if (clicks) lines.push(`Passaggio simulato al fornitore aperto in ${clicks} ${clicks === 1 ? 'esempio' : 'esempi'}.`);
  } else {
    lines.push('Nessun esempio della demo avviato.');
  }
  const f2 = lbl('F2', single('F2'));
  const f3 = lbl('F3', single('F3'));
  if (f2) lines.push(`F2: «${f2}».`);
  if (f3) lines.push(`F3: «${f3}».`);
  const em = { not_shown: 'Invito email non visualizzato.', shown: 'Invito email visualizzato, nessuna decisione registrata.', declined: 'Invito email rifiutato esplicitamente.', subscribed: 'Richiesta di aggiornamenti registrata.' };
  lines.push(em[p.email_screen]);
  return lines;
}
