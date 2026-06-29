const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const root = path.resolve(__dirname, '../../..');
const clientRoot = path.join(root, 'apps/tv-client');
const catalogPath = path.join(root, 'data/catalog.json');
const providerPath = path.join(root, 'data/providers.json');
const providerExamplePath = path.join(root, 'data/providers.example.json');
const port = Number(process.env.PORT || 4173);

function readCatalog() {
  return JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
}

function readProviders() {
  const selectedPath = fs.existsSync(providerPath) ? providerPath : providerExamplePath;
  const config = JSON.parse(fs.readFileSync(selectedPath, 'utf8'));
  applyProviderEnvironment(config);
  return sanitizeProviders(config, selectedPath === providerExamplePath);
}

function applyProviderEnvironment(config) {
  config.metadata = config.metadata || {};
  if (process.env.TMDB_API_KEY) config.metadata.tmdbApiKey = process.env.TMDB_API_KEY;
  if (process.env.TMDB_READ_ACCESS_TOKEN) config.metadata.tmdbReadAccessToken = process.env.TMDB_READ_ACCESS_TOKEN;
}

function sanitizeProviders(config, usingExample) {
  return {
    usingExample,
    metadata: {
      tmdbConfigured: Boolean(config.metadata && ((config.metadata.tmdbApiKey && !String(config.metadata.tmdbApiKey).includes('PUT_')) || config.metadata.tmdbReadAccessToken)),
      tmdbReadTokenConfigured: Boolean(config.metadata && config.metadata.tmdbReadAccessToken)
    },
    providers: (config.providers || []).map((provider) => ({
      id: provider.id,
      type: provider.type,
      enabled: Boolean(provider.enabled),
      name: provider.name,
      priority: provider.priority,
      configured: isProviderConfigured(provider)
    }))
  };
}

function isProviderConfigured(provider) {
  if (provider.type === 'xtream') return Boolean(provider.serverUrl && provider.username && provider.password && !String(provider.username).includes('PUT_'));
  if (provider.type === 'm3u') return Boolean(provider.playlistUrl && !String(provider.playlistUrl).includes('example.com'));
  if (provider.type === 'local-json') return Boolean(provider.catalogPath);
  return false;
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
      'cache-control': ext === '.html' || ext === '.css' || ext === '.js' ? 'no-store, no-cache, must-revalidate' : 'public, max-age=3600'
    });
    res.end(data);
  });
}

function mapItem(item) {
  const copy = Object.assign({}, item);
  delete copy.sources;
  return copy;
}

function getQuery(req) {
  return url.parse(req.url || '/', true).query || {};
}

function handleApi(req, res, pathname) {
  const catalog = readCatalog();
  const itemsById = new Map(catalog.items.map((item) => [item.id, item]));

  if (pathname === '/api/config') {
    return sendJson(res, 200, {
      appName: 'VIDAA MoviesHub',
      version: '0.1.0',
      capabilities: ['remote-navigation', 'html5-video', 'source-fallback'],
      theme: { background: '#0B0B0B', card: '#181818', accent: '#0A84FF' }
    });
  }

  if (pathname === '/api/providers') {
    return sendJson(res, 200, readProviders());
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

  if (pathname === '/api/search') {
    const query = String(getQuery(req).q || '').trim().toLowerCase();
    const results = catalog.items
      .filter((item) => !query || [item.title, item.type, item.year, ...(item.genres || [])].join(' ').toLowerCase().includes(query))
      .map(mapItem);
    return sendJson(res, 200, { query, results });
  }

  if (pathname === '/api/live/categories') {
    const categories = Array.from(new Set(catalog.items
      .filter((item) => item.type === 'live')
      .flatMap((item) => item.genres || ['Live TV'])));
    return sendJson(res, 200, { categories });
  }

  if (pathname === '/api/live/channels') {
    const category = String(getQuery(req).category || '').trim().toLowerCase();
    const channels = catalog.items
      .filter((item) => item.type === 'live')
      .filter((item) => !category || (item.genres || []).join(' ').toLowerCase().includes(category))
      .map(mapItem);
    return sendJson(res, 200, { category, channels });
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
