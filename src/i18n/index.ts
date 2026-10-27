// Lingua dell'interfaccia pubblica (italiano / inglese).
// La dashboard dei creator resta in italiano.
import { useSyncExternalStore } from 'react';
import { UI, type UiKey } from './ui';

export type Lang = 'it' | 'en';
export const LANGS: { id: Lang; label: string }[] = [
  { id: 'it', label: 'Italiano' },
  { id: 'en', label: 'English' },
];

const LS_KEY = 'tr.lang';
const listeners = new Set<() => void>();

/** Italiano se il browser è in italiano; inglese per tutte le altre lingue. Una scelta salvata ha la precedenza. */
export function detectLang(): Lang {
  try {
    const saved = localStorage.getItem(LS_KEY);
    if (saved === 'it' || saved === 'en') return saved;
  } catch { /* storage non disponibile */ }
  const prefs = typeof navigator !== 'undefined' ? (navigator.languages?.length ? navigator.languages : [navigator.language]) : [];
  for (const l of prefs) {
    const p = (l || '').toLowerCase();
    if (p.startsWith('it')) return 'it';
    if (p.startsWith('en')) return 'en';
  }
  return prefs.length ? 'en' : 'it';
}

let current: Lang = typeof window === 'undefined' ? 'it' : detectLang();
if (typeof document !== 'undefined') document.documentElement.lang = current;

export function getLang(): Lang { return current; }

export function setLang(l: Lang, opts: { persist?: boolean } = {}) {
  if (l === current) return;
  current = l;
  if (typeof document !== 'undefined') document.documentElement.lang = l;
  if (opts.persist !== false) {
    try { localStorage.setItem(LS_KEY, l); } catch { /* ignorato */ }
  }
  listeners.forEach((f) => f());
}

export function useLang(): Lang {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    () => current,
    () => current,
  );
}

/** Testo dell'interfaccia nella lingua corrente, con segnaposto {nome}. */
export function t(key: UiKey, vars?: Record<string, string | number>): string {
  let s: string = UI[current][key] ?? UI.it[key];
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  return s;
}

/** Locale per date e importi. */
export function locale(): string {
  return current === 'en' ? 'en-GB' : 'it-IT';
}
