import { useEffect, useState, type ReactNode } from 'react';
import { publicBackend } from '../lib/backend';
import { errorText, type PublicConfig } from '../lib/backend/types';
import { Alert, Brand, Button, Spinner } from '../ui/components';
import { href } from '../lib/router';
import { PROJECT } from '../config/project';
import { Footer, LangSwitch, ModeBanner } from './Shell';
import { t, useLang, type Lang } from '../i18n';

const FIELD_LABEL: Record<Lang, Record<string, string>> = {
  it: {
    controller: 'Titolare del trattamento', contact: 'Indirizzo di contatto', legal_basis: 'Base giuridica',
    retention: 'Periodo di conservazione', recipients: 'Destinatari e fornitori tecnici (es. hosting e database)',
  },
  en: {
    controller: 'Data controller', contact: 'Contact address', legal_basis: 'Legal basis',
    retention: 'Retention period', recipients: 'Recipients and technical providers (e.g. hosting and database)',
  },
};

function Field({ value, k, lang }: { value: string | null | undefined; k: string; lang: Lang }) {
  if (value && value.trim()) return <span className="pv-value">{value}</span>;
  return <span className="pv-missing">{t('pvMissing', { label: FIELD_LABEL[lang][k] })}</span>;
}

function S({ title, children }: { title: string; children: ReactNode }) {
  return <section className="pv-section"><h2 className="h-block">{title}</h2>{children}</section>;
}

function BodyIt({ pv }: { pv: PublicConfig['privacy'] | undefined }) {
  const F = (k: keyof PublicConfig['privacy']) => <Field value={pv?.[k]} k={k} lang="it" />;
  return (
    <>
      <S title="Chi siamo e perché raccogliamo questi dati">
        <p>Siamo un gruppo di studenti dell’Università di Bologna e svolgiamo una ricerca per un progetto universitario sul modo in cui le persone gestiscono prenotazioni e biglietti quando i programmi cambiano. Il progetto non è un servizio commerciale attivo e la demo usa esclusivamente dati inventati.</p>
        <p>Titolare del trattamento: {F('controller')}</p>
        <p>Contatto per informazioni e richieste: {F('contact')}</p>
      </S>
      <S title="Quali dati raccogliamo">
        <ul className="bullets">
          <li>Le risposte alle domande del questionario, comprese quelle aperte facoltative, e la lingua in cui hai compilato.</li>
          <li>Le principali interazioni con la demo: categoria scelta, esigenza indicata, alternative di cui hai aperto i dettagli, eventuale scelta e apertura del riepilogo simulato del fornitore.</li>
          <li>Data e ora dei passaggi essenziali (avvio, invio delle risposte, schermata email) e un codice tecnico della compilazione.</li>
          <li>Solo se decidi di iscriverti: il tuo indirizzo email e la registrazione del consenso (testo, versione, data e ora).</li>
        </ul>
        <p>Non chiediamo nome, età o altri dati demografici, né prenotazioni, documenti, codici di biglietti o dati di pagamento. Non registriamo intenzionalmente il tuo indirizzo IP o la tua posizione nel dataset della ricerca e non usiamo registrazioni della navigazione o tracciamento pubblicitario. Ti chiediamo di non inserire dati personali nelle risposte aperte.</p>
        <p>Per collegare le risposte alla tua compilazione usiamo una sessione tecnica anonima del nostro fornitore di database, conservata in questo browser.</p>
      </S>
      <S title="Email e collegamento alle risposte">
        <p>L’email è facoltativa e puoi completare il questionario senza lasciarla. Se ti iscrivi, l’email viene collegata alle risposte di questa partecipazione, per aiutarci a comprendere l’interesse verso il progetto: in quel caso le risposte <strong>non sono anonime</strong>. L’indirizzo serve solo a informarti sul lancio della versione finale del sito; non lo usiamo per pubblicità o newsletter.</p>
        <p>Non verifichiamo che l’indirizzo appartenga effettivamente a chi lo inserisce.</p>
      </S>
      <S title="Base giuridica e conservazione">
        <p>Base giuridica: {F('legal_basis')}</p>
        <p>Periodo di conservazione: {F('retention')}</p>
      </S>
      <S title="Chi può accedere ai dati">
        <p>Solo i membri del gruppo autorizzati, tramite un’area riservata con accesso personale. Le risposte non sono visibili agli altri partecipanti.</p>
        <p>Destinatari e fornitori tecnici: {F('recipients')}</p>
      </S>
      <S title="I tuoi diritti">
        <p>Puoi chiedere informazioni, l’accesso o la cancellazione delle tue risposte e della tua email scrivendo al contatto indicato sopra. Se hai lasciato l’email puoi revocare in qualsiasi momento il consenso agli aggiornamenti: la revoca riguarda l’invio di aggiornamenti e non comporta automaticamente la cancellazione delle risposte, che puoi comunque chiedere separatamente.</p>
        <p>Per aiutarci a trovare la tua compilazione, indica se possibile l’email usata e la data approssimativa della partecipazione.</p>
      </S>
      {pv?.extra && <S title="Ulteriori informazioni"><p className="pre">{pv.extra}</p></S>}
    </>
  );
}

function BodyEn({ pv }: { pv: PublicConfig['privacy'] | undefined }) {
  const F = (k: keyof PublicConfig['privacy']) => <Field value={pv?.[k]} k={k} lang="en" />;
  return (
    <>
      <S title="Who we are and why we collect this data">
        <p>We are a group of students at the University of Bologna carrying out research for a university project on how people deal with bookings and tickets when their plans change. The project is not an active commercial service and the demo uses only invented data.</p>
        <p>Data controller: {F('controller')}</p>
        <p>Contact for information and requests: {F('contact')}</p>
      </S>
      <S title="What data we collect">
        <ul className="bullets">
          <li>Your answers to the questionnaire, including the optional open questions, and the language you used.</li>
          <li>Your main interactions with the demo: the category chosen, the need selected, the alternatives whose details you opened, any choice you made and whether you opened the simulated provider summary.</li>
          <li>The date and time of the essential steps (start, submission of answers, email screen) and a technical code for the questionnaire.</li>
          <li>Only if you decide to sign up: your email address and a record of your consent (text, version, date and time).</li>
        </ul>
        <p>We do not ask for your name, age or other demographic data, nor for bookings, documents, ticket codes or payment data. We do not intentionally record your IP address or location in the research dataset, and we do not use session recording or advertising tracking. Please do not include personal data in the open answers.</p>
        <p>To link your answers to your questionnaire, we use an anonymous technical session from our database provider, stored in this browser.</p>
      </S>
      <S title="Email and link to your answers">
        <p>The email is optional and you can complete the questionnaire without leaving it. If you sign up, your email is linked to the answers of this participation, to help us understand interest in the project: in that case your answers are <strong>not anonymous</strong>. The address is only used to tell you about the launch of the final version of the site; we do not use it for advertising or newsletters.</p>
        <p>We do not verify that the address actually belongs to the person who enters it.</p>
      </S>
      <S title="Legal basis and retention">
        <p>Legal basis: {F('legal_basis')}</p>
        <p>Retention period: {F('retention')}</p>
      </S>
      <S title="Who can access the data">
        <p>Only authorised members of the team, through a private area with personal access. Answers are not visible to other participants.</p>
        <p>Recipients and technical providers: {F('recipients')}</p>
      </S>
      <S title="Your rights">
        <p>You can ask for information, access to, or deletion of your answers and your email by writing to the contact above. If you left your email, you can withdraw your consent to updates at any time: withdrawal concerns updates only and does not automatically delete your answers, which you can ask to delete separately.</p>
        <p>To help us find your questionnaire, please give the email you used and the approximate date you took part, if possible.</p>
      </S>
      {pv?.extra && <S title="Further information"><p className="pre">{pv.extra}</p></S>}
    </>
  );
}

export function PrivacyPage() {
  const lang = useLang();
  const [cfg, setCfg] = useState<PublicConfig | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = () => { setErr(null); publicBackend().getConfig().then(setCfg).catch((e) => setErr(errorText(e))); };
  useEffect(load, []);

  return (
    <div className="shell">
      <ModeBanner mode={cfg?.mode} />
      <header className="topbar">
        <div className="topbar-inner">
          <a href={href('/')} className="brand-link"><Brand name={cfg?.projectName ?? PROJECT.name} /></a>
          <LangSwitch />
        </div>
      </header>
      <main className="page privacy" id="contenuto">
        <h1 className="h-screen">{t('pvTitle')}</h1>
        <p className="muted small">{t('pvVersion', { v: cfg?.privacyVersion ?? PROJECT.privacyVersion })}</p>
        {lang === 'en' && <p className="small muted">Details entered by the team (such as the data controller) are shown as written and may be in Italian.</p>}
        {err && <Alert action={<Button variant="secondary" onClick={load}>{t('retry')}</Button>}>{err}</Alert>}
        {!cfg && !err && <Spinner label={t('pvLoading')} />}
        {cfg && (lang === 'en' ? <BodyEn pv={cfg.privacy} /> : <BodyIt pv={cfg.privacy} />)}
        <p><a href={href('/')}>{t('pvBack')}</a></p>
      </main>
      <Footer />
    </div>
  );
}
