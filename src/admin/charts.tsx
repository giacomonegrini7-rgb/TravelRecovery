import { useState, type ReactNode } from 'react';
import { fmtPct } from '../lib/stats';

export interface BarRow { key: string; label: string; count: number; pct: number | null; muted?: boolean }

/** Barre orizzontali con etichette complete e vista tabellare equivalente (nessun grafico decorativo). */
export function BarChart({ title, rows, note, denominatorLabel, footer, id }: {
  title: ReactNode; rows: BarRow[]; note?: ReactNode; denominatorLabel?: ReactNode; footer?: ReactNode; id: string;
}) {
  const [table, setTable] = useState(false);
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <figure className="chart" aria-labelledby={`${id}-t`}>
      <figcaption className="chart-head">
        <h3 className="chart-title" id={`${id}-t`}>{title}</h3>
        <button className="chart-toggle" onClick={() => setTable((t) => !t)} aria-pressed={table}>
          {table ? 'Mostra grafico' : 'Mostra tabella'}
        </button>
      </figcaption>
      {denominatorLabel && <p className="chart-den">{denominatorLabel}</p>}
      {table ? (
        <table className="data-table compact">
          <thead><tr><th scope="col">Risposta</th><th scope="col" className="num">Conteggio</th><th scope="col" className="num">%</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}><th scope="row">{r.label}</th><td className="num">{r.count}</td><td className="num">{fmtPct(r.pct)}</td></tr>
            ))}
          </tbody>
        </table>
      ) : (
        <ul className="bars" role="list">
          {rows.map((r) => (
            <li key={r.key} className={`bar-row ${r.muted ? 'is-muted' : ''}`}>
              <span className="bar-label">{r.label}</span>
              <span className="bar-track" aria-hidden="true"><span className="bar-fill" style={{ width: `${(r.count / max) * 100}%` }} /></span>
              <span className="bar-value"><strong>{r.count}</strong>{r.pct !== null && <span className="bar-pct"> {fmtPct(r.pct)}</span>}</span>
            </li>
          ))}
        </ul>
      )}
      {note && <p className="chart-note">{note}</p>}
      {footer}
    </figure>
  );
}
