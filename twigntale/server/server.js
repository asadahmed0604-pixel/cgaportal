'use strict';
/* Twig n Tale — HTTP server. Static files + JSON API + SPA fallback. */

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { sendJson } = require('./util');
const { context, purgeExpiredSessions } = require('./auth');
const { handleApi } = require('./api');

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
};

function serveFile(res, filePath, { spa = false } = {}) {
  let stat;
  try { stat = fs.statSync(filePath); } catch { return false; }
  if (!stat.isFile()) return false;
  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, {
    'Content-Type': TYPES[ext] || 'application/octet-stream',
    'Content-Length': stat.size,
    'Cache-Control': spa || ext === '.html' ? 'no-cache' : 'public, max-age=3600',
    'X-Content-Type-Options': 'nosniff',
  });
  fs.createReadStream(filePath).pipe(res);
  return true;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = decodeURIComponent(url.pathname);
  const query = Object.fromEntries(url.searchParams);

  try {
    const ctx = context(req, res);

    if (pathname.startsWith('/api/')) {
      const handled = await handleApi(req, res, pathname, query, ctx);
      if (!handled) sendJson(res, 404, { error: 'Yeh endpoint maujood nahi' });
      return;
    }

    /* static — directory traversal se bachao */
    const safe = path.normalize(pathname).replace(/^(\.\.[/\\])+/, '');
    const filePath = path.join(PUBLIC_DIR, safe);
    if (filePath.startsWith(PUBLIC_DIR) && pathname !== '/' && serveFile(res, filePath)) return;

    /* baaki sab SPA ko — client-side router khud sambhalta hai */
    if (serveFile(res, path.join(PUBLIC_DIR, 'index.html'), { spa: true })) return;
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error('[error]', req.method, pathname, err);
    if (!res.writableEnded) sendJson(res, status, { error: err.message || 'Kuch ghalat ho gaya' });
  }
});

server.listen(PORT, () => {
  console.log(`Twig n Tale — http://localhost:${PORT}`);
});

purgeExpiredSessions();
setInterval(purgeExpiredSessions, 6 * 60 * 60 * 1000).unref();
