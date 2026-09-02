// A tiny stand-in for Vercel so the site and the back office can be driven
// end to end locally: static files from the repo root, everything under /api
// routed to the matching handler.
//
//   DATABASE_URL=... node test/serve.mjs 3000

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PORT = Number(process.argv[2] || 3000);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.xml': 'application/xml',
  '.txt': 'text/plain; charset=utf-8',
};

function shim(res) {
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(b));
    return res;
  };
  const send = res.end.bind(res);
  res.send = (b) => { send(b); return res; };
  return res;
}

async function readJson(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return {}; }
}

/** /api/calendar/abc.ics -> api/calendar/[token].js with query.token = 'abc.ics' */
function resolveApi(pathname) {
  const rel = pathname.replace(/^\/api\//, '');
  const direct = path.join(ROOT, 'api', rel + '.js');
  if (fs.existsSync(direct)) return { file: direct, params: {} };

  const parts = rel.split('/');
  const last = parts.pop();
  const dir = path.join(ROOT, 'api', ...parts);
  if (fs.existsSync(dir)) {
    const dyn = fs.readdirSync(dir).find(f => /^\[.+\]\.js$/.test(f));
    if (dyn) {
      const name = dyn.slice(1, -4).replace(/\]$/, '');
      return { file: path.join(dir, dyn), params: { [name]: last } };
    }
  }
  return null;
}

const server = http.createServer(async (req, res) => {
  shim(res);
  const url = new URL(req.url, 'http://localhost');

  if (url.pathname.startsWith('/api/')) {
    const hit = resolveApi(url.pathname);
    if (!hit) { res.statusCode = 404; return res.end('no such endpoint'); }
    req.query = Object.assign(Object.fromEntries(url.searchParams), hit.params);
    req.body = ['POST', 'PUT', 'PATCH'].includes(req.method) ? await readJson(req) : {};
    try {
      const mod = await import(pathToFileURL(hit.file).href + '?v=' + Date.now());
      await mod.default(req, res);
    } catch (err) {
      console.error(url.pathname, err);
      if (!res.headersSent) { res.statusCode = 500; res.end(String(err.message)); }
    }
    return;
  }

  let file = url.pathname === '/' ? '/index.html' : url.pathname;
  if (file === '/admin') file = '/admin.html';
  const full = path.join(ROOT, file);
  if (!full.startsWith(ROOT) || !fs.existsSync(full) || fs.statSync(full).isDirectory()) {
    res.statusCode = 404; return res.end('not found');
  }
  res.setHeader('Content-Type', TYPES[path.extname(full)] || 'application/octet-stream');
  fs.createReadStream(full).pipe(res);
});

server.listen(PORT, () => console.log('serving ' + ROOT + ' on http://localhost:' + PORT));
