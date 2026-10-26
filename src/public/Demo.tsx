import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  BENEFIT_LABEL, DEMO_CASES, NEED_LABEL, STATUS_LABEL, alternativesFor, compute, dateFromRef, getCase, highestRefund,
  type Alternative, type CategoryId, type DemoCase, type NeedId,
} from '../config/demoCases';
import { publicBackend } from '../lib/backend';
import { errorText, type DemoAction, type ExplorationState } from '../lib/backend/types';
import { eur, longDate, shortDate, timeOf, todayRomeISO } from '../lib/format';
import { Alert, Button } from '../ui/components';
import {
  CATEGORY_ICON, IconArrowLeft, IconCheck, IconChevron, IconClock, IconCross, IconDoc, IconExternal, IconQuestion, IconUpload,
} from '../ui/icons';
import { uuid } from './PublicApp';

type Stage = 'categories' | 'upload' | 'need' | 'analysis' | 'results';

export function Demo({ participationId, explorations, setExplorations, onFeedback, onBack, busy, error }: {
  participationId: string; explorations: ExplorationState[];
  setExplorations: (fn: (e: ExplorationState[]) => ExplorationState[]) => void;
  onFeedback: () => void; onBack?: () => void; busy: boolean; error: ReactNode;
}) {
  const backend = publicBackend();
  const [stage, setStage] = useState<Stage>('categories');
  const [category, setCategory] = useState<CategoryId | null>(null);
  const [need, setNeed] = useState<NeedId | null>(null);
  const [current, setCurrent] = useState<string | null>(null); // id esplorazione corrente
  const [localErr, setLocalErr] = useState<{ msg: string; retry: () => void } | null>(null);
  const [working, setWorking] = useState(false);
  // riferimento temporale congelato all'avvio della demo
  const [refDate] = useState(() => explorations[0]?.reference_date ?? todayRomeISO());
  const pendingKey = useRef<string | null>(null);
  const headRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => { headRef.current?.focus({ preventScroll: true }); window.scrollTo({ top: 0 }); }, [stage]);

  const explored = explorations.some((e) => e.details_opened.length > 0);
  const c = category ? getCase(category) : null;
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
    <Alert action={<Button variant="secondary" onClick={localErr.retry} disabled={working}>Riprova</Button>}>{localErr.msg}</Alert>
  );

  const footer = (
    <div className="demo-footer">
      <div className="demo-footer-inner">
        {stage === 'results' || (stage === 'categories' && explored) ? (
          <>
            {stage === 'results' && <Button variant="secondary" onClick={tryAnother} disabled={busy || working}>Prova un’altra categoria</Button>}
            <div className="demo-footer-main">
              {!explored && <p className="demo-footer-hint" id="fb-hint">Apri i dettagli di almeno un’alternativa per passare alle domande finali.</p>}
              <Button onClick={goFeedback} disabled={!explored || working} busy={busy} aria-describedby={!explored ? 'fb-hint' : undefined}>
                Passa alle domande finali
              </Button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );

  return (
    <section className="demo">
      {stage === 'categories' && (
        <>
          <div className="demo-head">
            <h1 className="h-screen" tabIndex={-1} ref={headRef}>Scegli una prenotazione di esempio</h1>
            <p className="lead">Ogni categoria contiene un caso inventato con le sue condizioni. Puoi provarne una o più, in qualsiasi ordine.</p>
          </div>
          <ul className="cat-grid" role="list">
            {DEMO_CASES.map((dc) => {
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
                    {tried && <span className="cat-tried"><IconCheck size={14} /> Provato</span>}
                    <span className="cat-perf" aria-hidden="true" />
                  </button>
                </li>
              );
            })}
          </ul>
          {onBack && !explored && (
            <div className="step-nav"><Button variant="ghost" className="btn-back" onClick={onBack}><IconArrowLeft size={18} /> Indietro</Button><span /></div>
          )}
        </>
      )}

      {stage === 'upload' && c && (
        <div className="demo-narrow">
          <BackLink onClick={() => setStage('categories')}>Categorie</BackLink>
          <h1 className="h-screen" tabIndex={-1} ref={headRef}>Carica la tua prenotazione</h1>
          <div className="upload-zone" aria-describedby="upload-note">
            <span className="upload-icon"><IconUpload size={28} /></span>
            <p className="upload-title">Qui, nel servizio finale, caricheresti la conferma</p>
            <p className="upload-sub">Email, PDF del biglietto o screenshot della prenotazione.</p>
            <p className="upload-note" id="upload-note">In questa demo non si caricano file e non vengono letti documenti reali.</p>
          </div>
          {errBox}
          <div className="center-action">
            <Button onClick={() => setStage('need')}>Usa una prenotazione di esempio</Button>
          </div>
        </div>
      )}

      {stage === 'need' && c && (
        <div className="demo-narrow">
          <BackLink onClick={() => setStage('upload')}>Caricamento</BackLink>
          <h1 className="h-screen" tabIndex={-1} ref={headRef}>Ecco la prenotazione di esempio</h1>
          <BookingTicket c={c} refDate={refDate} />
          <fieldset className="need-set">
            <legend className="h-block">Che cosa ti serve?</legend>
            <div className="need-grid">
              {(Object.keys(c.needs) as NeedId[]).map((n) => (
                <label key={n} className={`need-card ${need === n ? 'is-checked' : ''}`}>
                  <input type="radio" name="need" value={n} checked={need === n} onChange={() => setNeed(n)} />
                  <span className="choice-mark mark-radio" aria-hidden="true" />
                  <span className="need-text"><span className="need-title">{NEED_LABEL[n].title}</span><span className="need-hint">{NEED_LABEL[n].hint}</span></span>
                </label>
              ))}
            </div>
          </fieldset>
          {errBox}
          <div className="center-action">
            <Button onClick={analyze} disabled={!need} busy={working}>Mostra le alternative</Button>
          </div>
        </div>
      )}

      {stage === 'analysis' && c && (
        <div className="demo-narrow analysis" aria-live="polite">
          <h1 className="h-screen" tabIndex={-1} ref={headRef}>Confronto le condizioni dell’esempio…</h1>
          <ol className="analysis-steps">
            <li style={{ animationDelay: '0ms' }}><IconDoc size={18} /> Condizioni inventate del caso {c.id}</li>
            <li style={{ animationDelay: '280ms' }}><IconClock size={18} /> Scadenze rispetto a {longDate(dateFromRef(refDate, 0))}</li>
            <li style={{ animationDelay: '560ms' }}><IconCheck size={18} /> Importi, costi e passaggi</li>
          </ol>
          <p className="muted small">Simulazione: nessun collegamento a fornitori reali, nessun controllo in tempo reale.</p>
        </div>
      )}

      {stage === 'results' && c && need && ex && (
        <Results
          c={c} need={need} ex={ex} refDate={refDate} working={working} err={errBox} headRef={headRef}
          onOpen={(alt) => void record('open_detail', alt)} onChoose={(alt) => void record('choose', alt)}
          onProvider={(alt) => void record('provider_click', alt)} onCategories={tryAnother}
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
    <article className={`ticket booking ${compact ? 'booking-compact' : ''}`} aria-label="Prenotazione di esempio">
      <div className="ticket-main">
        <p className="booking-cat"><Icon size={18} /> {c.categoryLabel}<span className="booking-flag">Esempio inventato</span></p>
        <h2 className="booking-title">{c.title}</h2>
        <p className="booking-place">{c.place}</p>
        <dl className="booking-meta">
          <div><dt>Data</dt><dd>{longDate(when)}{c.serviceTime ? `, ${timeOf(when)}` : ''}</dd></div>
          <div><dt>Fornitore</dt><dd>{c.provider}</dd></div>
          {!compact && <div><dt>Canale</dt><dd>{c.channel}</dd></div>}
          {!compact && <div><dt>Dettagli</dt><dd>{c.details.join('; ')}</dd></div>}
        </dl>
      </div>
      <div className="ticket-stub booking-stub">
        <span className="stub-label">Pagato</span>
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
  return <span className={`pill pill-${status}`}><Icon size={15} /> {STATUS_LABEL[status]}</span>;
}

function KeyFigure({ c, a }: { c: DemoCase; a: Alternative }) {
  const k = compute(c, a);
  if (a.status === 'not_provided') {
    return <div className="figure figure-none"><span className="figure-label">Esito nell’esempio</span><span className="figure-value">Non prevista</span></div>;
  }
  if (k.refundNet !== null) {
    return (
      <div className="figure figure-refund">
        <span className="figure-label">Rimborso in denaro</span>
        <span className="figure-value">{eur(k.refundNet)}</span>
        <span className="figure-sub">su {eur(c.paid)} pagati{k.deductionsTotal ? `, trattenute ${eur(k.deductionsTotal)}` : ', nessuna trattenuta'}</span>
      </div>
    );
  }
  if (k.credit !== null) {
    return (
      <div className="figure figure-credit">
        <span className="figure-label">Credito utilizzabile</span>
        <span className="figure-value">{eur(k.credit)}</span>
        <span className="figure-sub">Non è denaro rimborsato; validità: {a.credit!.validity.toLowerCase()}</span>
      </div>
    );
  }
  if (a.benefit === 'resale') {
    return <div className="figure figure-uncertain"><span className="figure-label">Recupero</span><span className="figure-value">Non garantito</span><span className="figure-sub">Dipende da un’eventuale vendita</span></div>;
  }
  return (
    <div className="figure figure-change">
      <span className="figure-label">{a.keepsUse ? 'Conservi l’utilizzo' : 'Costo'}</span>
      <span className="figure-value">{k.extraKnown ? `${eur(k.extraKnown)}${k.hasUnknownCosts ? ' + da verificare' : ''}` : k.hasUnknownCosts ? 'Costo da verificare' : 'Nessun costo noto'}</span>
      <span className="figure-sub">{a.benefit === 'transfer' || a.benefit === 'correction' ? 'Nessun rimborso dal fornitore' : 'Non è un rimborso'}</span>
    </div>
  );
}

function Results({ c, need, ex, refDate, working, err, headRef, onOpen, onChoose, onProvider, onCategories }: {
  c: DemoCase; need: NeedId; ex: ExplorationState; refDate: string; working: boolean; err: ReactNode;
  headRef: React.RefObject<HTMLHeadingElement | null>;
  onOpen: (alt: string) => void; onChoose: (alt: string) => void; onProvider: (alt: string) => void; onCategories: () => void;
}) {
  const alts = alternativesFor(c, need);
  const best = highestRefund(c, alts.map((a) => a.id));
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [provider, setProvider] = useState<Alternative | null>(null);
  void onCategories;

  return (
    <div className="results">
      <div className="results-head">
        <h1 className="h-screen" tabIndex={-1} ref={headRef}>{alts.length} alternative per «{NEED_LABEL[need].title.toLowerCase()}»</h1>
        <p className="results-ref">Situazione calcolata al <strong>{longDate(dateFromRef(refDate, 0))}</strong> (data di riferimento dell’esempio).</p>
        <BookingTicket c={c} refDate={refDate} compact />
        {best ? (
          <p className="best-note"><span className="best-dot" aria-hidden="true" /> L’etichetta <strong>«Maggior rimborso in denaro»</strong> indica l’importo netto più alto restituito in denaro tra le alternative disponibili nell’esempio. Non considera crediti, modifiche o le tue esigenze: non è automaticamente la scelta migliore.</p>
        ) : (
          <p className="best-note">Nessuna alternativa di questo esempio prevede un rimborso in denaro: i valori mostrati sono crediti, modifiche o possibilità d’uso.</p>
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
                <span className="alt-benefit">{BENEFIT_LABEL[a.benefit]}</span>
                <StatusPill status={a.status} />
              </div>
              <h2 className="alt-title">{a.title}</h2>
              {best === a.id && <p className="best-tag"><span className="best-dot" aria-hidden="true" /> Maggior rimborso in denaro</p>}
              <div className="alt-figures">
                <KeyFigure c={c} a={a} />
                <div className="figure figure-deadline">
                  <span className="figure-label">Scadenza</span>
                  {deadline ? (
                    <>
                      <span className="figure-value figure-value-sm"><IconClock size={16} /> {shortDate(deadline)}, {timeOf(deadline)}</span>
                      <span className="figure-sub">{a.deadline!.text}</span>
                    </>
                  ) : <span className="figure-value figure-value-sm">{a.status === 'not_provided' ? '—' : 'Da verificare'}</span>}
                </div>
              </div>
              <p className="alt-summary">{a.summary}</p>
              {a.reason && <p className="alt-reason">{a.status === 'not_provided' ? 'Perché non è prevista: ' : 'Perché va confermata: '}{a.reason}</p>}

              <div className="alt-actions">
                <button
                  className="disclosure" aria-expanded={Boolean(isOpen)} aria-controls={panelId}
                  onClick={() => {
                    setOpen((o) => ({ ...o, [a.id]: !o[a.id] }));
                    if (!isOpen && !ex.details_opened.includes(a.id)) onOpen(a.id);
                  }}
                >
                  {isOpen ? 'Nascondi dettagli' : 'Dettagli e condizioni'} <IconChevron size={18} className={isOpen ? 'rot' : ''} />
                </button>
                {a.status !== 'not_provided' && (
                  <button className={`choose-btn ${chosen ? 'is-on' : ''}`} aria-pressed={chosen} disabled={working} onClick={() => onChoose(a.id)}>
                    {chosen ? <><IconCheck size={16} /> Scelta</> : 'Scegli questa'}
                  </button>
                )}
              </div>

              <div id={panelId} className="alt-panel" hidden={!isOpen}>
                <dl className="alt-detail">
                  <div><dt>Che cosa permette</dt><dd>{a.summary}</dd></div>
                  {a.status !== 'not_provided' && (
                    <div>
                      <dt>Importi</dt>
                      <dd>
                        <ul className="money-list">
                          <li><span>Importo pagato</span><span>{eur(c.paid)}</span></li>
                          {a.refundGross !== undefined && <li><span>Importo rimborsabile lordo</span><span>{eur(Math.min(a.refundGross, c.paid))}</span></li>}
                          {(a.deductions ?? []).map((d) => <li key={d.label}><span>{d.label}</span><span>− {eur(d.amount)}</span></li>)}
                          {k.refundNet !== null && <li className="money-total"><span>Rimborso netto in denaro</span><span>{eur(k.refundNet)}</span></li>}
                          {k.credit !== null && <li className="money-total"><span>Credito (non rimborsabile in denaro)</span><span>{eur(k.credit)}</span></li>}
                          {(a.extraCosts ?? []).map((d) => <li key={d.label}><span>{d.label}</span><span>{eur(d.amount)}</span></li>)}
                          {(a.toVerify ?? []).map((t) => <li key={t}><span>{t}</span><span className="tbd">Da verificare</span></li>)}
                          {a.notGuaranteed && <li className="money-note"><span>{a.notGuaranteed}</span></li>}
                        </ul>
                      </dd>
                    </div>
                  )}
                  {a.conditions.length > 0 && <div><dt>Condizioni rilevanti</dt><dd><ul className="bullets">{a.conditions.map((x) => <li key={x}>{x}</li>)}</ul></dd></div>}
                  {a.steps.length > 0 && <div><dt>Passaggi da seguire</dt><dd><ol className="steps-list">{a.steps.map((x) => <li key={x}>{x}</li>)}</ol></dd></div>}
                  {a.status !== 'not_provided' && <div><dt>A chi rivolgersi</dt><dd>{a.contact}</dd></div>}
                </dl>
                <details className="why">
                  <summary>Perché compare questa opzione?</summary>
                  <p className="why-intro">Estratto delle condizioni inventate del caso <strong>{c.id}</strong> ({c.version}):</p>
                  {c.clauses.filter((cl) => a.clauseIds.includes(cl.id)).map((cl) => (
                    <blockquote key={cl.id}><span className="clause-id">{cl.id}</span> {cl.text}</blockquote>
                  ))}
                </details>
                {a.provider && a.status !== 'not_provided' && (
                  <div className="provider-cta">
                    <Button variant="secondary" onClick={() => { setProvider(a); onProvider(a.id); }} disabled={working}>
                      Vai alla procedura del fornitore <IconExternal size={16} />
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
          {ex.choice === 'none' && <IconCheck size={16} />} Nessuna di queste
        </button>
        <p className="muted small">Scegliere un’opzione è facoltativo e non avvia alcuna operazione.</p>
      </div>

      {provider && <ProviderDialog c={c} a={provider} onClose={() => setProvider(null)} />}
    </div>
  );
}

function ProviderDialog({ c, a, onClose }: { c: DemoCase; a: Alternative; onClose: () => void }) {
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
        <p className="demo-chip demo-chip-inline">Riepilogo simulato</p>
        <h2 id="prov-title" className="h-block">{a.provider!.label}</h2>
        <p>Nel servizio reale, a questo punto verresti indirizzato al fornitore per completare l’operazione. Travel Recovery non la eseguirebbe al posto tuo.</p>
        <dl className="alt-detail">
          <div><dt>Dove si prosegue</dt><dd>{a.provider!.where}</dd></div>
          <div><dt>Come</dt><dd><ol className="steps-list">{a.provider!.how.map((h) => <li key={h}>{h}</li>)}</ol></dd></div>
          <div><dt>Soggetto</dt><dd>{a.contact}</dd></div>
        </dl>
        <p className="muted small">Fornitore inventato ({c.provider}). Nessun sito esterno viene aperto e nessuna modifica viene effettuata.</p>
        <div className="dialog-actions">
          <Button onClick={() => ref.current?.close()}>Torna alle alternative</Button>
        </div>
      </div>
    </dialog>
  );
}
