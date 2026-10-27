import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  alternativesFor, compute, dateFromRef, highestRefund,
  type Alternative, type CategoryId, type DemoCase, type NeedId,
} from '../config/demoCases';
import { benefitLabel, demoCase, demoCases, needLabel, statusLabel } from '../i18n/content';
import { t, useLang } from '../i18n';
import { publicBackend } from '../lib/backend';
import { errorText, type DemoAction, type ExplorationState } from '../lib/backend/types';
import { eur, longDate, shortDate, timeOf, todayRomeISO } from '../lib/format';
import { Alert, Button } from '../ui/components';
import {
  CATEGORY_ICON, IconArrowLeft, IconArrowRight, IconCheck, IconChevron, IconClock, IconCross, IconDoc, IconExternal, IconQuestion, IconUpload,
} from '../ui/icons';
import { uuid } from './PublicApp';

type Stage = 'categories' | 'upload' | 'need' | 'analysis' | 'results';

export function Demo({ participationId, explorations, setExplorations, onFeedback, onBack, busy, error }: {
  participationId: string; explorations: ExplorationState[];
  setExplorations: (fn: (e: ExplorationState[]) => ExplorationState[]) => void;
  onFeedback: () => void; onBack?: () => void; busy: boolean; error: ReactNode;
}) {
  const backend = publicBackend();
  const lang = useLang();
  const [stage, setStage] = useState<Stage>('categories');
  const [category, setCategory] = useState<CategoryId | null>(null);
  const [need, setNeed] = useState<NeedId | null>(null);
  const [current, setCurrent] = useState<string | null>(null); // id esplorazione corrente
  const [localErr, setLocalErr] = useState<{ msg: string; retry: () => void } | null>(null);
  const [working, setWorking] = useState(false);
  // riferimento temporale congelato all'avvio della demo
  const [refDate] = useState(() => explorations[0]?.reference_date ?? todayRomeISO());
  const pendingKey = useRef<string | null>(null);
  const [nudge, setNudge] = useState(false);
  const [attention, setAttention] = useState(false);
  const wasExplored = useRef(explorations.some((e) => e.details_opened.length > 0));
  const headRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => { headRef.current?.focus({ preventScroll: true }); window.scrollTo({ top: 0 }); }, [stage]);

  const explored = explorations.some((e) => e.details_opened.length > 0);

  // Appena l'esempio è esplorato: il pulsante per continuare si evidenzia una volta.
  useEffect(() => {
    if (explored && !wasExplored.current) {
      wasExplored.current = true;
      setNudge(false);
      setAttention(true);
      const id = setTimeout(() => setAttention(false), 2400);
      return () => clearTimeout(id);
    }
  }, [explored]);

  /** Continua senza aver aperto alcun dettaglio: porta la persona al pulsante da toccare. */
  const showWhatToOpen = () => {
    setNudge(true);
    const b = document.querySelector<HTMLButtonElement>('.alt-card .disclosure');
    if (b) {
      b.scrollIntoView({ block: 'center', behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      b.classList.remove('is-nudged');
      void b.offsetWidth;
      b.classList.add('is-nudged');
      setTimeout(() => b.focus({ preventScroll: true }), 350);
    }
  };
  const c = category ? demoCase(category, lang) : null;
  const ex = explorations.find((e) => e.id === current) ?? null;

  const act = async (fn: () => Promise<void>) => {
    setWorking(true);
    setLocalErr(null);
    try { await fn(); } catch (e) { setLocalErr({ msg: errorText(e), retry: () => void act(fn) }); } finally { setWorking(false); }
  };

  const record = (action: DemoAction, alt?: string) => act(async () => {
    if (!current) return;
    await backend.demoAction(participationId, current, action, alt);
    setExplorations((list) => list.map((e) => {
      if (e.id !== current) return e;
      if (action === 'open_detail' && alt && !e.details_opened.includes(alt)) return { ...e, details_opened: [...e.details_opened, alt] };
      if (action === 'choose') return { ...e, choice: alt ?? null };
      if (action === 'provider_click') return { ...e, provider_clicked: true };
      return e;
    }));
  });

  const analyze = () => act(async () => {
    if (!c || !need) return;
    pendingKey.current ??= uuid();
    const id = await backend.demoStart(participationId, pendingKey.current, c.id, need, refDate);
    pendingKey.current = null;
    setExplorations((list) => list.some((e) => e.id === id) ? list : [...list, {
      id, seq: list.length + 1, category: c.category, case_id: c.id, need_id: need, reference_date: refDate,
      details_opened: [], choice: null, provider_clicked: false,
    }]);
    setCurrent(id);
    setStage('analysis');
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    setTimeout(() => setStage('results'), reduce ? 150 : 1100);
  });

  const leave = async (then: () => void) => {
    if (current) {
      try { await backend.demoAction(participationId, current, 'end'); } catch { /* fine esplorazione non essenziale */ }
    }
    then();
  };

  const tryAnother = () => void leave(() => { setCurrent(null); setNeed(null); setCategory(null); setStage('categories'); });
  const goFeedback = () => void leave(onFeedback);

  const errBox = localErr && (
    <Alert action={<Button variant="secondary" onClick={localErr.retry} disabled={working}>{t('retry')}</Button>}>{localErr.msg}</Alert>
  );

  const showFooter = stage === 'results' || (stage === 'categories' && explored);
  const footer = showFooter ? (
    <div className={`demo-footer ${explored ? 'is-ready' : ''}`}>
      <div className="demo-footer-inner">
        <p className={`demo-footer-status ${nudge && !explored ? 'is-nudge' : ''}`} id="fb-status" aria-live="polite">
          <span className={`status-dot ${explored ? 'is-done' : ''}`} aria-hidden="true">{explored ? <IconCheck size={14} strokeWidth={2.6} /> : null}</span>
          <span>{explored ? t('footStatusDone') : nudge ? t('nudgeMsg') : t('footStatusTodo')}</span>
        </p>
        <div className="demo-footer-actions">
          {stage === 'results' && (
            <button type="button" className="link-quiet demo-footer-alt" onClick={tryAnother} disabled={busy || working}>{t('tryAnother')}</button>
          )}
          <Button
            onClick={explored ? goFeedback : showWhatToOpen} disabled={working} busy={busy}
            aria-describedby="fb-status" className={`btn-continue ${attention ? 'btn-attention' : ''}`}
          >
            {t('toFeedback')} <IconArrowRight size={18} />
          </Button>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <section className="demo">
      {stage === 'categories' && (
        <>
          <div className="demo-head">
            <h1 className="h-screen" tabIndex={-1} ref={headRef}>{t('demoPickTitle')}</h1>
            <p className="lead">{t('demoPickLead')}</p>
          </div>
          <ul className="cat-grid" role="list">
            {demoCases(lang).map((dc) => {
              const Icon = CATEGORY_ICON[dc.category];
              const tried = explorations.some((e) => e.category === dc.category);
              return (
                <li key={dc.id}>
                  <button className="cat-card" onClick={() => { setCategory(dc.category); setNeed(null); setStage('upload'); }}>
                    <span className="cat-icon"><Icon size={26} /></span>
                    <span className="cat-text">
                      <span className="cat-title">{dc.categoryLabel}</span>
                      <span className="cat-hint">{dc.categoryHint}</span>
                    </span>
                    {tried && <span className="cat-tried"><IconCheck size={14} /> {t('tried')}</span>}
                    <span className="cat-perf" aria-hidden="true" />
                  </button>
                </li>
              );
            })}
          </ul>
          {onBack && !explored && (
            <div className="step-nav"><Button variant="ghost" className="btn-back" onClick={onBack}><IconArrowLeft size={18} /> {t('back')}</Button><span /></div>
          )}
        </>
      )}

      {stage === 'upload' && c && (
        <div className="demo-narrow">
          <BackLink onClick={() => setStage('categories')}>{t('backCategories')}</BackLink>
          <h1 className="h-screen" tabIndex={-1} ref={headRef}>{t('uploadTitle')}</h1>
          <div className="upload-zone" aria-describedby="upload-note">
            <span className="upload-icon"><IconUpload size={28} /></span>
            <p className="upload-title">{t('uploadZoneTitle')}</p>
            <p className="upload-sub">{t('uploadZoneSub')}</p>
            <p className="upload-note" id="upload-note">{t('uploadZoneNote')}</p>
          </div>
          {errBox}
          <div className="center-action">
            <Button onClick={() => setStage('need')}>{t('useSample')}</Button>
          </div>
        </div>
      )}

      {stage === 'need' && c && (
        <div className="demo-narrow">
          <BackLink onClick={() => setStage('upload')}>{t('backUpload')}</BackLink>
          <h1 className="h-screen" tabIndex={-1} ref={headRef}>{t('bookingTitle')}</h1>
          <BookingTicket c={c} refDate={refDate} />
          <fieldset className="need-set">
            <legend className="h-block">{t('needQuestion')}</legend>
            <div className="need-grid">
              {(Object.keys(c.needs) as NeedId[]).map((n) => (
                <label key={n} className={`need-card ${need === n ? 'is-checked' : ''}`}>
                  <input type="radio" name="need" value={n} checked={need === n} onChange={() => setNeed(n)} />
                  <span className="choice-mark mark-radio" aria-hidden="true" />
                  <span className="need-text"><span className="need-title">{needLabel(n, lang).title}</span><span className="need-hint">{needLabel(n, lang).hint}</span></span>
                </label>
              ))}
            </div>
          </fieldset>
          {errBox}
          <div className="center-action">
            <Button onClick={analyze} disabled={!need} busy={working}>{t('showAlternatives')}</Button>
          </div>
        </div>
      )}

      {stage === 'analysis' && c && (
        <div className="demo-narrow analysis" aria-live="polite">
          <h1 className="h-screen" tabIndex={-1} ref={headRef}>{t('analysisTitle')}</h1>
          <ol className="analysis-steps">
            <li style={{ animationDelay: '0ms' }}><IconDoc size={18} /> {t('analysisStep1', { id: c.id })}</li>
            <li style={{ animationDelay: '280ms' }}><IconClock size={18} /> {t('analysisStep2', { date: longDate(dateFromRef(refDate, 0)) })}</li>
            <li style={{ animationDelay: '560ms' }}><IconCheck size={18} /> {t('analysisStep3')}</li>
          </ol>
          <p className="muted small">{t('analysisNote')}</p>
        </div>
      )}

      {stage === 'results' && c && need && ex && (
        <Results
          c={c} need={need} ex={ex} refDate={refDate} working={working} err={errBox} headRef={headRef}
          onOpen={(alt) => void record('open_detail', alt)} onChoose={(alt) => void record('choose', alt)}
          onProvider={(alt) => void record('provider_click', alt)} onCategories={tryAnother} onFeedback={goFeedback} busy={busy}
        />
      )}

      {error}
      {footer}
    </section>
  );
}

function BackLink({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return <button className="back-link" onClick={onClick}><IconArrowLeft size={16} /> {children}</button>;
}

export function BookingTicket({ c, refDate, compact }: { c: DemoCase; refDate: string; compact?: boolean }) {
  const Icon = CATEGORY_ICON[c.category];
  const when = dateFromRef(refDate, c.serviceDay, c.serviceTime);
  return (
    <article className={`ticket booking ${compact ? 'booking-compact' : ''}`} aria-label={t('bookingAria')}>
      <div className="ticket-main">
        <p className="booking-cat"><Icon size={18} /> {c.categoryLabel}<span className="booking-flag">{t('inventedExample')}</span></p>
        <h2 className="booking-title">{c.title}</h2>
        <p className="booking-place">{c.place}</p>
        <dl className="booking-meta">
          <div><dt>{t('date')}</dt><dd>{longDate(when)}{c.serviceTime ? `, ${timeOf(when)}` : ''}</dd></div>
          <div><dt>{t('provider')}</dt><dd>{c.provider}</dd></div>
          {!compact && <div><dt>{t('channel')}</dt><dd>{c.channel}</dd></div>}
          {!compact && <div><dt>{t('details')}</dt><dd>{c.details.join('; ')}</dd></div>}
        </dl>
      </div>
      <div className="ticket-stub booking-stub">
        <span className="stub-label">{t('paid')}</span>
        <span className="stub-amount">{eur(c.paid)}</span>
        {!compact && c.paidBreakdown.length > 1 && (
          <ul className="stub-breakdown">{c.paidBreakdown.map((b) => <li key={b.label}>{b.label}: {eur(b.amount)}</li>)}</ul>
        )}
        <span className="stub-ref">{c.bookingRef}</span>
      </div>
    </article>
  );
}

function StatusPill({ status }: { status: Alternative['status'] }) {
  const Icon = status === 'available' ? IconCheck : status === 'to_confirm' ? IconQuestion : IconCross;
  return <span className={`pill pill-${status}`}><Icon size={15} /> {statusLabel(status)}</span>;
}

function KeyFigure({ c, a }: { c: DemoCase; a: Alternative }) {
  const k = compute(c, a);
  if (a.status === 'not_provided') {
    return <div className="figure figure-none"><span className="figure-label">{t('outcomeInExample')}</span><span className="figure-value">{t('notProvided')}</span></div>;
  }
  if (k.refundNet !== null) {
    return (
      <div className="figure figure-refund">
        <span className="figure-label">{t('cashRefund')}</span>
        <span className="figure-value">{eur(k.refundNet)}</span>
        <span className="figure-sub">{t('ofPaid', { paid: eur(c.paid) })}{k.deductionsTotal ? t('deductionsOf', { amount: eur(k.deductionsTotal) }) : t('noDeductions')}</span>
      </div>
    );
  }
  if (k.credit !== null) {
    return (
      <div className="figure figure-credit">
        <span className="figure-label">{t('usableCredit')}</span>
        <span className="figure-value">{eur(k.credit)}</span>
        <span className="figure-sub">{t('creditSub', { validity: a.credit!.validity.toLowerCase() })}</span>
      </div>
    );
  }
  if (a.benefit === 'resale') {
    return <div className="figure figure-uncertain"><span className="figure-label">{t('recovery')}</span><span className="figure-value">{t('notGuaranteed')}</span><span className="figure-sub">{t('dependsOnSale')}</span></div>;
  }
  return (
    <div className="figure figure-change">
      <span className="figure-label">{a.keepsUse ? t('keepUse') : t('cost')}</span>
      <span className="figure-value">{k.extraKnown ? `${eur(k.extraKnown)}${k.hasUnknownCosts ? t('plusToVerify') : ''}` : k.hasUnknownCosts ? t('costToVerify') : t('noKnownCost')}</span>
      <span className="figure-sub">{a.benefit === 'transfer' || a.benefit === 'correction' ? t('noProviderRefund') : t('notARefund')}</span>
    </div>
  );
}

function Results({ c, need, ex, refDate, working, err, headRef, onOpen, onChoose, onProvider, onCategories, onFeedback, busy }: {
  c: DemoCase; need: NeedId; ex: ExplorationState; refDate: string; working: boolean; err: ReactNode;
  headRef: React.RefObject<HTMLHeadingElement | null>;
  onOpen: (alt: string) => void; onChoose: (alt: string) => void; onProvider: (alt: string) => void; onCategories: () => void;
  onFeedback: () => void; busy: boolean;
}) {
  const alts = alternativesFor(c, need);
  const best = highestRefund(c, alts.map((a) => a.id));
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [provider, setProvider] = useState<Alternative | null>(null);

  return (
    <div className="results">
      <div className="results-head">
        <h1 className="h-screen" tabIndex={-1} ref={headRef}>{t('resultsTitle', { n: alts.length, need: needLabel(need).title.toLowerCase() })}</h1>
        <p className="results-ref">{t('resultsRef', { date: longDate(dateFromRef(refDate, 0)) })}</p>
        <BookingTicket c={c} refDate={refDate} compact />
        {best ? (
          <p className="best-note"><span className="best-dot" aria-hidden="true" /> {t('bestNote')}</p>
        ) : (
          <p className="best-note">{t('noRefundNote')}</p>
        )}
      </div>

      {err}

      <ul className="alt-list" role="list">
        {alts.map((a) => {
          const isOpen = open[a.id];
          const chosen = ex.choice === a.id;
          const deadline = a.deadline ? dateFromRef(refDate, a.deadline.days, a.deadline.time) : null;
          const panelId = `alt-${a.id}-panel`;
          const k = compute(c, a);
          return (
            <li key={a.id} className={`alt-card alt-${a.status} ${chosen ? 'is-chosen' : ''}`}>
              <div className="alt-top">
                <span className="alt-benefit">{benefitLabel(a.benefit)}</span>
                <StatusPill status={a.status} />
              </div>
              <h2 className="alt-title">{a.title}</h2>
              {best === a.id && <p className="best-tag"><span className="best-dot" aria-hidden="true" /> {t('bestTag')}</p>}
              <div className="alt-figures">
                <KeyFigure c={c} a={a} />
                <div className="figure figure-deadline">
                  <span className="figure-label">{t('deadline')}</span>
                  {deadline ? (
                    <>
                      <span className="figure-value figure-value-sm"><IconClock size={16} /> {shortDate(deadline)}, {timeOf(deadline)}</span>
                      <span className="figure-sub">{a.deadline!.text}</span>
                    </>
                  ) : <span className="figure-value figure-value-sm">{a.status === 'not_provided' ? '—' : t('toVerify')}</span>}
                </div>
              </div>
              <p className="alt-summary">{a.summary}</p>
              {a.reason && <p className="alt-reason">{a.status === 'not_provided' ? t('whyNot') : t('whyConfirm')}{a.reason}</p>}

              <div className="alt-actions">
                <button
                  className="disclosure" aria-expanded={Boolean(isOpen)} aria-controls={panelId}
                  onClick={() => {
                    setOpen((o) => ({ ...o, [a.id]: !o[a.id] }));
                    if (!isOpen && !ex.details_opened.includes(a.id)) onOpen(a.id);
                  }}
                >
                  {isOpen ? t('hideDetails') : t('showDetails')} <IconChevron size={18} className={isOpen ? 'rot' : ''} />
                </button>
                {a.status !== 'not_provided' && (
                  <button className={`choose-btn ${chosen ? 'is-on' : ''}`} aria-pressed={chosen} disabled={working} onClick={() => onChoose(a.id)}>
                    {chosen ? <><IconCheck size={16} /> {t('chosen')}</> : t('chooseThis')}
                  </button>
                )}
              </div>

              <div id={panelId} className="alt-panel" hidden={!isOpen}>
                <dl className="alt-detail">
                  <div><dt>{t('whatItAllows')}</dt><dd>{a.summary}</dd></div>
                  {a.status !== 'not_provided' && (
                    <div>
                      <dt>{t('amounts')}</dt>
                      <dd>
                        <ul className="money-list">
                          <li><span>{t('amountPaid')}</span><span>{eur(c.paid)}</span></li>
                          {a.refundGross !== undefined && <li><span>{t('grossRefund')}</span><span>{eur(Math.min(a.refundGross, c.paid))}</span></li>}
                          {(a.deductions ?? []).map((d) => <li key={d.label}><span>{d.label}</span><span>− {eur(d.amount)}</span></li>)}
                          {k.refundNet !== null && <li className="money-total"><span>{t('netRefund')}</span><span>{eur(k.refundNet)}</span></li>}
                          {k.credit !== null && <li className="money-total"><span>{t('creditNotCash')}</span><span>{eur(k.credit)}</span></li>}
                          {(a.extraCosts ?? []).map((d) => <li key={d.label}><span>{d.label}</span><span>{eur(d.amount)}</span></li>)}
                          {(a.toVerify ?? []).map((v) => <li key={v}><span>{v}</span><span className="tbd">{t('toVerify')}</span></li>)}
                          {a.notGuaranteed && <li className="money-note"><span>{a.notGuaranteed}</span></li>}
                        </ul>
                      </dd>
                    </div>
                  )}
                  {a.conditions.length > 0 && <div><dt>{t('relevantConditions')}</dt><dd><ul className="bullets">{a.conditions.map((x) => <li key={x}>{x}</li>)}</ul></dd></div>}
                  {a.steps.length > 0 && <div><dt>{t('stepsToFollow')}</dt><dd><ol className="steps-list">{a.steps.map((x) => <li key={x}>{x}</li>)}</ol></dd></div>}
                  {a.status !== 'not_provided' && <div><dt>{t('whoToContact')}</dt><dd>{a.contact}</dd></div>}
                </dl>
                <details className="why">
                  <summary>{t('whyShown')}</summary>
                  <p className="why-intro">{t('whyIntro', { id: c.id, version: c.version })}</p>
                  {c.clauses.filter((cl) => a.clauseIds.includes(cl.id)).map((cl) => (
                    <blockquote key={cl.id}><span className="clause-id">{cl.id}</span> {cl.text}</blockquote>
                  ))}
                </details>
                {a.provider && a.status !== 'not_provided' && (
                  <div className="provider-cta">
                    <Button variant="secondary" onClick={() => { setProvider(a); onProvider(a.id); }} disabled={working}>
                      {t('goProvider')} <IconExternal size={16} />
                    </Button>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <div className="none-row">
        <button className={`choose-btn choose-none ${ex.choice === 'none' ? 'is-on' : ''}`} aria-pressed={ex.choice === 'none'} disabled={working} onClick={() => onChoose('none')}>
          {ex.choice === 'none' && <IconCheck size={16} />} {t('noneOfThese')}
        </button>
        <p className="muted small">{t('choiceOptional')}</p>
      </div>

      {ex.details_opened.length > 0 && (
        <section className="next-card" aria-labelledby="next-card-title">
          <div className="next-card-text">
            <h2 className="next-card-title" id="next-card-title">{t('nextCardTitle')}</h2>
            <p>{t('nextCardBody')}</p>
          </div>
          <div className="next-card-actions">
            <Button onClick={onFeedback} busy={busy} disabled={working} className="btn-continue">{t('toFeedback')} <IconArrowRight size={18} /></Button>
            <button type="button" className="link-quiet" onClick={onCategories} disabled={busy || working}>{t('nextCardAlt')}</button>
          </div>
        </section>
      )}

      {provider && <ProviderDialog c={c} a={provider} onClose={() => setProvider(null)} onFeedback={() => { setProvider(null); onFeedback(); }} />}
    </div>
  );
}

function ProviderDialog({ c, a, onClose, onFeedback }: { c: DemoCase; a: Alternative; onClose: () => void; onFeedback: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) {
      if (typeof d.showModal === 'function') d.showModal(); else d.setAttribute('open', '');
    }
  }, []);
  return (
    <dialog ref={ref} className="dialog" aria-labelledby="prov-title" onClose={onClose} onCancel={onClose}>
      <div className="dialog-body">
        <p className="demo-chip demo-chip-inline">{t('simSummary')}</p>
        <h2 id="prov-title" className="h-block">{a.provider!.label}</h2>
        <p>{t('simBody')}</p>
        <dl className="alt-detail">
          <div><dt>{t('simWhere')}</dt><dd>{a.provider!.where}</dd></div>
          <div><dt>{t('simHow')}</dt><dd><ol className="steps-list">{a.provider!.how.map((h) => <li key={h}>{h}</li>)}</ol></dd></div>
          <div><dt>{t('simWho')}</dt><dd>{a.contact}</dd></div>
        </dl>
        <p className="muted small">{t('simNote', { provider: c.provider })}</p>
        <div className="dialog-actions dialog-actions-split">
          <Button variant="secondary" onClick={() => ref.current?.close()}>{t('simBack')}</Button>
          <Button onClick={() => { ref.current?.close(); onFeedback(); }}>{t('toFeedback')} <IconArrowRight size={18} /></Button>
        </div>
      </div>
    </dialog>
  );
}
