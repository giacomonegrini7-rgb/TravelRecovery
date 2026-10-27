import { useId, type ReactNode, type ButtonHTMLAttributes } from 'react';
import type { QOption } from '../config/questionnaire';
import { IconAlert, IconCheck } from './icons';
import { t, locale } from '../i18n';

export function Button({ variant = 'primary', busy, children, className = '', ...rest }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; busy?: boolean }) {
  return (
    <button {...rest} className={`btn btn-${variant} ${className}`} aria-busy={busy || undefined} disabled={rest.disabled || busy}>
      {busy && <span className="spinner" aria-hidden="true" />}
      <span>{children}</span>
    </button>
  );
}

export function Alert({ tone = 'error', children, action }: { tone?: 'error' | 'info' | 'success'; children: ReactNode; action?: ReactNode }) {
  return (
    <div className={`alert alert-${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      <span className="alert-icon" aria-hidden="true">{tone === 'success' ? <IconCheck size={18} /> : <IconAlert size={18} />}</span>
      <div className="alert-body">{children}</div>
      {action && <div className="alert-action">{action}</div>}
    </div>
  );
}

export function Spinner({ label }: { label: string }) {
  return (
    <div className="loading" role="status">
      <span className="spinner spinner-lg" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

/** Lista di opzioni: radio (singola) o checkbox (multipla), con indicatori visivamente distinti. */
export function ChoiceList({ name, options, multi, value, onToggle, legend, describedBy, compact }: {
  name: string; options: QOption[]; multi: boolean; value: string[]; onToggle: (id: string) => void;
  legend: ReactNode; describedBy?: string; compact?: boolean;
}) {
  return (
    <fieldset className={`choices ${compact ? 'choices-compact' : ''}`} aria-describedby={describedBy}>
      <legend className="sr-only">{legend}</legend>
      {options.map((o) => {
        const checked = value.includes(o.id);
        return (
          <label key={o.id} className={`choice ${checked ? 'is-checked' : ''} ${o.exclusive ? 'is-exclusive' : ''}`}>
            <input
              type={multi ? 'checkbox' : 'radio'} name={name} value={o.id} checked={checked}
              onChange={() => onToggle(o.id)}
            />
            <span className={`choice-mark ${multi ? 'mark-box' : 'mark-radio'}`} aria-hidden="true">
              {multi && <IconCheck size={14} strokeWidth={2.6} />}
            </span>
            <span className="choice-label">{o.label}</span>
          </label>
        );
      })}
    </fieldset>
  );
}

export function TextAreaCounter({ label, value, onChange, max, help, rows = 5 }: {
  label: ReactNode; value: string; onChange: (v: string) => void; max: number; help?: string; rows?: number;
}) {
  const id = useId();
  const left = max - value.length;
  return (
    <div className="field">
      <label htmlFor={id} className="field-label">{label}</label>
      {help && <p className="field-help" id={`${id}-help`}>{help}</p>}
      <textarea
        id={id} value={value} rows={rows} maxLength={max}
        aria-describedby={`${id}-help ${id}-count`}
        onChange={(e) => onChange(e.target.value.slice(0, max))}
      />
      <p className={`counter ${left < 60 ? 'counter-low' : ''}`} id={`${id}-count`} aria-live="polite">
        {t('chars', { n: value.length.toLocaleString(locale()), max: max.toLocaleString(locale()) })}
      </p>
    </div>
  );
}

export function Brand({ name, light }: { name: string; light?: boolean }) {
  return (
    <span className={`brand ${light ? 'brand-light' : ''}`}>
      <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true">
        <circle cx="5" cy="20" r="3" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path d="M8 20h5.5a4 4 0 0 0 0-8H12a4 4 0 0 1 0-8h6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <circle cx="21" cy="4" r="2.6" fill="var(--signal)" />
      </svg>
      <span className="brand-name">{name}</span>
    </span>
  );
}

/** Link "salta al contenuto" che non interferisce con il router a hash. */
export function SkipLink() {
  return (
    <a className="skip-link" href="#contenuto" onClick={(e) => {
      e.preventDefault();
      const m = document.getElementById('contenuto');
      if (m) { m.setAttribute('tabindex', '-1'); m.focus(); }
    }}>{t('skip')}</a>
  );
}
