import type { ReactNode } from 'react';
import type { Mode, PublicConfig } from '../lib/backend/types';
import type { Stage, StepId } from '../lib/flow';
import { Brand, SkipLink } from '../ui/components';
import { href } from '../lib/router';
import { PROJECT } from '../config/project';
import { LANGS, setLang, t, useLang } from '../i18n';
import type { UiKey } from '../i18n/ui';

const STAGE_KEY: Record<Stage, UiKey> = {
  initial: 'stageInitial', branch: 'stageBranch', demo: 'stageDemo', feedback: 'stageFeedback',
};

export function ModeBanner({ mode }: { mode: Mode | undefined }) {
  if (mode === 'local') return <div className="mode-banner mode-local" role="note">{t('modeLocal')}</div>;
  if (mode === 'test') return <div className="mode-banner mode-test" role="note">{t('modeTest')}</div>;
  return null;
}

/** Selettore della lingua (pulsanti a scelta singola, utilizzabile da tastiera). */
export function LangSwitch({ light, disabled }: { light?: boolean; disabled?: boolean }) {
  const lang = useLang();
  return (
    <div className={`lang-switch ${light ? 'lang-switch-light' : ''}`} role="group" aria-label={t('langLabel')}>
      {LANGS.map((l) => (
        <button
          key={l.id} type="button" lang={l.id} aria-label={l.label} aria-pressed={lang === l.id} disabled={disabled}
          onClick={() => setLang(l.id)}
        >
          <span className="lang-code" aria-hidden="true">{l.id.toUpperCase()}</span>
          <span className="lang-name">{l.label}</span>
        </button>
      ))}
    </div>
  );
}

export function Progress({ progress }: { progress: { stages: Stage[]; current: Stage | null; index: number; total: number } }) {
  const ci = progress.current ? progress.stages.indexOf(progress.current) : -1;
  if (ci < 0) return null;
  const detail = progress.current === 'demo' ? '' : progress.total > 1 ? t('progressSrDetail', { i: progress.index, t: progress.total }) : '';
  return (
    <nav className="progress" aria-label={t('progressNav')}>
      <p className="sr-only">{t('progressSr', { n: ci + 1, total: progress.stages.length, stage: t(STAGE_KEY[progress.current!]) })}{detail}</p>
      <ol className="progress-track" aria-hidden="true">
        {progress.stages.map((s, i) => {
          const fill = i < ci ? 1 : i > ci ? 0 : progress.total > 0 ? progress.index / progress.total : 0.5;
          return (
            <li key={s} className={`progress-seg ${i === ci ? 'is-current' : ''} ${i < ci ? 'is-done' : ''}`}>
              <span className="progress-bar"><span style={{ transform: `scaleX(${Math.max(0.04, fill)})` }} /></span>
              <span className="progress-label">{t(STAGE_KEY[s])}</span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function Footer({ intro }: { intro?: boolean }) {
  return (
    <footer className={`footer ${intro ? 'footer-intro' : ''}`}>
      <span>{t('footer')}</span>
      <a href={href('/privacy')}>{t('privacyLink')}</a>
    </footer>
  );
}

export function Shell({ config, step, progress, mode, children, showLang }: {
  config: PublicConfig | null; step: StepId; mode?: Mode; showLang?: boolean;
  progress?: { stages: Stage[]; current: Stage | null; index: number; total: number };
  children: ReactNode;
}) {
  const inDemo = step === 'demo';
  return (
    <div className="shell">
      <SkipLink />
      <ModeBanner mode={mode ?? config?.mode} />
      <header className="topbar">
        <div className="topbar-inner">
          <Brand name={config?.projectName ?? PROJECT.name} />
          {inDemo && <span className="demo-chip">{t('demoChip')}</span>}
          {showLang && <LangSwitch />}
        </div>
        {progress && <div className="topbar-progress"><Progress progress={progress} /></div>}
      </header>
      {children}
      <Footer />
    </div>
  );
}
