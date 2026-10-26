// Build alternativa con esbuild (senza Vite): produce un'anteprima a file singolo.
// Uso: node scripts/build-esbuild.mjs [--out dir] [--hash] [--env-url URL --env-key KEY]
// Variabili utili: EXTRA_NODE_PATH (cartella node_modules aggiuntiva).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const out = opt('--out', 'dist-preview');
const hash = args.includes('--hash');
const extra = process.env.EXTRA_NODE_PATH ? [process.env.EXTRA_NODE_PATH] : [];

const require = createRequire(import.meta.url);
let esbuild;
try { esbuild = require('esbuild'); } catch { esbuild = require(path.join(extra[0] ?? '', 'esbuild')); }

const env = {
  VITE_SUPABASE_URL: opt('--env-url', process.env.VITE_SUPABASE_URL ?? ''),
  VITE_SUPABASE_ANON_KEY: opt('--env-key', process.env.VITE_SUPABASE_ANON_KEY ?? ''),
  VITE_ROUTER_MODE: hash ? 'hash' : (process.env.VITE_ROUTER_MODE ?? 'history'),
};

const result = await esbuild.build({
  entryPoints: ['src/main.tsx'],
  bundle: true,
  minify: true,
  format: 'esm',
  target: 'es2020',
  jsx: 'automatic',
  write: false,
  outdir: out,
  nodePaths: extra,
  define: {
    'import.meta.env': JSON.stringify(env),
    'process.env.NODE_ENV': '"production"',
  },
  loader: { '.svg': 'text' },
  logLevel: 'warning',
});

const js = result.outputFiles.find((f) => f.path.endsWith('.js')).text;
const css = result.outputFiles.find((f) => f.path.endsWith('.css'))?.text ?? '';
const favicon = readFileSync('public/favicon.svg', 'utf8');
let html = readFileSync('index.html', 'utf8')
  .replace('<link rel="icon" href="/favicon.svg" type="image/svg+xml" />', `<link rel="icon" href="data:image/svg+xml,${encodeURIComponent(favicon)}" />`)
  .replace('<script type="module" src="/src/main.tsx"></script>', () => `<script type="module">${js.replace(/<\/script/gi, '<\\/script')}</script>`)
  .replace('</head>', () => `<style>${css}</style>\n  </head>`);
if (args.includes('--fragment')) {
  // Variante senza skeleton del documento (per anteprime ospitate che aggiungono doctype/head/body)
  const keep = html.match(/<title>[\s\S]*?<\/title>/)[0];
  const fonts = (html.match(/<link rel="preconnect"[^>]*>|<link href="https:\/\/fonts[^>]*>/g) ?? []).join('\n');
  html = `${keep}\n<meta name="robots" content="noindex" />\n${fonts}\n<style>${css}</style>\n<div id="root"></div>\n<script type="module">${js.replace(/<\/script/gi, '<\\/script')}</script>\n`;
}
mkdirSync(out, { recursive: true });
writeFileSync(path.join(out, 'index.html'), html);
console.log(`Anteprima scritta in ${out}/index.html (${(html.length / 1024).toFixed(0)} KB, router: ${env.VITE_ROUTER_MODE}, backend: ${env.VITE_SUPABASE_URL ? 'collegato' : 'locale'})`);
