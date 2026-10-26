import type { ReactNode } from 'react';
import type { PublicConfig } from '../lib/backend/types';
import { QUESTIONNAIRES } from '../config/questionnaire';
import { Alert, Brand, Button, SkipLink } from '../ui/components';
import { ModeBanner } from './Shell';
import { href } from '../lib/router';

/** Itinerario che cambia: la linea prevista si interrompe e devia verso una nuova destinazione. */
function RouteArt() {
  return (
    <svg className="route-art" viewBox="0 0 640 260" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false">
      <defs>
        <pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse">
          <path d="M32 0H0v32" fill="none" stroke="rgba(255,255,255,.06)" strokeWidth="1" />
        </pattern>
      </defs>
      <rect width="640" height="260" fill="url(#grid)" />
      {/* tratta originale */}
      <path className="route-planned" d="M48 196 C 150 196, 190 120, 300 120" />
      <path className="route-cancelled" d="M300 120 C 380 120, 430 70, 560 70" />
      <g className="route-stop-x" transform="translate(560 70)">
        <circle r="13" />
        <path d="M-5 -5 5 5M5 -5 -5 5" />
      </g>
      {/* nuova tratta */}
      <path className="route-detour" d="M300 120 C 360 120, 380 200, 470 206 S 560 188, 592 168" />
      <circle className="route-origin" cx="48" cy="196" r="7" />
      <circle className="route-node" cx="300" cy="120" r="6" />
      <circle className="route-dest" cx="592" cy="168" r="9" />
      <circle className="route-dest-halo" cx="592" cy="168" r="18" />
    </svg>
  );
}

export function Intro({ config, onStart, busy, error }: {
  config: PublicConfig; onStart: () => void; busy: boolean;
  error: { msg: string; retry?: () => void } | null;
}) {
  const t = QUESTIONNAIRES[config.questionnaireVersion]?.texts ?? Object.values(QUESTIONNAIRES)[0].texts;
  const privacyLink: ReactNode = <a href={href('/privacy')}>informativa</a>;
  const note = t.introNote.replace(/informativa\.$/, '');
  return (
    <div className="intro">
      <SkipLink />
      <ModeBanner mode={config.mode} />
      <header className="intro-hero">
        <div className="intro-hero-inner">
          <Brand name={config.projectName} light />
          <RouteArt />
          <h1 className="intro-title" tabIndex={-1} data-autofocus>{t.introTitle}</h1>
        </div>
      </header>
      <main id="contenuto" className="intro-main">
        <article className="ticket intro-ticket">
          <div className="ticket-main">
            <p className="intro-lead">{t.introBody1}</p>
            <p>{t.introBody2}</p>
            <p className="intro-note">{note}{privacyLink}.</p>
          </div>
          <div className="ticket-stub">
            {error && <Alert action={error.retry && <Button variant="secondary" onClick={error.retry} disabled={busy}>Riprova</Button>}>{error.msg}</Alert>}
            <Button onClick={onStart} busy={busy} className="btn-xl">Inizia</Button>
          </div>
        </article>
      </main>
      <footer className="footer footer-intro">
        <span>Progetto di ricerca universitario</span>
        <a href={href('/privacy')}>Informativa</a>
      </footer>
    </div>
  );
}
