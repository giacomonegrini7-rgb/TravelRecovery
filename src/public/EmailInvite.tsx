import { useEffect, useId, useRef, useState } from 'react';
import type { QuestionnaireDefinition } from '../config/questionnaire';
import { publicBackend } from '../lib/backend';
import { errorText, type PublicConfig } from '../lib/backend/types';
import { Alert, Button } from '../ui/components';
import { href } from '../lib/router';
import { getLang, t } from '../i18n';
import { consentFor } from '../i18n/content';

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
  const consent_ = consentFor(getLang(), config.consentVersion, config.consentText);

  useEffect(() => {
    if (shownRef.current) return;
    shownRef.current = true;
    backend.emailShown(participationId).catch(() => backend.emailShown(participationId).catch(() => undefined));
  }, [backend, participationId]);

  const subscribe = async () => {
    const e = email.trim();
    const errs: typeof errors = {};
    if (!e) errs.email = t('emailEmpty');
    else if (!EMAIL_RE.test(e.toLowerCase()) || e.length > 254) errs.email = t('emailInvalid');
    if (!consent) errs.consent = t('consentMissing');
    setErrors(errs);
    if (errs.email || errs.consent) {
      document.getElementById(errs.email ? `${id}-email` : `${id}-consent`)?.focus();
      return;
    }
    setBusy('sub'); setFail(null);
    try {
      await backend.subscribe(participationId, e, true, consent_.version);
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
      <div className="saved-badge" role="status"><span aria-hidden="true">✓</span> {t('saved')}</div>
      <h1 className="h-screen" tabIndex={-1} data-autofocus>{def.texts.emailTitle}</h1>
      <p className="lead">{def.texts.emailBody}</p>
      <form className="email-form" noValidate onSubmit={(e) => { e.preventDefault(); void subscribe(); }}>
        <div className="field">
          <label className="field-label" htmlFor={`${id}-email`}>{t('emailLabel')}</label>
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
          <span>{consent_.text}</span>
        </label>
        {errors.consent && <p className="inline-msg inline-error" id={`${id}-consent-err`}>{errors.consent}</p>}
        <p className="small muted">{def.texts.emailLinkNote} <a href={href('/privacy')} target="_blank" rel="noopener">{t('readPrivacy')}</a>.</p>
        {fail && <Alert>{t('subscribeFail', { msg: fail })}</Alert>}
        <div className="email-actions">
          <Button type="submit" busy={busy === 'sub'} disabled={busy === 'dec'}>{t('subscribe')}</Button>
          <Button type="button" variant="ghost" onClick={() => void decline()} busy={busy === 'dec'} disabled={busy === 'sub'}>{t('decline')}</Button>
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
      <h1 className="h-screen" tabIndex={-1} data-autofocus>{outcome === 'subscribed' ? t('thanksSubscribed') : t('thanksDefault')}</h1>
      <p className="lead">{outcome === 'subscribed' ? def.texts.emailSuccess : def.texts.thanksNoEmail}</p>
      <p className="small muted">{t('canClose')}</p>
      <button className="link-quiet" onClick={onRestart}>{t('restart')}</button>
    </section>
  );
}
