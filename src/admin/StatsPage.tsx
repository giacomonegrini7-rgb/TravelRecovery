import { useMemo, useState } from 'react';
import type { AdminCtx } from './AdminApp';
import { filterLines } from './AdminApp';
import { BarChart } from './charts';
import {
  computeFunnel, computeKpis, demoStats, distribution, emailStates, fmtPct, fmtRatio, highUtility, inProgressSplit,
  pathComparison, withoutPath, type AnswerScope, type Ratio,
} from '../lib/stats';
import { datasetJson, download, participationsCsv, stamp, statsCsv } from '../lib/exports';
import { href } from '../lib/router';
import { Button } from '../ui/components';
import { QUESTIONNAIRES } from '../config/questionnaire';
import { catLabel } from '../lib/stats';

function Kpi({ label, value, sub, ratio, hint }: { label: string; value?: number; sub?: string; ratio?: Ratio; hint?: string }) {
  return (
    <div className="kpi">
      <span className="kpi-label">{label}</span>
      {ratio ? (
        <>
          <span className="kpi-value">{ratio.pct === null ? 'Non disponibile' : fmtPct(ratio.pct)}</span>
          <span className="kpi-sub">{ratio.num} su {ratio.den}</span>
        </>
      ) : (
        <span className="kpi-value">{value}</span>
      )}
      {sub && <span className="kpi-sub">{sub}</span>}
      {hint && <span className="kpi-hint">{hint}</span>}
    </div>
  );
}

export function ExportBar({ ctx }: { ctx: AdminCtx }) {
  const [withEmail, setWithEmail] = useState(false);
  const lines = filterLines(ctx.filters);
  const prefix = ctx.ds.sample ? 'esempio-' : '';
  return (
    <section className="export-bar" aria-label="Esportazioni">
      <span className="export-title">Esporta i {ctx.rows.length} risultati filtrati</span>
      <div className="export-actions">
        <Button variant="secondary" onClick={() => download(`${prefix}partecipazioni-${stamp()}.csv`, participationsCsv(ctx.ds, ctx.rows, withEmail), 'text/csv;charset=utf-8')}>CSV partecipazioni</Button>
        <label className="inline-check"><input type="checkbox" checked={withEmail} onChange={(e) => setWithEmail(e.target.checked)} /> includi email</label>
        <Button variant="secondary" onClick={() => download(`${prefix}statistiche-${stamp()}.csv`, statsCsv(ctx.ds, ctx.rows, lines, 'completed', { path: ctx.filters.path, category: ctx.filters.category }), 'text/csv;charset=utf-8')}>CSV statistiche</Button>
        <Button variant="secondary" onClick={() => download(`${prefix}dataset-${stamp()}.json`, datasetJson(ctx.ds, ctx.rows, lines), 'application/json')}>JSON completo</Button>
      </div>
    </section>
  );
}

export function StatsPage({ ctx }: { ctx: AdminCtx }) {
  const { ds, rows, filters } = ctx;
  const [scope, setScope] = useState<AnswerScope>('completed');
  const [anyQ, setAnyQ] = useState('Q4');
  const k = useMemo(() => computeKpis(rows), [rows]);
  const funnel = useMemo(() => computeFunnel(rows), [rows]);
  const split = useMemo(() => inProgressSplit(rows, new Date(ds.generated_at)), [rows, ds.generated_at]);
  const demo = useMemo(() => demoStats(ds, rows, filters.category), [ds, rows, filters.category]);
  const def = QUESTIONNAIRES[filters.version || 'q-v1'] ?? Object.values(QUESTIONNAIRES)[0];

  if (ds.participations.length === 0) {
    return (
      <div className="empty">
        <h1 className="h-screen">Ancora nessuna partecipazione</h1>
        <p>Non ci sono dati per i filtri correnti. Per verificare il funzionamento, fai una prova del questionario in modalità test e poi seleziona <strong>Dati: Solo test</strong> nei filtri.</p>
        <p><a href={href('/')} target="_blank" rel="noopener">Apri il questionario in una nuova scheda</a></p>
        <p className="muted small">I grafici non vengono mai riempiti con risultati simulati.</p>
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div className="empty">
        <h1 className="h-screen">Nessun risultato con questi filtri</h1>
        <p>Modifica o azzera i filtri per vedere le partecipazioni disponibili.</p>
      </div>
    );
  }

  const dist = (qid: string) => distribution(ds, rows, qid, scope, { f1Category: filters.category !== 'all' ? filters.category : undefined });
  const chart = (qid: string) => {
    const d = dist(qid);
    if (!d) return null;
    return (
      <BarChart
        key={qid} id={`ch-${qid}`} title={<><span className="qid">{qid}</span> {d.question.title}</>}
        rows={d.rows.map((r) => ({ key: r.optionId, label: r.label, count: r.count, pct: r.pct, muted: /non (saprei|ricordo)/i.test(r.label) }))}
        denominatorLabel={<>Rispondenti: <strong>{d.respondents}</strong>{d.notApplicable ? `; non applicabile: ${d.notApplicable} (esclusi)` : ''}{d.missing ? `; senza risposta: ${d.missing}` : ''}</>}
        note={d.multi ? 'Risposta multipla: ogni percentuale è calcolata sui rispondenti della domanda, la somma può superare il 100%.' : undefined}
        footer={(qid === 'F1a' || qid === 'F1b') && filters.category !== 'all'
          ? <p className="chart-note">Inclusi solo i giudizi riferiti a un esempio della categoria {catLabel(filters.category)}.</p> : undefined}
      />
    );
  };
  const hu = highUtility(rows);
  const pc = pathComparison(rows);
  const noPath = withoutPath(rows);

  return (
    <div className="stats">
      <div className="page-head">
        <h1 className="h-screen">Statistiche</h1>
        <p className="muted">Le partecipazioni sono compilazioni, non persone uniche: una stessa persona può compilare più volte e una stessa email può essere collegata a più partecipazioni.</p>
      </div>
      <ExportBar ctx={ctx} />

      <section className="panel">
        <h2 className="h-section">Indicatori principali</h2>
        <div className="kpi-grid">
          <Kpi label="Partecipazioni avviate" value={k.started} hint="Clic su «Inizia» registrato" />
          <Kpi label="Questionari completati" value={k.completed} hint="Risposte obbligatorie e F3 salvate, con o senza email" />
          <Kpi label="Tasso di completamento" ratio={k.completionRate} />
          <Kpi label="Invito email visualizzato" value={k.emailShown} />
          <Kpi label="Richieste di iscrizione" value={k.subscribed} hint="Partecipazioni con richiesta registrata" />
          <Kpi label="Iscrizione tra chi ha visto l’invito" ratio={k.subscribeAmongShown} />
          <Kpi label="Iscrizione tra i completamenti" ratio={k.subscribeAmongCompleted} />
          <Kpi label="Email uniche associate" value={k.uniqueEmails} hint="Indirizzi non verificati" />
          <Kpi label="Contatti attivi associati" value={k.activeContacts} hint="Stato attuale (esclude i revocati)" />
        </div>
      </section>

      <section className="panel">
        <h2 className="h-section">Funnel</h2>
        <p className="muted small">Ogni partecipazione conta al massimo una volta per passaggio. «Demo esplorata» = dettaglio di almeno un’alternativa aperto. Percentuali rispetto all’avvio.</p>
        <ol className="funnel">
          {funnel.map((s, i) => (
            <li key={s.id} className="funnel-row">
              <span className="funnel-label">{s.label}</span>
              <span className="funnel-track" aria-hidden="true"><span style={{ width: `${s.fromStart.pct ?? 0}%` }} /></span>
              <span className="funnel-count"><strong>{s.count}</strong> <span className="muted">{fmtPct(s.fromStart.pct)}</span></span>
              <span className="funnel-lost">{i > 0 ? (s.lostFromPrevious ? `−${s.lostFromPrevious} dal passaggio precedente` : 'nessuna perdita') : ''}</span>
            </li>
          ))}
        </ol>
        <p className="small">
          Compilazioni non completate: <strong>{split.recent}</strong> con attività nelle ultime {split.hours} ore (probabilmente ancora in corso) e <strong>{split.inactive}</strong> inattive da più tempo (abbandono solo ipotizzato: il motivo non è osservato).
          {noPath ? ` ${noPath} senza percorso determinato.` : ''}
        </p>
      </section>

      <section className="panel">
        <h2 className="h-section">Confronto fra percorsi</h2>
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th scope="col">Percorso</th><th scope="col" className="num">Partecipazioni</th><th scope="col">Completamento</th><th scope="col">Feedback inviato</th><th scope="col">Iscrizione tra i completamenti</th><th scope="col">Utilità elevata (F2)</th></tr></thead>
            <tbody>
              {pc.map((r) => (
                <tr key={r.path}>
                  <th scope="row">{r.label}</th><td className="num">{r.n}</td><td>{fmtRatio(r.completion)}</td><td>{fmtRatio(r.feedback)}</td>
                  <td>{fmtRatio(r.subscribeAmongCompleted)}</td><td>{fmtRatio(r.high)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted small">Numerosità sempre visibili. Con campioni piccoli le differenze tra percorsi non vanno lette come significative: questa vista non esegue test statistici.</p>
        <BarChart id="email-states" title="Stato della schermata email (tutte le partecipazioni filtrate)"
          rows={emailStates(rows).map((e) => ({ key: e.key, label: e.label, count: e.count, pct: rows.length ? (e.count / rows.length) * 100 : null }))}
          note="Una mancata iscrizione non equivale a un rifiuto: il rifiuto è contato solo con «No grazie, termina»." />
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2 className="h-section">Risposte</h2>
          <div className="segmented" role="group" aria-label="Risposte considerate">
            <button aria-pressed={scope === 'completed'} onClick={() => setScope('completed')}>Solo completati</button>
            <button aria-pressed={scope === 'all'} onClick={() => setScope('all')}>Incluse parziali</button>
          </div>
        </div>
        <p className="muted small">{scope === 'completed' ? 'Solo questionari completati.' : 'Incluse le risposte confermate da compilazioni non completate.'} Le domande non applicabili non entrano nel denominatore.</p>

        <h3 className="h-sub">Domande iniziali</h3>
        <div className="chart-grid">{chart('Q1')}{chart('Q2')}</div>

        <h3 className="h-sub">Percorso esperienza</h3>
        <div className="chart-grid">{['Q3', 'Q5', 'Q6', 'Q7', 'Q8', 'Q9'].map(chart)}</div>

        <h3 className="h-sub">Percorso alternativo</h3>
        <p className="muted small">Tenuto separato dai dati di esperienza. Il sottogruppo «mai acquistato personalmente» non risponde a A1–A4.</p>
        <div className="chart-grid">{['A1', 'A2', 'A3', 'A4'].map(chart)}</div>

        <h3 className="h-sub">Qualsiasi domanda chiusa</h3>
        <label className="inline-select">Domanda
          <select value={anyQ} onChange={(e) => setAnyQ(e.target.value)}>
            {def.questions.filter((q) => q.type !== 'text').map((q) => <option key={q.id} value={q.id}>{q.id}: {q.short}</option>)}
          </select>
        </label>
        <div className="chart-grid chart-grid-1">{chart(anyQ)}</div>
      </section>

      <section className="panel">
        <h2 className="h-section">Demo</h2>
        <p className="muted small">Questi grafici contano le <strong>esplorazioni</strong> (una partecipazione può provare più esempi): {demo.explorations} esplorazioni, {demo.explored} con almeno un dettaglio aperto.</p>
        <div className="chart-grid">
          <BarChart id="demo-cat" title="Categorie esplorate" rows={demo.byCategory.map((c) => ({ key: c.key, label: c.label, count: c.count, pct: demo.explorations ? (c.count / demo.explorations) * 100 : null }))} denominatorLabel={`Esplorazioni: ${demo.explorations}`} />
          <BarChart id="demo-choice" title="Scelte effettuate"
            rows={[...demo.chosen.map((t) => ({ key: t.key, label: t.label, count: t.count, pct: demo.explorations ? (t.count / demo.explorations) * 100 : null })),
              { key: 'none', label: 'Nessuna di queste', count: demo.none, pct: demo.explorations ? (demo.none / demo.explorations) * 100 : null },
              { key: 'nochoice', label: 'Nessuna scelta registrata', count: demo.noChoice, pct: demo.explorations ? (demo.noChoice / demo.explorations) * 100 : null, muted: true }]}
            denominatorLabel={`Esplorazioni: ${demo.explorations}. Clic sul passaggio al fornitore: ${demo.providerClicks}`} />
          <BarChart id="demo-open" title="Alternative di cui è stato aperto il dettaglio"
            rows={demo.opened.map((t) => ({ key: t.key, label: t.label, count: t.count, pct: demo.explorations ? (t.count / demo.explorations) * 100 : null }))}
            denominatorLabel={`Esplorazioni: ${demo.explorations}`} note="Un’esplorazione può aprire più alternative: la somma può superare il 100%." />
        </div>
      </section>

      <section className="panel">
        <h2 className="h-section">Feedback sulla demo</h2>
        <div className="metric-callout">
          <span className="metric-value">{hu.ratio.pct === null ? 'Non disponibile' : fmtPct(hu.ratio.pct)}</span>
          <div>
            <p><strong>Utilità elevata percepita</strong>: risposte «Molto utile» + «Estremamente utile» a F2, divise per le risposte valutabili ({hu.ratio.num} su {hu.ratio.den}). «Non saprei valutarlo»: <strong>{hu.cannotSay}</strong>, escluse dal denominatore.</p>
            <p className="muted small">È una percezione dichiarata dopo una demo con dati inventati, non una validazione del mercato né una stima di utilizzo o di disponibilità a pagare.</p>
          </div>
        </div>
        <p className="muted small">F1 non misura un miglioramento rispetto a prima della demo: non esiste una misura pre-demo equivalente.</p>
        <div className="chart-grid">{['F1a', 'F1b', 'F2', 'F3'].map(chart)}</div>
      </section>
    </div>
  );
}
