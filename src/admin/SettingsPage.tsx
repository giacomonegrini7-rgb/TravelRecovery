import { useCallback, useEffect, useState } from 'react';
import { adminApi } from '../lib/backend';
import { errorText, type AccessList, type AppConfigRow, type Role } from '../lib/backend/types';
import { dateTimeRome, romeDayStartISO } from '../lib/format';
import { href } from '../lib/router';
import { Alert, Button, Spinner } from '../ui/components';
import { useConfirm } from '../ui/confirm';

const PRIVACY_FIELDS: { key: keyof AppConfigRow; label: string; essential: boolean; long?: boolean }[] = [
  { key: 'privacy_controller', label: 'Titolare del trattamento', essential: true },
  { key: 'privacy_contact', label: 'Contatto per informazioni e richieste', essential: true },
  { key: 'privacy_legal_basis', label: 'Base giuridica', essential: true },
  { key: 'privacy_retention', label: 'Periodo di conservazione', essential: true },
  { key: 'privacy_recipients', label: 'Destinatari e fornitori tecnici', essential: false, long: true },
  { key: 'privacy_extra', label: 'Ulteriori informazioni', essential: false, long: true },
];

export function SettingsPage({ role, onChanged, sample }: { role: Role; onChanged: () => void; sample: boolean }) {
  const api = adminApi();
  const owner = role === 'owner';
  const [cfg, setCfg] = useState<AppConfigRow | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [access, setAccess] = useState<AccessList | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [invite, setInvite] = useState('');
  const [retention, setRetention] = useState('');
  const confirm = useConfirm();

  const load = useCallback(async () => {
    setErr(null);
    try {
      const future = new Date(Date.now() + 86400000 * 365 * 50).toISOString();
      const ds = await api.dataset({ from: future, to: null, includeTest: true, includeResearch: true, version: null });
      setCfg(ds.config);
      setForm(Object.fromEntries(['project_name', ...PRIVACY_FIELDS.map((f) => f.key)].map((k) => [k, (ds.config as unknown as Record<string, string | null>)[k] ?? ''])));
      setAccess(await api.listAccess());
    } catch (e) { setErr(errorText(e)); }
  }, [api]);
  useEffect(() => { void load(); }, [load]);

  const run = async (key: string, fn: () => Promise<string>) => {
    setBusy(key); setErr(null); setOk(null);
    try { setOk(await fn()); await load(); onChanged(); } catch (e) { setErr(errorText(e)); } finally { setBusy(null); }
  };

  if (!cfg) return err ? <Alert action={<Button variant="secondary" onClick={() => void load()}>Riprova</Button>}>{err}</Alert> : <Spinner label="Caricamento delle impostazioni…" />;

  const missing = PRIVACY_FIELDS.filter((f) => f.essential && !cfg[f.key]);
  return (
    <div className="settings">
      <div className="page-head">
        <h1 className="h-screen">Impostazioni</h1>
        {!owner && <p className="muted">Le impostazioni sono modificabili solo dall’owner. Puoi consultarle.</p>}
      </div>
      {ok && <Alert tone="success">{ok}</Alert>}
      {err && <Alert>{err}</Alert>}

      <section className="panel">
        <h2 className="h-section">Modalità di raccolta</h2>
        <div className={`mode-box mode-box-${cfg.mode}`}>
          <p className="mode-now">Modalità attuale: <strong>{cfg.mode === 'research' ? 'Ricerca attiva' : 'Test'}</strong></p>
          <p className="small">{cfg.mode === 'research'
            ? 'Le nuove partecipazioni sono dati reali di ricerca.'
            : 'Le nuove partecipazioni sono marcate come test ed escluse dalle statistiche di ricerca per impostazione predefinita. Usala per verificare il percorso prima della raccolta.'}</p>
        </div>
        <ul className="checklist">
          {PRIVACY_FIELDS.filter((f) => f.essential).map((f) => (
            <li key={f.key} className={cfg[f.key] ? 'done' : 'todo'}>{cfg[f.key] ? '✓' : '○'} {f.label}</li>
          ))}
          <li className={(access?.roles.length ?? 0) > 0 ? 'done' : 'todo'}>{(access?.roles.length ?? 0) > 0 ? '✓' : '○'} Almeno un account con accesso verificato</li>
        </ul>
        {owner && (cfg.mode === 'test' ? (
          <>
            <Button disabled={missing.length > 0} busy={busy === 'mode'} onClick={async () => {
              const r = await confirm({ title: 'Attivare la ricerca?', confirmLabel: 'Attiva la ricerca', body: <p>Da questo momento le nuove partecipazioni saranno dati reali. Verifica di aver provato il percorso completo e di aver compilato l’informativa definitiva.</p> });
              if (r.ok) void run('mode', async () => { await api.setMode('research'); return 'Ricerca attiva abilitata.'; });
            }}>Attiva la ricerca</Button>
            {missing.length > 0 && <p className="small muted">Completa prima i campi essenziali dell’informativa.</p>}
          </>
        ) : (
          <Button variant="secondary" busy={busy === 'mode'} onClick={() => void run('mode', async () => { await api.setMode('test'); return 'Tornato in modalità test.'; })}>Torna alla modalità test</Button>
        ))}
        <p className="small muted">Le partecipazioni già avviate mantengono la modalità in cui sono state create. <a href={href('/')} target="_blank" rel="noopener">Apri il questionario</a> per una prova.</p>
      </section>

      <section className="panel">
        <h2 className="h-section">Progetto e informativa</h2>
        <form className="settings-form" onSubmit={(e) => {
          e.preventDefault();
          void run('cfg', async () => { await api.updateConfig(form); return 'Impostazioni salvate.'; });
        }}>
          <label className="field"><span className="field-label">Nome del progetto</span>
            <input value={form.project_name ?? ''} disabled={!owner} onChange={(e) => setForm({ ...form, project_name: e.target.value })} />
          </label>
          {PRIVACY_FIELDS.map((f) => (
            <label key={f.key} className="field"><span className="field-label">{f.label}{f.essential && <span className="req"> (essenziale)</span>}</span>
              {f.long
                ? <textarea rows={3} value={form[f.key] ?? ''} disabled={!owner} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
                : <input value={form[f.key] ?? ''} disabled={!owner} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />}
            </label>
          ))}
          <p className="small muted">Questi campi vanno compilati dal gruppo con informazioni verificate: l’app non propone valori. Sono mostrati nella pagina <a href={href('/privacy')} target="_blank" rel="noopener">Informativa</a>.</p>
          {owner && <Button type="submit" busy={busy === 'cfg'}>Salva</Button>}
        </form>
      </section>

      <section className="panel">
        <h2 className="h-section">Versioni in uso</h2>
        <dl className="report-meta">
          <div><dt>Questionario</dt><dd>{cfg.questionnaire_version}</dd></div>
          <div><dt>Demo</dt><dd>{cfg.demo_version}</dd></div>
          <div><dt>Informativa</dt><dd>{cfg.privacy_version}</dd></div>
          <div><dt>Consenso</dt><dd>{cfg.consent_version}</dd></div>
          <div><dt>Ultima modifica</dt><dd>{dateTimeRome(cfg.updated_at)}</dd></div>
        </dl>
        <p className="small muted">Le domande sono gestite in configurazioni versionate del progetto (src/config), non da un editor.</p>
      </section>

      <section className="panel">
        <h2 className="h-section">Accessi autorizzati</h2>
        <ul className="access-list">
          {access?.roles.map((r) => (
            <li key={r.user_id}>
              <span>{r.email ?? r.user_id} <span className="role-tag">{r.role}</span></span>
              {owner && r.role !== 'owner' && <Button variant="ghost" busy={busy === r.user_id} onClick={async () => {
                const a = await confirm({ title: `Rimuovere l’accesso di ${r.email ?? 'questo account'}?`, danger: true, confirmLabel: 'Rimuovi accesso', body: <p>L’account non potrà più vedere i dati della ricerca.</p> });
                if (a.ok) void run(r.user_id, async () => { await api.removeAccess({ userId: r.user_id }); return 'Accesso rimosso.'; });
              }}>Rimuovi</Button>}
            </li>
          ))}
          {access?.invites.filter((i) => !i.claimed_at).map((i) => (
            <li key={i.email}>
              <span>{i.email} <span className="role-tag">invito in attesa</span></span>
              {owner && <Button variant="ghost" busy={busy === i.email} onClick={() => void run(i.email, async () => { await api.removeAccess({ email: i.email }); return 'Invito annullato.'; })}>Annulla</Button>}
            </li>
          ))}
        </ul>
        {owner && (
          <form className="inline-form" onSubmit={(e) => {
            e.preventDefault();
            void run('invite', async () => { await api.invite(invite); setInvite(''); return 'Email autorizzata. La persona deve usare «Primo accesso con un invito» nella pagina di login e confermare l’indirizzo.'; });
          }}>
            <label className="field"><span className="field-label">Autorizza un creator (email)</span><input type="email" value={invite} onChange={(e) => setInvite(e.target.value)} required /></label>
            <Button type="submit" busy={busy === 'invite'}>Autorizza</Button>
          </form>
        )}
      </section>

      {owner && (
        <section className="panel">
          <h2 className="h-section">Conservazione e cancellazione</h2>
          <p className="small">Elimina le partecipazioni avviate prima di una data (risposte, esplorazioni, eventi, collegamenti email) e gli indirizzi che restano senza collegamenti. Usala per applicare il periodo di conservazione definito. Per singole richieste usa l’eliminazione dal report o dai contatti.</p>
          <form className="inline-form" onSubmit={async (e) => {
            e.preventDefault();
            if (!retention) return;
            const c = await confirm({ title: 'Applicare il periodo di conservazione?', danger: true, confirmLabel: 'Elimina definitivamente', body: <p>Verranno eliminate tutte le partecipazioni avviate prima del {retention.split('-').reverse().join('/')}, con risposte, eventi e collegamenti email. L’operazione non è reversibile.</p> });
            if (!c.ok) return;
            void run('ret', async () => {
              const r = await api.applyRetention(romeDayStartISO(retention));
              return `Eliminate ${r.participations_deleted} partecipazioni e ${r.orphan_contacts_deleted} indirizzi senza collegamenti.`;
            });
          }}>
            <label className="field"><span className="field-label">Avviate prima del</span><input type="date" value={retention} onChange={(e) => setRetention(e.target.value)} /></label>
            <Button type="submit" variant="danger" busy={busy === 'ret'} disabled={!retention}>Applica</Button>
          </form>
          {sample && <p className="small muted">In anteprima agisce solo sui dati di esempio in memoria.</p>}
        </section>
      )}
    </div>
  );
}
