import { useId, useState, type ReactNode } from 'react';
import type { Question, QuestionnaireDefinition } from '../config/questionnaire';
import { getQuestion } from '../config/questionnaire';
import { toggleMulti, validateAnswer, type AnswerValue, type Answers } from '../lib/flow';
import type { ExplorationState } from '../lib/backend/types';
import { Button, ChoiceList, TextAreaCounter } from '../ui/components';
import { IconArrowLeft, IconArrowRight } from '../ui/icons';
import { categoryLabel } from '../i18n/content';
import { t } from '../i18n';
import { F3_OTHER_MAX } from '../config/project';

interface Common { busy: boolean; onBack?: () => void; error: ReactNode }

export function StepFrame({ eyebrow, title, help, children, onBack, onNext, nextLabel, busy, error, wide }: {
  eyebrow?: ReactNode; title: ReactNode; help?: ReactNode; children?: ReactNode; onBack?: () => void;
  onNext: () => void; nextLabel?: string; busy: boolean; error: ReactNode; wide?: boolean;
}) {
  return (
    <section className={`step ${wide ? 'step-wide' : ''}`}>
      {eyebrow && <p className="step-eyebrow">{eyebrow}</p>}
      <h1 className="h-screen" tabIndex={-1} data-autofocus>{title}</h1>
      {help && <div className="step-help">{help}</div>}
      <form className="step-body" onSubmit={(e) => { e.preventDefault(); onNext(); }} noValidate>
        {children}
        {error}
        <div className="step-nav">
          {onBack ? (
            <Button type="button" variant="ghost" onClick={onBack} disabled={busy} className="btn-back">
              <IconArrowLeft size={18} /> {t('back')}
            </Button>
          ) : <span />}
          <Button type="submit" busy={busy}>{nextLabel ?? t('continue')}</Button>
        </div>
      </form>
    </section>
  );
}

function hintFor(q: Question): string | null {
  if (q.type === 'single') return t('hintSingle');
  if (q.type === 'multi') return q.max ? t('hintMultiMax', { max: q.max }) : t('hintMulti');
  return null;
}

function valuesOf(v: AnswerValue | undefined): string[] {
  if (!v) return [];
  if (v.kind === 'single') return [v.value];
  if (v.kind === 'multi') return v.values;
  return [];
}

/** Controllo di una domanda chiusa, con gestione di esclusività e limite. */
export function ClosedQuestion({ q, value, onChange, showHint = true, invalid, titleId }: {
  q: Question; value: AnswerValue | undefined; onChange: (v: AnswerValue | undefined) => void;
  showHint?: boolean; invalid?: string | null; titleId?: string;
}) {
  const [limitMsg, setLimitMsg] = useState<string | null>(null);
  const hintId = useId();
  const vals = valuesOf(value);
  const multi = q.type === 'multi';
  const note = vals.map((v) => q.notes?.[v]).find(Boolean);
  return (
    <div className="question">
      {showHint && (
        <p className="choice-hint" id={hintId}>
          {hintFor(q)}{q.max ? <span className="choice-count"> {t('selectedCount', { n: vals.length, max: q.max })}</span> : null}
        </p>
      )}
      {q.max && limitMsg && <p className="inline-msg inline-warn limit-top" role="alert">{limitMsg}</p>}
      <ChoiceList
        name={q.id} options={q.options ?? []} multi={multi} value={vals} legend={q.title}
        describedBy={[showHint ? hintId : '', titleId ?? ''].join(' ').trim() || undefined}
        onToggle={(id) => {
          if (multi) {
            const r = toggleMulti(q, vals, id);
            setLimitMsg(r.error);
            onChange(r.values.length ? { kind: 'multi', values: r.values } : undefined);
          } else {
            onChange({ kind: 'single', value: id });
          }
        }}
      />
      <div aria-live="polite" className="question-live">
        {limitMsg && !q.max && <p className="inline-msg inline-warn">{limitMsg}</p>}
        {!limitMsg && invalid && <p className="inline-msg inline-error">{invalid}</p>}
        {note && <p className="inline-msg inline-info">{note}</p>}
      </div>
    </div>
  );
}

export function QuestionScreen({ q, answers, setAnswer, onNext, ...c }: Common & {
  q: Question; answers: Answers; setAnswer: (id: string, v: AnswerValue | undefined) => void; onNext: () => void;
}) {
  const [invalid, setInvalid] = useState<string | null>(null);
  const v = answers[q.id];
  if (q.type === 'text') {
    const text = v?.kind === 'text' ? v.text : '';
    return (
      <StepFrame title={q.title} onNext={onNext} {...c} help={<p className="optional-tag">{t('optional')}</p>}>
        <TextAreaCounter
          label={t('yourAnswer')} value={text} max={q.maxLength ?? 1200} help={q.help}
          onChange={(x) => setAnswer(q.id, x ? { kind: 'text', text: x } : undefined)}
        />
      </StepFrame>
    );
  }
  return (
    <StepFrame
      title={q.title} help={q.help ? <p>{q.help}</p> : undefined} {...c}
      onNext={() => {
        const err = validateAnswer(q, v);
        setInvalid(err);
        if (!err) onNext();
      }}
    >
      <ClosedQuestion q={q} value={v} invalid={invalid} onChange={(nv) => { setInvalid(null); setAnswer(q.id, nv); }} />
    </StepFrame>
  );
}

export function ExperienceIntro({ text, onNext, ...c }: Common & { text: string; onNext: () => void }) {
  return (
    <StepFrame eyebrow={t('expEyebrow')} title={t('expTitle')} onNext={onNext} {...c}>
      <div className="callout"><p>{text}</p></div>
    </StepFrame>
  );
}

export function AlternativeIntro({ def, answers, setAnswer, onNext, ...c }: Common & {
  def: QuestionnaireDefinition; answers: Answers; setAnswer: (id: string, v: AnswerValue | undefined) => void;
  onNext: (v: AnswerValue) => void;
}) {
  const sel = answers.A0?.kind === 'single' ? answers.A0.value : 'continue';
  const never = sel === 'never_purchased';
  return (
    <StepFrame
      eyebrow={t('expEyebrow')} title={t('altTitle')} {...c}
      onNext={() => onNext({ kind: 'single', value: never ? 'never_purchased' : 'continue' })}
    >
      <div className="callout"><p>{def.texts.alternativeIntro}</p></div>
      <label className={`secondary-choice ${never ? 'is-checked' : ''}`}>
        <input
          type="checkbox" checked={never}
          onChange={(e) => setAnswer('A0', { kind: 'single', value: e.target.checked ? 'never_purchased' : 'continue' })}
        />
        <span className="choice-mark mark-box" aria-hidden="true">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12.5 4.2 4.2L19 7" /></svg>
        </span>
        <span>{t('neverPurchased')}</span>
      </label>
      {never && <p className="inline-msg inline-info">{t('neverNote')}</p>}
    </StepFrame>
  );
}

export function DemoIntro({ def, onNext, ...c }: Common & { def: QuestionnaireDefinition; onNext: () => void }) {
  return (
    <StepFrame title={def.texts.demoTransition1} onNext={onNext} nextLabel={t('tryDemo')} {...c}>
      <div className="demo-intro">
        <p>{def.texts.demoTransition2}</p>
        <div className="callout callout-demo">
          <span className="demo-chip demo-chip-inline">{t('demoChip')}</span>
          <p>{def.texts.demoTransition3}</p>
        </div>
        <p className="demo-after"><IconArrowRight size={18} /> {t('demoIntroAfter')}</p>
      </div>
    </StepFrame>
  );
}

export function F1Screen({ def, answers, setAnswer, onNext, reference, multipleExamples, ...c }: Common & {
  def: QuestionnaireDefinition; answers: Answers; setAnswer: (id: string, v: AnswerValue | undefined) => void;
  onNext: () => void; reference: ExplorationState | null; multipleExamples: boolean;
}) {
  const [invalid, setInvalid] = useState<Record<string, string | null>>({});
  const qa = getQuestion(def, 'F1a');
  const qb = getQuestion(def, 'F1b');
  return (
    <StepFrame
      eyebrow={t('feedbackEyebrow')} title={t('f1Title')} wide {...c}
      help={
        <>
          <p>{def.texts.feedbackIntro}</p>
          {multipleExamples && reference && (
            <p className="callout callout-slim">{t('f1Reference')} <strong>{categoryLabel(reference.category)}</strong>.</p>
          )}
        </>
      }
      onNext={() => {
        const ea = validateAnswer(qa, answers.F1a);
        const eb = validateAnswer(qb, answers.F1b);
        setInvalid({ F1a: ea, F1b: eb });
        if (!ea && !eb) onNext();
      }}
    >
      <div className="f1-grid">
        {[qa, qb].map((q, i) => (
          <div className="f1-block" key={q.id}>
            <h2 className="h-block" id={`t-${q.id}`}><span className="f1-letter" aria-hidden="true">{i === 0 ? 'a' : 'b'}</span>{q.title}</h2>
            <ClosedQuestion q={q} titleId={`t-${q.id}`} value={answers[q.id]} showHint={false} invalid={invalid[q.id]}
              onChange={(v) => { setInvalid((x) => ({ ...x, [q.id]: null })); setAnswer(q.id, v); }} />
          </div>
        ))}
      </div>
    </StepFrame>
  );
}

export function F3Screen({ def, answers, setAnswer, onSubmit, ...c }: Common & {
  def: QuestionnaireDefinition; answers: Answers; setAnswer: (id: string, v: AnswerValue | undefined) => void;
  onSubmit: (a: Record<string, AnswerValue | null>) => void;
}) {
  const [invalid, setInvalid] = useState<string | null>(null);
  const q = getQuestion(def, 'F3');
  const other = answers.F3?.kind === 'single' && answers.F3.value === 'other';
  const otherText = answers.F3_other?.kind === 'text' ? answers.F3_other.text : '';
  return (
    <StepFrame
      eyebrow={t('feedbackEyebrow')} title={q.title} nextLabel={t('submit')} {...c}
      onNext={() => {
        const err = validateAnswer(q, answers.F3);
        setInvalid(err);
        if (err) return;
        onSubmit({
          F1a: answers.F1a ?? null, F1b: answers.F1b ?? null, F2: answers.F2 ?? null, F3: answers.F3 ?? null,
          F3_other: other && otherText.trim() ? { kind: 'text', text: otherText } : null,
        });
      }}
    >
      <ClosedQuestion q={q} value={answers.F3} invalid={invalid} onChange={(v) => { setInvalid(null); setAnswer('F3', v); }} />
      {other && (
        <TextAreaCounter label={t('f3OtherLabel')} value={otherText} max={F3_OTHER_MAX} rows={3}
          onChange={(x) => setAnswer('F3_other', x ? { kind: 'text', text: x } : undefined)} />
      )}
    </StepFrame>
  );
}
