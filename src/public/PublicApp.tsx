import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { publicBackend } from '../lib/backend';
import { BackendError, errorText, type ExplorationState, type ParticipationState, type PublicConfig } from '../lib/backend/types';
import { getQuestion } from '../config/questionnaire';
import { PROJECT } from '../config/project';
import {
  missingRequired, nextStep, prevStep, progressFor, pruneInapplicable, questionStepIds, stepsFor,
  type AnswerValue, type Answers, type StepId,
} from '../lib/flow';
import { Alert, Button, Spinner } from '../ui/components';
import { Shell } from './Shell';
import { Intro } from './Intro';
import { QuestionScreen, ExperienceIntro, AlternativeIntro, F1Screen, F3Screen, DemoIntro } from './Steps';
import { Demo } from './Demo';
import { EmailInvite, Thanks } from './EmailInvite';
import { getLang, setLang, t, useLang } from '../i18n';
import { questionnaireFor } from '../i18n/content';

const LS_KEY = 'tr.public.v1';
interface Stored { pid?: string; pendingKey?: string }

function readStored(): Stored {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}') as Stored; } catch { return {}; }
}
function writeStored(s: Stored) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(s)); } catch { /* recupero sessione non disponibile */ }
}
export function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

type ErrState = { msg: string; retry?: () => void } | null;

export function PublicApp() {
  const backend = publicBackend();
  const lang = useLang();
  const def = questionnaireFor(PROJECT.questionnaireVersion, lang);
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [boot, setBoot] = useState<'loading' | 'ready' | 'error'>('loading');
  const [bootError, setBootError] = useState('');
  const [p, setP] = useState<ParticipationState | null>(null);
  const [answers, setAnswers] = useState<Answers>({});
  const [step, setStep] = useState<StepId>('intro');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ErrState>(null);
  const [outcome, setOutcome] = useState<'subscribed' | 'declined' | null>(null);
  const mainRef = useRef<HTMLElement>(null);

  const resumeFrom = useCallback((state: ParticipationState) => {
    if (state.language === 'it' || state.language === 'en') setLang(state.language);
    setP(state);
    setAnswers(state.answers ?? {});
    if (state.status === 'completed') {
      if (state.email_screen === 'subscribed' || state.email_screen === 'declined') {
        setOutcome(state.email_screen);
        setStep('thanks');
      } else setStep('email');
      return;
    }
    const s = stepsFor(state.answers ?? {});
    setStep(s.includes(state.current_step) ? state.current_step : 'Q1');
  }, []);

  const doBoot = useCallback(async () => {
    setBoot('loading');
    try {
      const cfg = await backend.getConfig();
      setConfig(cfg);
      const stored = readStored();
      if (stored.pid) {
        try {
          resumeFrom(await backend.load(stored.pid));
        } catch (e) {
          if (e instanceof BackendError && e.retryable) throw e;
          writeStored({}); // compilazione non più disponibile in questo browser
        }
      }
      setBoot('ready');
    } catch (e) {
      setBootError(errorText(e));
      setBoot('error');
    }
  }, [backend, resumeFrom]);

  useEffect(() => { void doBoot(); }, [doBoot]);

  // porta il focus sul titolo a ogni cambio di schermata
  useEffect(() => {
    window.scrollTo({ top: 0 });
    const h = mainRef.current?.querySelector<HTMLElement>('[data-autofocus]');
    h?.focus({ preventScroll: true });
  }, [step]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError({ msg: errorText(e), retry: () => void run(fn) });
    } finally {
      setBusy(false);
    }
  };

  const start = () => run(async () => {
    const stored = readStored();
    const key = stored.pendingKey ?? uuid();
    writeStored({ ...stored, pendingKey: key }); // stessa chiave in caso di retry: nessun duplicato
    const state = await backend.start(key, getLang());
    writeStored({ pid: state.id });
    resumeFrom(state);
  });

  const restart = () => {
    writeStored({});
    setP(null); setAnswers({}); setOutcome(null); setError(null);
    setStep('intro');
  };

  /** Conferma lo step corrente: salva lato server, poi avanza. */
  const confirm = (stepAnswers: Record<string, AnswerValue | null>, override?: StepId) => run(async () => {
    if (!p) return;
    const merged: Answers = { ...answers };
    for (const [k, v] of Object.entries(stepAnswers)) {
      if (v === null || (v.kind === 'text' && !v.text.trim())) delete merged[k]; else merged[k] = v;
    }
    const nxt = override ?? nextStep(step, merged);
    if (!nxt) return;
    await backend.saveStep(p.id, stepAnswers, nxt);
    setAnswers(pruneInapplicable(def, merged));
    setStep(nxt);
  });

  const back = () => {
    const prv = prevStep(step, answers);
    setError(null);
    if (prv) setStep(prv);
  };

  const setAnswer = (qid: string, v: AnswerValue | undefined) => {
    setAnswers((a) => {
      const n = { ...a };
      if (v === undefined) delete n[qid]; else n[qid] = v;
      return n;
    });
  };

  const setExplorations = (fn: (e: ExplorationState[]) => ExplorationState[]) =>
    setP((cur) => (cur ? { ...cur, explorations: fn(cur.explorations) } : cur));

  const lastExplored = p ? [...p.explorations].reverse().find((e) => e.details_opened.length > 0) ?? null : null;

  const submit = (finalAnswers: Record<string, AnswerValue | null>) => run(async () => {
    if (!p || !lastExplored) throw new BackendError('demo_not_explored', 'demo');
    const merged = { ...answers, ...Object.fromEntries(Object.entries(finalAnswers).filter(([, v]) => v)) } as Answers;
    const missing = missingRequired(def, merged);
    if (missing.length) throw new BackendError('incomplete', 'incomplete', false, missing.join(','));
    await backend.submitFinal(p.id, lastExplored.id, finalAnswers);
    setAnswers(pruneInapplicable(def, merged));
    setP({ ...p, status: 'completed', f1_exploration_id: lastExplored.id });
    setStep('email');
  });

  if (boot === 'loading') {
    return <Shell config={config} step="intro"><main className="page page-center"><Spinner label={t('loading')} /></main></Shell>;
  }
  if (boot === 'error' || !config) {
    return (
      <Shell config={config} step="intro" showLang>
        <main className="page page-narrow">
          <h1 className="h-screen" tabIndex={-1} data-autofocus>{t('bootTitle')}</h1>
          <Alert action={<Button variant="secondary" onClick={() => void doBoot()}>{t('retry')}</Button>}>{bootError}</Alert>
          <p className="muted">{t('bootNote')}</p>
        </main>
      </Shell>
    );
  }

  if (step === 'intro' || !p) {
    return <Intro config={config} onStart={start} busy={busy} error={error} />;
  }

  const progress = progressFor(step, answers);
  const errorBox = error && (
    <Alert action={error.retry && <Button variant="secondary" onClick={error.retry} disabled={busy}>{t('retry')}</Button>}>{error.msg}</Alert>
  );
  const common = { busy, onBack: prevStep(step, answers) ? back : undefined, error: errorBox };

  let content: ReactNode;
  switch (step) {
    case 'exp_intro':
      content = <ExperienceIntro text={def.texts.experienceIntro} onNext={() => confirm({})} {...common} />;
      break;
    case 'alt_intro':
      content = <AlternativeIntro def={def} answers={answers} setAnswer={setAnswer} onNext={(v) => confirm({ A0: v })} {...common} />;
      break;
    case 'demo_intro':
      content = <DemoIntro def={def} onNext={() => confirm({}, 'demo')} {...common} />;
      break;
    case 'demo':
      content = (
        <Demo
          participationId={p.id} explorations={p.explorations} setExplorations={setExplorations}
          onFeedback={() => confirm({}, 'F1')} onBack={common.onBack} busy={busy} error={errorBox}
        />
      );
      break;
    case 'F1':
      content = (
        <F1Screen def={def} answers={answers} setAnswer={setAnswer} multipleExamples={p.explorations.filter((e) => e.details_opened.length).length > 1}
          reference={lastExplored} onNext={() => confirm({ F1a: answers.F1a ?? null, F1b: answers.F1b ?? null })} {...common} />
      );
      break;
    case 'F3':
      content = <F3Screen def={def} answers={answers} setAnswer={setAnswer} onSubmit={submit} {...common} />;
      break;
    case 'email':
      content = (
        <EmailInvite
          def={def} config={config} participationId={p.id} alreadyShown={p.email_screen !== 'not_shown'}
          onDone={(o) => { setOutcome(o); setStep('thanks'); }}
        />
      );
      break;
    case 'thanks':
      content = <Thanks def={def} outcome={outcome} onRestart={restart} />;
      break;
    default: {
      const ids = questionStepIds(step);
      const q = getQuestion(def, ids[0]);
      content = (
        <QuestionScreen
          key={q.id} q={q} answers={answers} setAnswer={setAnswer}
          onNext={() => confirm({ [q.id]: answers[q.id] ?? null })} {...common}
        />
      );
    }
  }

  return (
    <Shell config={config} step={step} progress={progress} mode={config.mode}>
      <main className="page" ref={mainRef} id="contenuto">{content}</main>
    </Shell>
  );
}
