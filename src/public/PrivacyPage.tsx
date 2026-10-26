import { useEffect, useState, type ReactNode } from 'react';
import { publicBackend } from '../lib/backend';
import { errorText, type PublicConfig } from '../lib/backend/types';
import { Alert, Brand, Button, Spinner } from '../ui/components';
import { href } from '../lib/router';
import { PROJECT } from '../config/project';
import { ModeBanner } from './Shell';

function Field({ value, label }: { value: string | null | undefined; label: string }) {
  if (value && value.trim()) return <span className="pv-value">{value}</span>;
  return <span className="pv-missing">[{label}: da completare a cura del gruppo prima della raccolta reale]</span>;
}

export function PrivacyPage() {
  const [cfg, setCfg] = useState<PublicConfig | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = () => { setErr(null); publicBackend().getConfig().then(setCfg).catch((e) => setErr(errorText(e))); };
  useEffect(load, []);

  const pv = cfg?.privacy;
  const S = ({ title, children }: { title: string; children: ReactNode }) => (
    <section className="pv-section"><h2 className="h-block">{title}</h2>{children}</section>
  );

  return (
    <div className="shell">
      <ModeBanner mode={cfg?.mode} />
      <header className="topbar"><div className="topbar-inner"><a href={href('/')} className="brand-link"><Brand name={cfg?.projectName ?? PROJECT.name} /></a></div></header>
      <main className="page privacy" id="contenuto">
        <h1 className="h-screen">Informativa sul trattamento dei dati</h1>
        <p className="muted small">Versione {cfg?.privacyVersion ?? PROJECT.privacyVersion}</p>
        {err && <Alert action={<Button variant="secondary" onClick={load}>Riprova</Button>}>{err}</Alert>}
        {!cfg && !err && <Spinner label="Caricamento…" />}
        {cfg && (
          <>
            <S title="Chi siamo e perché raccogliamo questi dati">
              <p>Siamo un gruppo di studenti dell’Università di Bologna e svolgiamo una ricerca per un progetto universitario sul modo in cui le persone gestiscono prenotazioni e biglietti quando i programmi cambiano. Il progetto non è un servizio commerciale attivo e la demo usa esclusivamente dati inventati.</p>
              <p>Titolare del trattamento: <Field value={pv?.controller} label="Titolare del trattamento" /></p>
              <p>Contatto per informazioni e richieste: <Field value={pv?.contact} label="Indirizzo di contatto" /></p>
            </S>
            <S title="Quali dati raccogliamo">
              <ul className="bullets">
                <li>Le risposte alle domande del questionario, comprese quelle aperte facoltative.</li>
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
              <p>Base giuridica: <Field value={pv?.legal_basis} label="Base giuridica" /></p>
              <p>Periodo di conservazione: <Field value={pv?.retention} label="Periodo di conservazione" /></p>
            </S>
            <S title="Chi può accedere ai dati">
              <p>Solo i membri del gruppo autorizzati, tramite un’area riservata con accesso personale. Le risposte non sono visibili agli altri partecipanti.</p>
              <p>Destinatari e fornitori tecnici: <Field value={pv?.recipients} label="Destinatari e fornitori tecnici (es. hosting e database)" /></p>
            </S>
            <S title="I tuoi diritti">
              <p>Puoi chiedere informazioni, l’accesso o la cancellazione delle tue risposte e della tua email scrivendo al contatto indicato sopra. Se hai lasciato l’email puoi revocare in qualsiasi momento il consenso agli aggiornamenti: la revoca riguarda l’invio di aggiornamenti e non comporta automaticamente la cancellazione delle risposte, che puoi comunque chiedere separatamente.</p>
              <p>Per aiutarci a trovare la tua compilazione, indica se possibile l’email usata e la data approssimativa della partecipazione.</p>
            </S>
            {pv?.extra && <S title="Ulteriori informazioni"><p className="pre">{pv.extra}</p></S>}
          </>
        )}
        <p><a href={href('/')}>Torna al questionario</a></p>
      </main>
      <footer className="footer"><span>Progetto di ricerca universitario</span></footer>
    </div>
  );
}
