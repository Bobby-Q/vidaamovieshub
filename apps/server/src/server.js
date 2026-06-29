const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const root = path.resolve(__dirname, '../../..');
const clientRoot = path.join(root, 'apps/tv-client');
const catalogPath = path.join(root, 'data/catalog.json');
const port = Number(process.env.PORT || 4173);

function readCatalog() {
  return JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'access-control-allow-origin': '*'
  });
  res.end(payload);
}

function sendFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const types = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml; charset=utf-8',
    '.png': 'image/png'
  };
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }
    res.writeHead(200, {
      'content-type': types[ext] || 'application/octet-stream',
      'cache-control': ext === '.html' ? 'no-store' : 'public, max-age=3600'
    });
    res.end(data);
  });
}

function mapItem(item) {
  const copy = Object.assign({}, item);
  delete copy.sources;
  return copy;
}

function handleApi(req, res, pathname) {
  const catalog = readCatalog();
  const itemsById = new Map(catalog.items.map((item) => [item.id, item]));

  if (pathname === '/api/config') {
    return sendJson(res, 200, {
      appName: 'VIDAA MoviesHub',
      version: '0.1.0',
      capabilities: ['remote-navigation', 'html5-video', 'source-fallback'],
      theme: { background: '#050507', accent: '#d9e7ff' }
    });
  }

  if (pathname === '/api/home') {
    return sendJson(res, 200, {
      featured: catalog.featured.map((id) => mapItem(itemsById.get(id))).filter(Boolean),
      rows: catalog.rows.map((row) => ({
        id: row.id,
        title: row.title,
        items: row.itemIds.map((id) => mapItem(itemsById.get(id))).filter(Boolean)
      }))
    });
  }

  const mediaMatch = pathname.match(/^\/api\/media\/([^/]+)$/);
  if (mediaMatch) {
    const item = itemsById.get(decodeURIComponent(mediaMatch[1]));
    return item ? sendJson(res, 200, mapItem(item)) : sendJson(res, 404, { error: 'Media not found' });
  }

  const playbackMatch = pathname.match(/^\/api\/playback\/([^/]+)$/);
  if (playbackMatch) {
    const item = itemsById.get(decodeURIComponent(playbackMatch[1]));
    if (!item) return sendJson(res, 404, { error: 'Media not found' });
    const sources = (item.sources || []).slice().sort((a, b) => a.priority - b.priority);
    return sendJson(res, 200, { mediaId: item.id, title: item.title, sources });
  }

  return sendJson(res, 404, { error: 'API route not found' });
}

const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url || '/');
  const pathname = decodeURIComponent(parsed.pathname || '/');

  if (pathname.startsWith('/api/')) return handleApi(req, res, pathname);

  const relative = pathname === '/' ? '/index.html' : pathname;
  const safePath = path.normalize(relative).replace(/^\.{2,}/, '');
  const filePath = path.join(clientRoot, safePath);
  if (!filePath.startsWith(clientRoot)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  sendFile(res, filePath);
});

server.listen(port, () => {
  console.log(`VIDAA MoviesHub running at http://localhost:${port}`);
});
