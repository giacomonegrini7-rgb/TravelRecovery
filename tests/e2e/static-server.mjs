// Server statico minimale con fallback SPA, per le verifiche end-to-end locali.
// Uso: node tests/e2e/static-server.mjs <cartella> <porta>
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
const [dir = 'dist-preview', port = '4173'] = process.argv.slice(2);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' };
createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  let file = path.join(dir, decodeURIComponent(url.pathname));
  if (!file.startsWith(path.resolve(dir)) && !path.resolve(file).startsWith(path.resolve(dir))) { res.writeHead(403).end(); return; }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] ?? 'application/octet-stream' }).end(body);
  } catch {
    res.writeHead(200, { 'Content-Type': types['.html'] }).end(await readFile(path.join(dir, 'index.html')));
  }
}).listen(Number(port), '127.0.0.1', () => console.log(`http://127.0.0.1:${port}`));
