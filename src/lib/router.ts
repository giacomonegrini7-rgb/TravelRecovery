import { useEffect, useState } from 'react';
import { readEnv } from '../config/project';

// Router minimale: history API sul sito pubblicato (con fallback SPA),
// hash solo per l'anteprima a file singolo.
const mode = readEnv().routerMode;

export function currentPath(): string {
  if (mode === 'hash') {
    const h = location.hash.replace(/^#/, '');
    return h.startsWith('/') ? h.split('?')[0] : '/';
  }
  return location.pathname.replace(/\/+$/, '') || '/';
}

export function href(path: string): string {
  return mode === 'hash' ? `#${path}` : path;
}

export function navigate(path: string, replace = false) {
  if (mode === 'hash') {
    if (replace) history.replaceState(null, '', `#${path}`);
    else location.hash = path;
  } else if (replace) history.replaceState(null, '', path);
  else history.pushState(null, '', path);
  window.dispatchEvent(new Event('tr:navigate'));
}

/** Navigazione interna senza ricaricare la pagina per i link <a href="/…"> (modalità history). */
export function installLinkInterceptor() {
  if (mode === 'hash') return;
  document.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = (e.target as Element | null)?.closest?.('a');
    if (!a || a.target || a.hasAttribute('download')) return;
    const url = new URL(a.href, location.href);
    if (url.origin !== location.origin || url.hash && url.pathname === location.pathname) return;
    e.preventDefault();
    navigate(url.pathname + url.search);
    window.scrollTo({ top: 0 });
  });
}

export function usePath(): string {
  const [p, setP] = useState(currentPath());
  useEffect(() => {
    const on = () => setP(currentPath());
    window.addEventListener('popstate', on);
    window.addEventListener('hashchange', on);
    window.addEventListener('tr:navigate', on);
    return () => {
      window.removeEventListener('popstate', on);
      window.removeEventListener('hashchange', on);
      window.removeEventListener('tr:navigate', on);
    };
  }, []);
  return p;
}
