import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Button } from './components';

// Conferme progettate nella pagina (al posto di window.confirm/prompt), con nota facoltativa.
interface Ask { title: string; body: ReactNode; confirmLabel: string; danger?: boolean; noteLabel?: string }
type Answer = { ok: boolean; note: string };
const Ctx = createContext<(a: Ask) => Promise<Answer>>(async () => ({ ok: false, note: '' }));

export function useConfirm() { return useContext(Ctx); }

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [ask, setAsk] = useState<Ask | null>(null);
  const [note, setNote] = useState('');
  const resolver = useRef<((a: Answer) => void) | null>(null);
  const ref = useRef<HTMLDialogElement>(null);

  const open = useCallback((a: Ask) => new Promise<Answer>((res) => {
    resolver.current = res;
    setNote('');
    setAsk(a);
  }), []);

  useEffect(() => {
    const d = ref.current;
    if (ask && d && !d.open) { if (typeof d.showModal === 'function') d.showModal(); else d.setAttribute('open', ''); }
  }, [ask]);

  const finish = (ok: boolean) => {
    resolver.current?.({ ok, note });
    resolver.current = null;
    ref.current?.close();
    setAsk(null);
  };

  return (
    <Ctx.Provider value={open}>
      {children}
      {ask && (
        <dialog ref={ref} className="dialog" aria-labelledby="confirm-title" onCancel={(e) => { e.preventDefault(); finish(false); }}>
          <form className="dialog-body" onSubmit={(e) => { e.preventDefault(); finish(true); }}>
            <h2 id="confirm-title" className="h-block">{ask.title}</h2>
            <div className="confirm-body">{ask.body}</div>
            {ask.noteLabel && (
              <label className="field"><span className="field-label">{ask.noteLabel}</span>
                <input id="confirm-note" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
              </label>
            )}
            <div className="dialog-actions confirm-actions">
              <Button type="button" variant="ghost" onClick={() => finish(false)}>Annulla</Button>
              <Button type="submit" variant={ask.danger ? 'danger' : 'primary'}>{ask.confirmLabel}</Button>
            </div>
          </form>
        </dialog>
      )}
    </Ctx.Provider>
  );
}
