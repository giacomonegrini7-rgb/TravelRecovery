import { useEffect, useId, useRef, useState } from 'react';
import type { QuestionnaireDefinition } from '../config/questionnaire';
import { publicBackend } from '../lib/backend';
import { errorText, type PublicConfig } from '../lib/backend/types';
import { Alert, Button } from '../ui/components';
import { href } from '../lib/router';

const EMAIL_RE = /^[^\s@<>(),;:"[\]]+@[^\s@<>(),;:"[\]]+\.[^\s@<>(),;:"[\]]{2,}$/;

export function EmailInvite({ def, config, participationId, alreadyShown, onDone }: {
  def: QuestionnaireDefinition; config: PublicConfig; participationId: string; alreadyShown: boolean;
  onDone: (o: 'subscribed' | 'declined') => void;
}) {
  const backend = publicBackend();
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; consent?: string }>({});
  const [busy, setBusy] = useState<'sub' | 'dec' | null>(null);
  const [fail, setFail] = useState<string | null>(null);
  const shownRef = useRef(alreadyShown);
  const id = useId();

  useEffect(() => {
    if (shownRef.current) return;
    shownRef.current = true;
    backend.emailShown(participationId).catch(() => backend.emailShown(participationId).catch(() => undefined));
  }, [backend, participationId]);

  const subscribe = async () => {
    const e = email.trim();
    const errs: typeof errors = {};
    if (!e) errs.email = 'Inserisci un indirizzo email per iscriverti.';
    else if (!EMAIL_RE.test(e.toLowerCase()) || e.length > 254) errs.email = 'Controlla l’indirizzo: sembra incompleto o non valido (esempio: nome@dominio.it).';
    if (!consent) errs.consent = 'Per iscriverti seleziona la casella del consenso.';
    setErrors(errs);
    if (errs.email || errs.consent) {
      document.getElementById(errs.email ? `${id}-email` : `${id}-consent`)?.focus();
      return;
    }
    setBusy('sub'); setFail(null);
    try {
      await backend.subscribe(participationId, e, true, config.consentVersion);
      onDone('subscribed');
    } catch (err) {
      setFail(errorText(err));
    } finally { setBusy(null); }
  };

  const decline = async () => {
    setBusy('dec'); setFail(null);
    try {
      await backend.decline(participationId);
      onDone('declined');
    } catch (err) {
      setFail(errorText(err));
    } finally { setBusy(null); }
  };

  return (
    <section className="step email-step">
      <div className="saved-badge" role="status"><span aria-hidden="true">✓</span> Le tue risposte sono state inviate.</div>
      <h1 className="h-screen" tabIndex={-1} data-autofocus>{def.texts.emailTitle}</h1>
      <p className="lead">{def.texts.emailBody}</p>
      <form className="email-form" noValidate onSubmit={(e) => { e.preventDefault(); void subscribe(); }}>
        <div className="field">
          <label className="field-label" htmlFor={`${id}-email`}>Il tuo indirizzo email</label>
          <input
            id={`${id}-email`} type="email" inputMode="email" autoComplete="email" value={email} maxLength={254}
            aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? `${id}-email-err` : undefined}
            onChange={(e) => { setEmail(e.target.value); setErrors((x) => ({ ...x, email: undefined })); }}
          />
          {errors.email && <p className="inline-msg inline-error" id={`${id}-email-err`}>{errors.email}</p>}
        </div>
        <label className={`consent ${errors.consent ? 'has-error' : ''}`}>
          <input
            id={`${id}-consent`} type="checkbox" checked={consent}
            aria-invalid={Boolean(errors.consent)} aria-describedby={errors.consent ? `${id}-consent-err` : undefined}
            onChange={(e) => { setConsent(e.target.checked); setErrors((x) => ({ ...x, consent: undefined })); }}
          />
          <span className="choice-mark mark-box" aria-hidden="true">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12.5 4.2 4.2L19 7" /></svg>
          </span>
          <span>{config.consentText}</span>
        </label>
        {errors.consent && <p className="inline-msg inline-error" id={`${id}-consent-err`}>{errors.consent}</p>}
        <p className="small muted">{def.texts.emailLinkNote} <a href={href('/privacy')} target="_blank" rel="noopener">Leggi l’informativa</a>.</p>
        {fail && <Alert>{fail} Puoi riprovare oppure terminare senza iscriverti.</Alert>}
        <div className="email-actions">
          <Button type="submit" busy={busy === 'sub'} disabled={busy === 'dec'}>Avvisami al lancio</Button>
          <Button type="button" variant="ghost" onClick={() => void decline()} busy={busy === 'dec'} disabled={busy === 'sub'}>No grazie, termina</Button>
        </div>
      </form>
    </section>
  );
}

export function Thanks({ def, outcome, onRestart }: { def: QuestionnaireDefinition; outcome: 'subscribed' | 'declined' | null; onRestart: () => void }) {
  return (
    <section className="step thanks">
      <div className="thanks-mark" aria-hidden="true">
        <svg viewBox="0 0 120 60" width="120" height="60">
          <path d="M8 46 C 34 46, 40 14, 66 14 S 100 30, 112 30" fill="none" stroke="var(--lagoon-500)" strokeWidth="2.5" strokeDasharray="5 6" strokeLinecap="round" />
          <circle cx="8" cy="46" r="5" fill="var(--lagoon-800)" />
          <circle cx="112" cy="30" r="7" fill="var(--signal)" />
        </svg>
      </div>
      <h1 className="h-screen" tabIndex={-1} data-autofocus>{outcome === 'subscribed' ? 'Richiesta registrata' : 'Grazie per il tuo contributo'}</h1>
      <p className="lead">{outcome === 'subscribed' ? def.texts.emailSuccess : def.texts.thanksNoEmail}</p>
      <p className="small muted">Puoi chiudere questa pagina.</p>
      <button className="link-quiet" onClick={onRestart}>Compila un nuovo questionario da capo</button>
    </section>
  );
}
