import { useCallback, useEffect, useMemo, useState } from 'react';
import { adminApi } from '../lib/backend';
import { errorText, type ContactRow, type Role } from '../lib/backend/types';
import { dateTimeRome } from '../lib/format';
import { contactsCsv, download, stamp } from '../lib/exports';
import { href } from '../lib/router';
import { Alert, Button, Spinner } from '../ui/components';
import { useConfirm } from '../ui/confirm';

export function ContactsPage({ role, sample }: { role: Role; sample: boolean }) {
  const api = adminApi();
  const [rows, setRows] = useState<ContactRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<'all' | 'active' | 'revoked'>('all');
  const [includeTest, setIncludeTest] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const confirm = useConfirm();

  const load = useCallback(() => {
    setErr(null);
    api.contacts().then(setRows).catch((e) => setErr(errorText(e)));
  }, [api]);
  useEffect(load, [load]);

  const list = useMemo(() => (rows ?? [])
    .map((c) => ({ ...c, requests: includeTest ? c.requests : c.requests.filter((r) => !r.is_test) }))
    .filter((c) => c.requests.length > 0)
    .filter((c) => (status === 'all' || c.status === status) && (!q || c.email.includes(q.trim().toLowerCase()))), [rows, q, status, includeTest]);

  const act = async (c: ContactRow, kind: 'revoke' | 'delete') => {
    if (kind === 'revoke') {
      const r = await confirm({
        title: `Registrare la revoca per ${c.email}?`,
        body: <p>Il contatto resta nell’archivio come «Revocato» ed è escluso dall’esportazione dei destinatari attivi. Le risposte delle partecipazioni non vengono cancellate.</p>,
        confirmLabel: 'Registra revoca', noteLabel: 'Nota facoltativa (es. canale della richiesta)',
      });
      if (!r.ok) return;
      const note = r.note;
      setBusyId(c.id);
      try { await api.revokeContact(c.id, note); setNotice(`Revoca registrata per ${c.email}.`); load(); } catch (e) { setErr(errorText(e)); } finally { setBusyId(null); }
    } else {
      const r = await confirm({
        title: `Eliminare l’indirizzo ${c.email}?`, danger: true, confirmLabel: 'Elimina email',
        body: <p>Vengono rimossi definitivamente l’email e i collegamenti con {c.requests.length === 1 ? '1 partecipazione' : `${c.requests.length} partecipazioni`}. Le risposte del questionario restano, senza email. Per cancellare anche le risposte, elimina le singole partecipazioni dal loro report.</p>,
      });
      if (!r.ok) return;
      setBusyId(c.id);
      try { await api.deleteContact(c.id); setNotice(`Indirizzo eliminato.`); load(); } catch (e) { setErr(errorText(e)); } finally { setBusyId(null); }
    }
  };

  const prefix = sample ? 'esempio-' : '';
  return (
    <div>
      <div className="page-head">
        <h1 className="h-screen">Contatti</h1>
        <p className="muted">Un contatto per indirizzo normalizzato, con i collegamenti alle partecipazioni. Gli indirizzi non sono verificati: non dimostrano l’identità di chi li ha inseriti.</p>
      </div>
      <section className="export-bar" aria-label="Esportazioni contatti">
        <span className="export-title">Esporta contatti unici</span>
        <div className="export-actions">
          <Button variant="secondary" disabled={!rows} onClick={() => download(`${prefix}contatti-attivi-${stamp()}.csv`, contactsCsv(list.filter((c) => c.status === 'active')), 'text/csv;charset=utf-8')}>CSV destinatari attivi</Button>
          <Button variant="secondary" disabled={!rows} onClick={() => download(`${prefix}contatti-filtrati-${stamp()}.csv`, contactsCsv(list), 'text/csv;charset=utf-8')}>CSV contatti filtrati</Button>
        </div>
      </section>
      <div className="list-tools">
        <label>Cerca email<input type="search" value={q} onChange={(e) => setQ(e.target.value)} /></label>
        <label>Stato
          <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
            <option value="all">Tutti</option><option value="active">Attivi</option><option value="revoked">Revocati</option>
          </select>
        </label>
        <label className="inline-check"><input type="checkbox" checked={includeTest} onChange={(e) => setIncludeTest(e.target.checked)} /> includi richieste da partecipazioni di test</label>
      </div>
      {notice && <Alert tone="success">{notice}</Alert>}
      {err && <Alert action={<Button variant="secondary" onClick={load}>Riprova</Button>}>{err}</Alert>}
      {!rows && !err && <Spinner label="Caricamento dei contatti…" />}
      {rows && list.length === 0 && <div className="empty"><p>{rows.length === 0 ? 'Ancora nessuna richiesta di iscrizione.' : 'Nessun contatto corrisponde ai filtri.'}</p></div>}
      {list.length > 0 && (
        <ul className="contact-list" role="list">
          {list.map((c) => (
            <li key={c.id} className="contact">
              <div className="contact-main">
                <p className="contact-email">{c.email}</p>
                <p className="small">
                  <span className={`tag ${c.status === 'active' ? 'tag-ok' : 'tag-no'}`}>{c.status === 'active' ? 'Attivo' : 'Revocato'}</span>{' '}
                  <span className="tag">{c.verification === 'verified' ? 'Verificata' : 'Non verificata'}</span>
                </p>
                <p className="small muted">Prima richiesta: {dateTimeRome(c.requests[0]?.consented_at)}{c.revoked_at ? `; revoca registrata: ${dateTimeRome(c.revoked_at)}` : ''}</p>
                {c.revoke_note && <p className="small muted">Nota: {c.revoke_note}</p>}
                <p className="small">Partecipazioni: {c.requests.map((r, i) => (
                  <span key={r.participation_id}>{i > 0 && ', '}<a href={href(`/admin/partecipazioni/${encodeURIComponent(r.participation_id)}`)}>{r.code}</a>{r.is_test ? ' (test)' : ''}{r.contact_status_at_request === 'revoked' ? ' (inviata dopo la revoca)' : ''}</span>
                ))}</p>
              </div>
              <div className="contact-actions">
                {c.status === 'active' && <Button variant="secondary" busy={busyId === c.id} onClick={() => void act(c, 'revoke')}>Registra revoca</Button>}
                {role === 'owner' && <Button variant="danger" busy={busyId === c.id} onClick={() => void act(c, 'delete')}>Elimina email</Button>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
