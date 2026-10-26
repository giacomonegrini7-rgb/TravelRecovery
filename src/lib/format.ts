const TZ = 'Europe/Rome';

export function eur(n: number): string {
  return n.toLocaleString('it-IT', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 });
}

/** Data/ora per l'area amministrativa, sempre in Europe/Rome. */
export function dateTimeRome(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('it-IT', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}

export function dateRome(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('it-IT', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(iso));
}

/** Data lunga per la demo (es. "giovedì 19 novembre"). */
export function longDate(d: Date): string {
  return new Intl.DateTimeFormat('it-IT', { weekday: 'long', day: 'numeric', month: 'long' }).format(d);
}

export function shortDate(d: Date): string {
  return new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short' }).format(d);
}

export function timeOf(d: Date): string {
  return new Intl.DateTimeFormat('it-IT', { hour: '2-digit', minute: '2-digit' }).format(d);
}

/** Data odierna (YYYY-MM-DD) secondo il fuso di Roma: riferimento congelato della demo. */
export function todayRomeISO(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const g = (t: string) => parts.find((p) => p.type === t)?.value;
  return `${g('year')}-${g('month')}-${g('day')}`;
}

/** Converte una data locale (YYYY-MM-DD, Europe/Rome) nell'istante UTC di inizio giornata. */
export function romeDayStartISO(day: string): string {
  // Determina l'offset di Roma per quel giorno (CET/CEST) senza librerie
  const probe = new Date(`${day}T12:00:00Z`);
  const romeNoon = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', hour12: false }).format(probe);
  const offsetH = Number(romeNoon) - 12;
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCHours(d.getUTCHours() - offsetH);
  return d.toISOString();
}

export function addDaysISO(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
