// Definizione versionata del questionario (q-v1).
// Gli ID di domande e opzioni sono stabili e separati dalle etichette visibili.
// Questa definizione è anche copiata nel database (tabella questionnaire_versions)
// tramite `npm run gen:seed`, così i report storici usano sempre la versione corretta.

export type Branch = 'common' | 'experience' | 'alt_gate' | 'alternative' | 'feedback';
export type QType = 'single' | 'multi' | 'text';

export interface QOption {
  id: string;
  label: string;
  /** Opzione esclusiva: deseleziona tutte le altre e viceversa. */
  exclusive?: boolean;
}

export interface Question {
  id: string;
  branch: Branch;
  type: QType;
  title: string;
  help?: string;
  options?: QOption[];
  /** Numero massimo di opzioni selezionabili (solo multi). */
  max?: number;
  required: boolean;
  maxLength?: number;
  /** Testo mostrato quando viene scelta una certa opzione. */
  notes?: Record<string, string>;
  /** Etichetta breve per dashboard ed export. */
  short: string;
}

export interface QuestionnaireDefinition {
  version: string;
  questions: Question[];
  texts: Record<string, string>;
}

const OPEN_HELP = 'Facoltativa. Non inserire nomi, codici di prenotazione o altri dati personali.';

const CLARITY_OPTIONS: QOption[] = [
  { id: 'not_at_all', label: 'Per niente chiaro' },
  { id: 'slightly', label: 'Poco chiaro' },
  { id: 'fairly', label: 'Abbastanza chiaro' },
  { id: 'very', label: 'Molto chiaro' },
  { id: 'completely', label: 'Del tutto chiaro' },
  { id: 'cannot_say', label: 'Non saprei valutarlo' },
];

export const QUESTIONNAIRE_V1: QuestionnaireDefinition = {
  version: 'q-v1',
  texts: {
    introTitle: 'Quando cambiano i programmi, cosa fai con le tue prenotazioni?',
    introBody1:
      'Siamo un gruppo di studenti dell’Università di Bologna e stiamo svolgendo una ricerca per un progetto universitario. Ti faremo alcune domande sulle tue esperienze con prenotazioni e biglietti già acquistati. Poi potrai esplorare una breve demo e dirci cosa ne pensi.',
    introBody2:
      'Non ci sono risposte giuste o sbagliate. La partecipazione è volontaria e puoi interrompere quando vuoi. Non ti chiediamo di caricare prenotazioni reali o inserire dati personali nelle risposte. Alla fine, se vorrai ricevere aggiornamenti sul lancio, potrai lasciare facoltativamente la tua email.',
    introNote:
      'Le risposte e le principali interazioni con la demo saranno utilizzate dal gruppo per questa ricerca. Se decidi di lasciare la tua email, sarà collegata alla tua partecipazione. Puoi leggere i dettagli nell’informativa.',
    experienceIntro:
      'Pensa alla situazione ancora aperta oppure, se non ne hai, all’episodio più recente. Rispondi alle prossime domande facendo riferimento sempre a quell’episodio.',
    alternativeIntro:
      'Pensa all’ultima volta che hai acquistato un biglietto o prenotato un viaggio, un soggiorno o un evento. Ci interessa capire cosa hai considerato prima dell’acquisto.',
    demoTransition1: 'Grazie! Ora puoi esplorare un esempio di come potrebbe funzionare Travel Recovery.',
    demoTransition2:
      'Il servizio che stiamo immaginando ti aiuterebbe a capire le alternative disponibili per una prenotazione e i passaggi per procedere con il fornitore.',
    demoTransition3:
      'Quella che vedrai è una simulazione: prenotazioni, fornitori, importi e condizioni sono inventati a scopo dimostrativo. Non verranno effettuati pagamenti o modifiche reali.',
    feedbackIntro:
      'Ora ci interessa il tuo parere sull’esempio che hai provato. Anche se il servizio non ti sarebbe utile, sapere perché ci aiuta a migliorare il progetto.',
    emailTitle: 'Vuoi sapere quando Travel Recovery sarà disponibile?',
    emailBody:
      'Se questa idea ti interessa, puoi lasciarci la tua email: ti aggiorneremo sul lancio della versione finale del sito. È facoltativo e puoi terminare il questionario anche senza iscriverti.',
    emailLinkNote:
      'Se ti iscrivi, la tua email sarà collegata alle risposte di questa partecipazione, per aiutarci a comprendere l’interesse verso il progetto.',
    emailSuccess: 'Grazie! La tua richiesta è stata registrata. Ti aggiorneremo sul lancio di Travel Recovery.',
    thanksNoEmail:
      'Grazie per il tuo contributo! Il tuo parere ci aiuta a capire per chi questa idea potrebbe essere utile e quali aspetti migliorare.',
  },
  questions: [
    {
      id: 'Q1', branch: 'common', type: 'multi', required: true, short: 'Servizi acquistati (12 mesi)',
      title: 'Negli ultimi 12 mesi, quali di questi servizi hai acquistato o prenotato personalmente?',
      options: [
        { id: 'hotel', label: 'Soggiorni in hotel o altre strutture' },
        { id: 'train', label: 'Viaggi in treno' },
        { id: 'flight', label: 'Voli' },
        { id: 'sport', label: 'Eventi sportivi' },
        { id: 'concert', label: 'Concerti, spettacoli o altri eventi' },
        { id: 'none', label: 'Nessuno di questi', exclusive: true },
      ],
    },
    {
      id: 'Q2', branch: 'common', type: 'single', required: true, short: 'Esperienza di modifica/rinuncia',
      title: 'Ti è mai capitato di dover modificare o rinunciare a una prenotazione o a un biglietto già acquistato?',
      options: [
        { id: 'yes_open', label: 'Sì, e sto ancora cercando di risolvere la situazione' },
        { id: 'yes_once_closed', label: 'Sì, una volta, ma la situazione si è conclusa' },
        { id: 'yes_many_closed', label: 'Sì, più volte, ma al momento non ho situazioni aperte' },
        { id: 'no', label: 'No, non mi è mai capitato' },
        { id: 'dont_remember', label: 'Non ricordo' },
      ],
    },
    // ——— Percorso esperienza ———
    {
      id: 'Q3', branch: 'experience', type: 'single', required: true, short: 'Servizio dell’episodio',
      title: 'A quale servizio si riferiva la prenotazione che dovevi modificare o non potevi più utilizzare?',
      options: [
        { id: 'hotel', label: 'Hotel o altra struttura ricettiva' },
        { id: 'train', label: 'Treno' },
        { id: 'flight', label: 'Volo' },
        { id: 'sport', label: 'Evento sportivo' },
        { id: 'concert', label: 'Concerto, spettacolo o altro evento' },
        { id: 'multiple', label: 'Più servizi dello stesso viaggio' },
      ],
      notes: { multiple: 'Per le prossime domande, pensa al servizio che hai affrontato per primo.' },
    },
    {
      id: 'Q4', branch: 'experience', type: 'single', required: true, short: 'Motivo',
      title: 'Che cosa aveva reso necessario cercare un’alternativa?',
      options: [
        { id: 'own_change', label: 'Un cambiamento dei miei programmi o un imprevisto personale' },
        { id: 'other_person_change', label: 'Un cambiamento dei programmi di un’altra persona coinvolta' },
        { id: 'booking_error', label: 'Un errore nella prenotazione o nell’acquisto' },
        { id: 'provider_change', label: 'Il fornitore aveva annullato o modificato il servizio' },
        { id: 'other', label: 'Altro' },
        { id: 'prefer_not', label: 'Preferisco non rispondere' },
      ],
    },
    {
      id: 'Q5', branch: 'experience', type: 'multi', required: true, short: 'Fonti consultate',
      title: 'Dove hai cercato informazioni per capire cosa potevi fare?',
      options: [
        { id: 'confirmation', label: 'Email di conferma, biglietto o condizioni della prenotazione' },
        { id: 'provider_site', label: 'Sito o app del fornitore, ad esempio hotel o compagnia di trasporto' },
        { id: 'intermediary_site', label: 'Sito o app dell’intermediario con cui avevo prenotato' },
        { id: 'customer_care', label: 'Assistenza clienti tramite telefono, chat o email' },
        { id: 'search_engines', label: 'Motori di ricerca' },
        { id: 'ai_tools', label: 'Strumenti di intelligenza artificiale' },
        { id: 'social', label: 'Amici, familiari, social o forum' },
        { id: 'other', label: 'Altro' },
        { id: 'did_not_search', label: 'Non ho cercato informazioni', exclusive: true },
      ],
    },
    {
      id: 'Q6', branch: 'experience', type: 'single', required: true, short: 'Tempo dedicato',
      title: 'Quanto tempo hai dedicato complessivamente a cercare e capire le alternative disponibili?',
      help: 'Considera il tempo dedicato attivamente alla ricerca, alla lettura e ai contatti con l’assistenza, comprese le attese al telefono. Se la situazione è ancora aperta, considera il tempo impiegato finora.',
      options: [
        { id: 'none', label: 'Non ho dedicato tempo alla ricerca' },
        { id: 'lt15', label: 'Meno di 15 minuti' },
        { id: '15_30', label: 'Da 15 a meno di 30 minuti' },
        { id: '30_60', label: 'Da 30 minuti a meno di un’ora' },
        { id: '1_2h', label: 'Da una a due ore' },
        { id: 'gt2h', label: 'Più di due ore' },
        { id: 'dont_remember', label: 'Non ricordo' },
      ],
    },
    {
      id: 'Q7', branch: 'experience', type: 'single', required: true, short: 'Facilità nel capire',
      title: 'Nel complesso, quanto è stato facile o difficile capire quali alternative si applicavano alla tua prenotazione?',
      options: [
        { id: 'very_easy', label: 'Molto facile' },
        { id: 'fairly_easy', label: 'Abbastanza facile' },
        { id: 'neutral', label: 'Né facile né difficile' },
        { id: 'fairly_hard', label: 'Abbastanza difficile' },
        { id: 'very_hard', label: 'Molto difficile' },
        { id: 'not_enough_info', label: 'Non ho cercato informazioni sufficienti per valutarlo' },
      ],
    },
    {
      id: 'Q8', branch: 'experience', type: 'multi', required: true, max: 3, short: 'Difficoltà incontrate',
      title: 'Quali difficoltà, se presenti, hai incontrato?',
      options: [
        { id: 'where_to_look', label: 'Capire dove cercare le informazioni' },
        { id: 'merge_sources', label: 'Riunire informazioni distribuite tra più fonti' },
        { id: 'which_conditions', label: 'Capire quali condizioni si applicavano alla mia prenotazione' },
        { id: 'costs', label: 'Capire costi, penali o importi recuperabili' },
        { id: 'deadlines', label: 'Capire entro quando dovevo agire' },
        { id: 'compare', label: 'Confrontare le alternative e scegliere' },
        { id: 'support_answer', label: 'Ottenere una risposta chiara dall’assistenza' },
        { id: 'complete_procedure', label: 'Completare la procedura dopo aver capito cosa fare' },
        { id: 'other', label: 'Altro' },
        { id: 'no_difficulty', label: 'Non ho incontrato difficoltà', exclusive: true },
        { id: 'did_not_search', label: 'Non ho cercato informazioni', exclusive: true },
      ],
    },
    {
      id: 'Q9', branch: 'experience', type: 'single', required: true, short: 'Risultato',
      title: 'Qual è stato il risultato principale, oppure a che punto sei adesso?',
      options: [
        { id: 'full_refund', label: 'Ho ottenuto un rimborso completo' },
        { id: 'partial_refund', label: 'Ho ottenuto un rimborso parziale' },
        { id: 'voucher', label: 'Ho ricevuto un voucher o credito' },
        { id: 'modified', label: 'Ho modificato la prenotazione per utilizzarla' },
        { id: 'transferred', label: 'Ho ceduto il biglietto o la prenotazione a un’altra persona' },
        { id: 'used_original', label: 'Alla fine ho utilizzato la prenotazione originale' },
        { id: 'lost', label: 'Non ho utilizzato la prenotazione e non ho recuperato nulla' },
        { id: 'still_open', label: 'La situazione è ancora aperta' },
        { id: 'other', label: 'Altro' },
      ],
    },
    {
      id: 'O1', branch: 'experience', type: 'text', required: false, maxLength: 1200, short: 'Racconto (aperta)',
      title: 'Ripensando a quell’episodio, che cosa ha reso semplice o difficile capire come procedere? Se ti va, raccontaci un passaggio concreto.',
      help: OPEN_HELP,
    },
    // ——— Scelta del sottogruppo (percorso alternativo) ———
    {
      id: 'A0', branch: 'alt_gate', type: 'single', required: true, short: 'Sottogruppo',
      title: 'Pensa all’ultima volta che hai acquistato un biglietto o prenotato un viaggio, un soggiorno o un evento.',
      options: [
        { id: 'continue', label: 'Ho in mente un acquisto: continua' },
        { id: 'never_purchased', label: 'Non ho mai acquistato personalmente questi servizi' },
      ],
    },
    // ——— Percorso alternativo ———
    {
      id: 'A1', branch: 'alternative', type: 'single', required: true, short: 'Preoccupazione prima dell’acquisto',
      title: 'Prima di quell’acquisto, quanto ti preoccupava la possibilità di dover cambiare programmi e non poter utilizzare la prenotazione?',
      options: [
        { id: 'not_at_all', label: 'Per niente' },
        { id: 'little', label: 'Poco' },
        { id: 'fairly', label: 'Abbastanza' },
        { id: 'very', label: 'Molto' },
        { id: 'not_considered', label: 'Non avevo considerato questa possibilità' },
        { id: 'dont_remember', label: 'Non ricordo' },
      ],
    },
    {
      id: 'A2', branch: 'alternative', type: 'multi', required: true, short: 'Condizioni controllate',
      title: 'Prima di acquistare, quali condizioni hai controllato?',
      options: [
        { id: 'refund', label: 'Se fosse possibile ottenere un rimborso' },
        { id: 'change_dates', label: 'Se fosse possibile modificare date o orari' },
        { id: 'other_person', label: 'Se un’altra persona potesse utilizzare il biglietto o la prenotazione' },
        { id: 'costs', label: 'Quali costi o penali fossero previsti' },
        { id: 'deadlines', label: 'Entro quando fosse possibile chiedere modifiche o cancellazioni' },
        { id: 'not_checked', label: 'Non ho controllato queste condizioni', exclusive: true },
        { id: 'dont_remember', label: 'Non ricordo', exclusive: true },
      ],
    },
    {
      id: 'A3', branch: 'alternative', type: 'single', required: true, short: 'Chiarezza delle possibilità',
      title: 'Quanto ti erano chiare le possibilità disponibili nel caso in cui avessi dovuto cambiare programmi?',
      options: [
        { id: 'not_at_all', label: 'Per niente chiare' },
        { id: 'slightly', label: 'Poco chiare' },
        { id: 'fairly', label: 'Abbastanza chiare' },
        { id: 'very', label: 'Molto chiare' },
        { id: 'completely', label: 'Del tutto chiare' },
        { id: 'not_searched', label: 'Non avevo cercato queste informazioni' },
        { id: 'dont_remember', label: 'Non ricordo' },
      ],
    },
    {
      id: 'A4', branch: 'alternative', type: 'multi', required: true, short: 'Influenza sulla scelta',
      title: 'La possibilità di dover cambiare programmi ha influenzato la tua scelta finale?',
      options: [
        { id: 'flexible_fare', label: 'Ho scelto una tariffa con maggiori possibilità di modifica o cancellazione' },
        { id: 'insurance', label: 'Ho aggiunto un’assicurazione o una protezione per la cancellazione' },
        { id: 'other_provider', label: 'Ho scelto un altro fornitore con condizioni più adatte alle mie esigenze' },
        { id: 'waited', label: 'Ho aspettato di essere più sicuro dei miei programmi prima di acquistare' },
        { id: 'cheapest', label: 'Ho mantenuto l’opzione più economica, accettandone le limitazioni' },
        { id: 'no_influence', label: 'Non ha influenzato la mia scelta', exclusive: true },
        { id: 'other', label: 'Altro' },
        { id: 'dont_remember', label: 'Non ricordo', exclusive: true },
      ],
    },
    {
      id: 'O2', branch: 'alternative', type: 'text', required: false, maxLength: 1200, short: 'Cosa capire meglio (aperta)',
      title: 'Prima di acquistare, c’era qualcosa che avresti voluto capire meglio su cosa sarebbe successo se i tuoi programmi fossero cambiati? Se ti va, raccontacelo.',
      help: OPEN_HELP,
    },
    // ——— Domande finali sulla demo ———
    {
      id: 'F1a', branch: 'feedback', type: 'single', required: true, short: 'F1a Chiarezza alternative',
      title: 'Quali alternative sono disponibili per la prenotazione di esempio.',
      options: CLARITY_OPTIONS,
    },
    {
      id: 'F1b', branch: 'feedback', type: 'single', required: true, short: 'F1b Chiarezza alternativa vantaggiosa',
      title: 'Quale alternativa sarebbe più vantaggiosa per te, considerando quanto recupereresti, eventuali costi e le tue esigenze.',
      options: CLARITY_OPTIONS,
    },
    {
      id: 'F2', branch: 'feedback', type: 'single', required: true, short: 'F2 Utilità',
      title: 'Rispetto al modo in cui cercheresti normalmente queste informazioni, quanto ti sarebbe utile un servizio come quello mostrato?',
      options: [
        { id: 'not_at_all', label: 'Per niente utile' },
        { id: 'slightly', label: 'Poco utile' },
        { id: 'fairly', label: 'Abbastanza utile' },
        { id: 'very', label: 'Molto utile' },
        { id: 'extremely', label: 'Estremamente utile' },
        { id: 'cannot_say', label: 'Non saprei valutarlo' },
      ],
    },
    {
      id: 'F3', branch: 'feedback', type: 'single', required: true, short: 'F3 Ostacolo principale',
      title: 'Quale sarebbe il principale ostacolo a utilizzare un servizio come questo?',
      options: [
        { id: 'prefer_provider', label: 'Preferirei cercare le informazioni direttamente dal fornitore' },
        { id: 'trust', label: 'Non mi fiderei abbastanza della correttezza o dell’aggiornamento delle informazioni' },
        { id: 'no_upload', label: 'Non vorrei caricare la mia prenotazione' },
        { id: 'want_completion', label: 'Vorrei che il servizio completasse anche la procedura per me' },
        { id: 'too_rare', label: 'Mi capita troppo raramente di avere questa esigenza' },
        { id: 'not_understood', label: 'Non ho capito abbastanza bene come funzionerebbe' },
        { id: 'need_price', label: 'Dovrei conoscere il prezzo prima di decidere' },
        { id: 'no_obstacle', label: 'Nessun ostacolo particolare, sulla base della demo' },
        { id: 'other', label: 'Altro' },
      ],
    },
    {
      id: 'F3_other', branch: 'feedback', type: 'text', required: false, maxLength: 300, short: 'F3 Altro (testo)',
      title: 'Altro ostacolo (facoltativo)',
    },
  ],
};

export const QUESTIONNAIRES: Record<string, QuestionnaireDefinition> = { 'q-v1': QUESTIONNAIRE_V1 };

export function getQuestion(def: QuestionnaireDefinition, id: string): Question {
  const q = def.questions.find((x) => x.id === id);
  if (!q) throw new Error(`Domanda sconosciuta: ${id}`);
  return q;
}

export function optionLabel(def: QuestionnaireDefinition, qid: string, oid: string): string {
  const q = def.questions.find((x) => x.id === qid);
  return q?.options?.find((o) => o.id === oid)?.label ?? oid;
}
