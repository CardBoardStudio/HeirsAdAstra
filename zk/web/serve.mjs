// Static server for the worktree with cross-origin isolation, so bb.js can
// use threads. Local development only.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
const root = new URL('../../', import.meta.url).pathname;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.gz': 'application/gzip', '.svg': 'image/svg+xml' };
const isolate = process.env.ISOLATE !== '0';
createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
  let file = join(root, path);
  try { if ((await stat(file)).isDirectory()) file = join(file, 'index.html'); const body = await readFile(file);
    res.writeHead(200, { 'content-type': types[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store', ...(isolate ? { 'cross-origin-opener-policy': 'same-origin', 'cross-origin-embedder-policy': 'credentialless' } : {}) });
    res.end(body);
  } catch { res.writeHead(404); res.end('not found'); }
}).listen(Number(process.env.PORT || 8137), '127.0.0.1', () => console.log(`serving ${root} on http://127.0.0.1:${process.env.PORT || 8137} isolate=${isolate}`));
