import type { ReactNode } from 'react';
import type { Mode, PublicConfig } from '../lib/backend/types';
import { STAGE_LABEL, type Stage, type StepId } from '../lib/flow';
import { Brand, SkipLink } from '../ui/components';
import { href } from '../lib/router';
import { PROJECT } from '../config/project';

export function ModeBanner({ mode }: { mode: Mode | undefined }) {
  if (mode === 'local') {
    return (
      <div className="mode-banner mode-local" role="note">
        Anteprima locale: le risposte restano in questo browser e non vengono inviate al gruppo di ricerca.
      </div>
    );
  }
  if (mode === 'test') {
    return (
      <div className="mode-banner mode-test" role="note">
        Modalità test: le risposte sono salvate come prova ed escluse dalle statistiche della ricerca.
      </div>
    );
  }
  return null;
}

export function Progress({ progress }: { progress: { stages: Stage[]; current: Stage | null; index: number; total: number } }) {
  const ci = progress.current ? progress.stages.indexOf(progress.current) : -1;
  if (ci < 0) return null;
  const detail = progress.current === 'demo' ? '' : progress.total > 1 ? `, ${progress.index} di ${progress.total}` : '';
  return (
    <nav className="progress" aria-label="Avanzamento">
      <p className="sr-only">{`Fase ${ci + 1} di ${progress.stages.length}: ${STAGE_LABEL[progress.current!]}${detail}`}</p>
      <ol className="progress-track" aria-hidden="true">
        {progress.stages.map((s, i) => {
          const fill = i < ci ? 1 : i > ci ? 0 : progress.total > 0 ? progress.index / progress.total : 0.5;
          return (
            <li key={s} className={`progress-seg ${i === ci ? 'is-current' : ''} ${i < ci ? 'is-done' : ''}`}>
              <span className="progress-bar"><span style={{ transform: `scaleX(${Math.max(0.04, fill)})` }} /></span>
              <span className="progress-label">{STAGE_LABEL[s]}</span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function Shell({ config, step, progress, mode, children }: {
  config: PublicConfig | null; step: StepId; mode?: Mode;
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
          {inDemo && <span className="demo-chip">Demo — dati di esempio</span>}
        </div>
        {progress && <div className="topbar-progress"><Progress progress={progress} /></div>}
      </header>
      {children}
      <footer className="footer">
        <span>Progetto di ricerca universitario</span>
        <a href={href('/privacy')}>Informativa</a>
      </footer>
    </div>
  );
}
