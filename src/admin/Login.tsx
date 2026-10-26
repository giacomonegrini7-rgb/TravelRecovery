import { useState } from 'react';
import { isConnected } from '../lib/backend';
import { BackendError, errorText, type AdminApi } from '../lib/backend/types';
import { Alert, Button } from '../ui/components';

export function LoginScreen({ api, onSignedIn }: { api: AdminApi; onSignedIn: () => void }) {
  const [mode, setMode] = useState<'login' | 'recover' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'error' | 'success' | 'info'; text: string } | null>(null);

  if (!isConnected) {
    return (
      <div className="admin-center admin-card">
        <h1 className="h-screen">Area creator</h1>
        <p>Il backend non è configurato, quindi l’accesso con credenziali non è attivo. Puoi esplorare il design della dashboard con <strong>dati di esempio</strong> generati localmente, separati da qualsiasi ricerca.</p>
        <Button onClick={() => { void api.signIn('', '').then(onSignedIn); }}>Apri l’anteprima con dati di esempio</Button>
      </div>
    );
  }

  const submit = async () => {
    setBusy(true); setMsg(null);
    try {
      if (mode === 'login') {
        await api.signIn(email, password);
        onSignedIn();
      } else if (mode === 'recover') {
        await api.recover(email);
        setMsg({ tone: 'success', text: 'Se l’indirizzo corrisponde a un account, riceverai un’email con il link per impostare una nuova password.' });
      } else {
        if (password.length < 10) throw new BackendError('weak', 'Usa una password di almeno 10 caratteri.');
        const r = await api.signUp(email, password);
        if (r === 'signed_in') onSignedIn();
        else setMsg({ tone: 'success', text: 'Controlla la tua casella: conferma l’indirizzo dal link ricevuto, poi accedi. Il ruolo creator è attivo solo se l’owner ha autorizzato questa email.' });
      }
    } catch (e) {
      setMsg({ tone: 'error', text: errorText(e) });
    } finally { setBusy(false); }
  };

  const title = mode === 'login' ? 'Accedi all’area creator' : mode === 'recover' ? 'Recupera l’accesso' : 'Primo accesso';
  return (
    <div className="admin-center admin-card">
      <h1 className="h-screen">{title}</h1>
      {mode === 'signup' && <p className="small muted">Crea la password per un indirizzo autorizzato dall’owner. La registrazione da sola non dà accesso ai dati.</p>}
      <form className="stack" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <div className="field">
          <label className="field-label" htmlFor="adm-email">Email</label>
          <input id="adm-email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        {mode !== 'recover' && (
          <div className="field">
            <label className="field-label" htmlFor="adm-pw">Password</label>
            <input id="adm-pw" type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} required value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
        )}
        {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
        <Button type="submit" busy={busy}>{mode === 'login' ? 'Accedi' : mode === 'recover' ? 'Invia il link' : 'Crea la password'}</Button>
      </form>
      <div className="login-links">
        {mode !== 'login' && <button className="link-quiet" onClick={() => { setMode('login'); setMsg(null); }}>Torna all’accesso</button>}
        {mode !== 'recover' && <button className="link-quiet" onClick={() => { setMode('recover'); setMsg(null); }}>Password dimenticata?</button>}
        {mode !== 'signup' && <button className="link-quiet" onClick={() => { setMode('signup'); setMsg(null); }}>Primo accesso con un invito</button>}
      </div>
    </div>
  );
}

export function SetPasswordScreen({ api, onDone }: { api: AdminApi; onDone: () => void }) {
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="admin-center admin-card">
      <h1 className="h-screen">Imposta una nuova password</h1>
      <form className="stack" onSubmit={async (e) => {
        e.preventDefault();
        if (pw.length < 10) { setErr('Usa una password di almeno 10 caratteri.'); return; }
        setBusy(true); setErr(null);
        try { await api.updatePassword(pw); onDone(); } catch (x) { setErr(errorText(x)); } finally { setBusy(false); }
      }}>
        <div className="field">
          <label className="field-label" htmlFor="new-pw">Nuova password</label>
          <input id="new-pw" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
        </div>
        {err && <Alert>{err}</Alert>}
        <Button type="submit" busy={busy}>Salva la password</Button>
      </form>
    </div>
  );
}
