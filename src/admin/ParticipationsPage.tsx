import { useMemo, useState } from 'react';
import type { AdminCtx } from './AdminApp';
import { ExportBar } from './StatsPage';
import { adminApi } from '../lib/backend';
import { errorText, type DatasetParticipation } from '../lib/backend/types';
import { altLabel, catLabel, definitionsOf, PATH_LABEL } from '../lib/stats';
import { dateTimeRome } from '../lib/format';
import { download, participationJson } from '../lib/exports';
import { summaryLines } from '../lib/report';
import { href, navigate } from '../lib/router';
import { Alert, Button } from '../ui/components';
import { useConfirm } from '../ui/confirm';
import { readEnv } from '../config/project';
import { NEED_LABEL, type NeedId } from '../config/demoCases';

const PAGE = 25;

export function ParticipationsPage({ ctx }: { ctx: AdminCtx }) {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<'all' | 'completed' | 'in_progress'>('all');
  const [sub, setSub] = useState<'all' | 'yes' | 'no'>('all');
  const [page, setPage] = useState(0);
  const list = useMemo(() => ctx.rows.filter((p) =>
    (!q || p.code.toLowerCase().includes(q.trim().toLowerCase())) &&
    (status === 'all' || p.status === status) &&
    (sub === 'all' || (sub === 'yes') === Boolean(p.events.email_subscribed))), [ctx.rows, q, status, sub]);
  const pages = Math.max(1, Math.ceil(list.length / PAGE));
  const view = list.slice(page * PAGE, page * PAGE + PAGE);

  return (
    <div>
      <div className="page-head">
        <h1 className="h-screen">Partecipazioni</h1>
        <p className="muted">{list.length} di {ctx.rows.length} partecipazioni filtrate. Le esportazioni includono sempre tutti i risultati dei filtri superiori, non solo la pagina visualizzata.</p>
      </div>
      <ExportBar ctx={ctx} />
      <div className="list-tools">
        <label>Cerca per codice<input type="search" value={q} placeholder="es. TR-7K3M9Q" onChange={(e) => { setQ(e.target.value); setPage(0); }} /></label>
        <label>Stato
          <select value={status} onChange={(e) => { setStatus(e.target.value as typeof status); setPage(0); }}>
            <option value="all">Tutti</option><option value="completed">Completati</option><option value="in_progress">Non completati</option>
          </select>
        </label>
        <label>Iscrizione
          <select value={sub} onChange={(e) => { setSub(e.target.value as typeof sub); setPage(0); }}>
            <option value="all">Tutte</option><option value="yes">Con richiesta</option><option value="no">Senza richiesta</option>
          </select>
        </label>
      </div>
      {list.length === 0 ? (
        <div className="empty"><p>Nessuna partecipazione corrisponde alla ricerca.</p></div>
      ) : (
        <>
          <ul className="p-list" role="list">
            {view.map((p) => (
              <li key={p.id}>
                <a className="p-row" href={href(`/admin/partecipazioni/${encodeURIComponent(p.id)}`)}>
                  <span className="p-code">{p.code}</span>
                  <span className="p-date">{dateTimeRome(p.started_at)}</span>
                  <span className="p-path">{p.path ? PATH_LABEL[p.path] : 'Percorso non determinato'}</span>
                  <span className={`p-status st-${p.status}`}>{p.status === 'completed' ? 'Completato' : 'Non completato'}</span>
                  <span className="p-cats">{p.explorations.length ? [...new Set(p.explorations.map((e) => catLabel(e.category)))].join(', ') : 'Nessun esempio'}</span>
                  <span className="p-flags">
                    {p.events.email_subscribed && <span className="tag tag-mail">Iscrizione</span>}
                    {p.is_test && <span className="tag tag-test">Test</span>}
                  </span>
                </a>
              </li>
            ))}
          </ul>
          {pages > 1 && (
            <nav className="pager" aria-label="Pagine">
              <Button variant="ghost" disabled={page === 0} onClick={() => setPage(page - 1)}>Precedente</Button>
              <span>Pagina {page + 1} di {pages}</span>
              <Button variant="ghost" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>Successiva</Button>
            </nav>
          )}
        </>
      )}
    </div>
  );
}

function AnswerCell({ p, qid, ctx }: { p: DatasetParticipation; qid: string; ctx: AdminCtx }) {
  const def = definitionsOf(ctx.ds)[p.questionnaire_version];
  const q = def?.questions.find((x) => x.id === qid);
  const a = p.answers.find((x) => x.question_id === qid);
  if (!a) return <span className="ans-missing">Nessuna risposta{q?.required ? '' : ' (facoltativa)'}</span>;
  if (a.status === 'not_applicable') return <span className="ans-na">Non applicabile al percorso</span>;
  const lbl = (id: string) => q?.options?.find((o) => o.id === id)?.label ?? id;
  if (a.value_multi) return <ul className="ans-multi">{a.value_multi.map((v) => <li key={v}>{lbl(v)}</li>)}</ul>;
  if (a.value_single) return <span>{lbl(a.value_single)}</span>;
  // testo aperto mostrato come testo, mai come HTML
  return <p className="ans-open">{a.value_text}</p>;
}

export function ReportPage({ ctx, id }: { ctx: AdminCtx; id: string }) {
  const p = ctx.ds.participations.find((x) => x.id === id);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const confirm = useConfirm();
  if (!p) {
    return (
      <div className="empty">
        <h1 className="h-screen">Partecipazione non trovata</h1>
        <p>Potrebbe essere esclusa dai filtri correnti (per esempio una partecipazione di test) oppure essere stata eliminata.</p>
        <a href={href('/admin/partecipazioni')}>Torna all’elenco</a>
      </div>
    );
  }
  const def = definitionsOf(ctx.ds)[p.questionnaire_version];
  const groups: { title: string; ids: string[] }[] = [
    { title: 'Domande iniziali', ids: ['Q1', 'Q2'] },
    { title: 'Percorso esperienza', ids: ['Q3', 'Q4', 'Q5', 'Q6', 'Q7', 'Q8', 'Q9', 'O1'] },
    { title: 'Percorso alternativo', ids: ['A0', 'A1', 'A2', 'A3', 'A4', 'O2'] },
    { title: 'Domande finali', ids: ['F1a', 'F1b', 'F2', 'F3', 'F3_other'] },
  ];
  const f1 = p.explorations.find((e) => e.id === p.f1_exploration_id);
  const ev = p.events;
  const timeline: [string, string | undefined | null][] = [
    ['Avvio', ev.started], ['Domande iniziali completate', ev.initial_done], ['Demo iniziata', ev.demo_started],
    ['Demo esplorata', ev.demo_explored], ['Feedback inviato', ev.feedback_submitted], ['Invito email visualizzato', ev.email_shown],
    ['Richiesta email registrata', ev.email_subscribed], ['Rifiuto email', ev.email_declined], ['Ultima attività', p.last_activity_at],
  ];

  const del = async () => {
    const r = await confirm({
      title: `Eliminare la partecipazione ${p.code}?`, danger: true, confirmLabel: 'Elimina definitivamente',
      body: <p>Vengono rimosse risposte, esplorazioni della demo, eventi e collegamento email. L’indirizzo email viene eliminato solo se non è collegato ad altre partecipazioni. Le altre partecipazioni non cambiano.</p>,
    });
    if (!r.ok) return;
    setBusy(true); setErr(null);
    try { await adminApi().deleteParticipation(p.id); ctx.reload(); navigate('/admin/partecipazioni'); } catch (e) { setErr(errorText(e)); } finally { setBusy(false); }
  };

  return (
    <article className="report">
      <div className="report-actions no-print">
        <a href={href('/admin/partecipazioni')} className="back-link">← Partecipazioni</a>
        <div className="report-buttons">
          {readEnv().routerMode !== 'hash' && <Button variant="secondary" onClick={() => window.print()}>Stampa o salva PDF</Button>}
          <Button variant="secondary" onClick={() => download(`${ctx.ds.sample ? 'esempio-' : ''}partecipazione-${p.code}.json`, participationJson(ctx.ds, p), 'application/json')}>Scarica JSON</Button>
          {ctx.role === 'owner' && <Button variant="danger" onClick={() => void del()} busy={busy}>Elimina</Button>}
        </div>
      </div>
      {err && <Alert>{err}</Alert>}
      <header className="report-head">
        <p className="muted small">Report individuale {ctx.ds.sample && '(dati di esempio)'}</p>
        <h1 className="h-screen">{p.code}</h1>
        <dl className="report-meta">
          <div><dt>Stato</dt><dd>{p.status === 'completed' ? 'Completato' : 'Non completato'}</dd></div>
          <div><dt>Percorso</dt><dd>{p.path ? PATH_LABEL[p.path] : 'Non determinato'}</dd></div>
          <div><dt>Fase raggiunta</dt><dd>{p.current_step}</dd></div>
          <div><dt>Tipo</dt><dd>{p.is_test ? 'Test' : 'Ricerca'}</dd></div>
          <div><dt>Versioni</dt><dd>{p.questionnaire_version}, {p.demo_version}, {p.privacy_version}</dd></div>
        </dl>
      </header>

      <section className="panel">
        <h2 className="h-section">Riepilogo dei fatti raccolti</h2>
        <ul className="bullets">{summaryLines(ctx.ds, p).map((l) => <li key={l}>{l}</li>)}</ul>
        <p className="muted small">Riepilogo generato in modo deterministico dalle risposte; nessuna interpretazione.</p>
      </section>

      {groups.map((g) => (
        <section className="panel" key={g.title}>
          <h2 className="h-section">{g.title}</h2>
          <dl className="qa-list">
            {g.ids.map((qid) => {
              const q = def?.questions.find((x) => x.id === qid);
              if (!q) return null;
              return (
                <div key={qid} className="qa">
                  <dt><span className="qid">{qid}</span> {q.title}{qid === 'F1a' || qid === 'F1b' ? <span className="muted small"> (riferita a: {f1 ? `${catLabel(f1.category)}, caso ${f1.case_id}` : '—'})</span> : null}</dt>
                  <dd><AnswerCell p={p} qid={qid} ctx={ctx} /></dd>
                </div>
              );
            })}
          </dl>
        </section>
      ))}

      <section className="panel">
        <h2 className="h-section">Demo</h2>
        {p.explorations.length === 0 ? <p className="muted">Nessun esempio avviato.</p> : (
          <ol className="ex-list">
            {p.explorations.map((e) => (
              <li key={e.id} className="ex-item">
                <p><strong>{catLabel(e.category)}</strong>, caso {e.case_id} ({e.case_version}); esigenza: {NEED_LABEL[e.need_id as NeedId]?.title ?? e.need_id}{e.id === p.f1_exploration_id ? ' — riferimento di F1' : ''}</p>
                <p className="small">Avvio: {dateTimeRome(e.started_at)}; data di riferimento dell’esempio: {e.reference_date}</p>
                <p className="small">Dettagli aperti: {e.details_opened.length ? e.details_opened.map((a) => altLabel(ctx.ds, e.case_id, e.case_version, a)).join(', ') : 'nessuno'}</p>
                <p className="small">Scelta: {e.choice ? altLabel(ctx.ds, e.case_id, e.case_version, e.choice) : 'nessuna scelta registrata'}{e.provider_clicked ? `; passaggio al fornitore aperto (${altLabel(ctx.ds, e.case_id, e.case_version, e.provider_alt)})` : ''}</p>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="panel">
        <h2 className="h-section">Passaggi essenziali (Europe/Rome)</h2>
        <dl className="timeline">{timeline.filter(([, t]) => t).map(([l, t]) => <div key={l}><dt>{l}</dt><dd>{dateTimeRome(t)}</dd></div>)}</dl>
      </section>

      <section className="panel">
        <h2 className="h-section">Email e consenso</h2>
        {p.subscription ? (
          <dl className="report-meta">
            <div><dt>Email</dt><dd>{p.subscription.email}</dd></div>
            <div><dt>Verifica</dt><dd>{p.subscription.verification === 'verified' ? 'Verificata' : 'Non verificata'}</dd></div>
            <div><dt>Stato attuale del contatto</dt><dd>{p.subscription.contact_status === 'active' ? 'Attivo' : 'Revocato'}</dd></div>
            <div><dt>Stato al momento della richiesta</dt><dd>{{ new: 'Nuovo', active: 'Già attivo', revoked: 'Già revocato (non riattivato)' }[p.subscription.contact_status_at_request]}</dd></div>
            <div><dt>Consenso</dt><dd>{dateTimeRome(p.subscription.consented_at)} ({p.subscription.consent_version})</dd></div>
            <div className="full"><dt>Testo del consenso</dt><dd>{p.subscription.consent_text}</dd></div>
          </dl>
        ) : <p className="muted">{p.events.email_subscribed ? 'Richiesta registrata, ma il contatto è stato successivamente eliminato.' : 'Nessuna email collegata.'}</p>}
      </section>
    </article>
  );
}
