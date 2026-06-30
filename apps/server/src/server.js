const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');
const crypto = require('crypto');

const root = path.resolve(__dirname, '../../..');
const clientRoot = path.join(root, 'apps/tv-client');
const catalogPath = path.join(root, 'data/catalog.json');
const providerPath = path.join(root, 'data/providers.json');
const providerExamplePath = path.join(root, 'data/providers.example.json');
const usersPath = path.join(root, 'data/users.json');
const historyPath = path.join(root, 'data/history.json');
const port = Number(process.env.PORT || 4173);

const TMDB_BASE = 'api.themoviedb.org';
const TMDB_IMG = 'https://image.tmdb.org/t/p';

// In-memory caches
const tmdbCache = new Map();
const m3uCache = { channels: null, vod: null, lastFetch: 0 };
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function hash(str) { return crypto.createHash('sha256').update(str).digest('hex'); }
function randomToken() { return crypto.randomBytes(32).toString('hex'); }

function readJsonFile(filePath, fallback) {
  try { if (fs.existsSync(filePath)) return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch (e) {}
  return fallback;
}
function writeJsonFile(filePath, data) {
  try { fs.writeFileSync(filePath, JSON.stringify(data, null, 2)); } catch (e) {}
}

function readCatalog() { return readJsonFile(catalogPath, { items: [], featured: [], rows: [] }); }

function readProviders() {
  const selectedPath = fs.existsSync(providerPath) ? providerPath : providerExamplePath;
  const config = readJsonFile(selectedPath, {});
  return sanitizeProviders(config, selectedPath === providerExamplePath);
}

function getProviderConfig() {
  const selectedPath = fs.existsSync(providerPath) ? providerPath : providerExamplePath;
  return readJsonFile(selectedPath, {});
}

function sanitizeProviders(config, usingExample) {
  return {
    usingExample,
    metadata: { tmdbConfigured: Boolean(config.metadata && config.metadata.tmdbApiKey && !String(config.metadata.tmdbApiKey).includes('PUT_')) },
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

// Auth helpers
function readUsers() { return readJsonFile(usersPath, { users: [], sessions: [] }); }
function writeUsers(data) { writeJsonFile(usersPath, data); }
function readHistory() { return readJsonFile(historyPath, { entries: [] }); }
function writeHistory(data) { writeJsonFile(historyPath, data); }

function getSessionUser(req) {
  const auth = String(req.headers['authorization'] || '');
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return null;
  const users = readUsers();
  const session = users.sessions.find((s) => s.token === token && s.expiresAt > Date.now());
  return session ? (users.users.find((u) => u.id === session.userId) || null) : null;
}

function createSession(userId) {
  const users = readUsers();
  const token = randomToken();
  users.sessions.push({ token, userId, createdAt: Date.now(), expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000 });
  writeUsers(users);
  return token;
}

function invalidateSession(token) {
  const users = readUsers();
  users.sessions = users.sessions.filter((s) => s.token !== token);
  writeUsers(users);
}

// TMDb API
function tmdbRequest(path, tmdbApiKey) {
  return new Promise((resolve, reject) => {
    const cacheKey = path;
    const cached = tmdbCache.get(cacheKey);
    if (cached && Date.now() - cached.time < CACHE_TTL) return resolve(cached.data);

    const reqPath = path + (path.includes('?') ? '&' : '?') + 'api_key=' + encodeURIComponent(tmdbApiKey);
    const options = { hostname: TMDB_BASE, path: reqPath, method: 'GET', headers: { 'Accept': 'application/json' } };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try { const json = JSON.parse(data); tmdbCache.set(cacheKey, { data: json, time: Date.now() }); resolve(json); }
        catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('TMDb timeout')); });
    req.end();
  });
}

function tmdbImageUrl(path, size) { return path ? TMDB_IMG + '/' + (size || 'w500') + path : null; }

function normalizeTmdbItem(item, type) {
  const isMovie = type === 'movie' || item.media_type === 'movie' || !!item.title;
  const id = item.id;
  const normalizedId = isMovie ? 'tmdb-movie-' + id : 'tmdb-tv-' + id;
  return {
    id: normalizedId,
    tmdbId: id,
    type: isMovie ? 'movie' : 'show',
    title: item.title || item.name || 'Untitled',
    overview: item.overview || '',
    year: String((item.release_date || item.first_air_date || '').slice(0, 4)),
    genres: (item.genre_ids || []).map((gid) => tmdbGenreName(gid, isMovie ? 'movie' : 'tv')),
    poster: tmdbImageUrl(item.poster_path),
    backdrop: tmdbImageUrl(item.backdrop_path, 'original'),
    rating: item.vote_average ? (item.vote_average / 2).toFixed(1) : '0.0',
    voteCount: item.vote_count || 0,
    runtimeMinutes: item.runtime || null,
    popularity: item.popularity || 0
  };
}

const tmdbGenreCache = { movie: {}, tv: {} };
function tmdbGenreName(id, type) {
  const cache = tmdbGenreCache[type] || {};
  return cache[id] || 'Genre';
}
async function preloadTmdbGenres(tmdbApiKey) {
  try {
    const [movieGenres, tvGenres] = await Promise.all([
      tmdbRequest('/3/genre/movie/list', tmdbApiKey),
      tmdbRequest('/3/genre/tv/list', tmdbApiKey)
    ]);
    (movieGenres.genres || []).forEach((g) => tmdbGenreCache.movie[g.id] = g.name);
    (tvGenres.genres || []).forEach((g) => tmdbGenreCache.tv[g.id] = g.name);
  } catch (e) {}
}

// M3U / Xtream parsing
function fetchM3u(playlistUrl) {
  return new Promise((resolve, reject) => {
    const parsed = url.parse(playlistUrl);
    const client = parsed.protocol === 'https:' ? https : http;
    const options = { hostname: parsed.hostname, path: parsed.path, method: 'GET', headers: { 'Accept': '*/*' }, timeout: 15000 };
    const req = client.request(options, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchM3u(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) return reject(new Error('M3U status ' + res.statusCode));
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('M3U timeout')); });
    req.end();
  });
}

function parseM3u(content) {
  const lines = content.split(/\r?\n/);
  const channels = [];
  const vod = [];
  let current = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('#EXTINF')) {
      current = { name: '', logo: '', group: '', url: '' };
      const nameMatch = line.match(/tvg-name="([^"]*)"/);
      const logoMatch = line.match(/tvg-logo="([^"]*)"/);
      const groupMatch = line.match(/group-title="([^"]*)"/);
      const titleMatch = line.match(/,(.*)$/);
      if (nameMatch) current.name = nameMatch[1];
      if (logoMatch) current.logo = logoMatch[1];
      if (groupMatch) current.group = groupMatch[1];
      if (titleMatch && !current.name) current.name = titleMatch[1].trim();
    } else if (current && line && !line.startsWith('#')) {
      current.url = line;
      if (current.url.includes('movie') || current.group.toLowerCase().includes('vod') || current.group.toLowerCase().includes('movie')) {
        vod.push(current);
      } else if (current.url.includes('series') || current.group.toLowerCase().includes('series')) {
        vod.push(Object.assign({}, current, { type: 'series' }));
      } else {
        channels.push(current);
      }
      current = null;
    }
  }
  return { channels, vod };
}

async function refreshM3uData() {
  const config = getProviderConfig();
  const m3uProviders = (config.providers || []).filter((p) => p.type === 'm3u' && p.enabled && p.playlistUrl);
  const allChannels = [];
  const allVod = [];

  for (const provider of m3uProviders) {
    try {
      const data = await fetchM3u(provider.playlistUrl);
      const parsed = parseM3u(data);
      parsed.channels.forEach((c) => { c.provider = provider.name; c.providerId = provider.id; allChannels.push(c); });
      parsed.vod.forEach((v) => { v.provider = provider.name; v.providerId = provider.id; allVod.push(v); });
    } catch (e) { console.error('M3U fetch failed for', provider.id, e.message); }
  }

  m3uCache.channels = allChannels;
  m3uCache.vod = allVod;
  m3uCache.lastFetch = Date.now();
  return { channels: allChannels, vod: allVod };
}

async function getM3uData() {
  if (m3uCache.channels && Date.now() - m3uCache.lastFetch < CACHE_TTL) return { channels: m3uCache.channels, vod: m3uCache.vod };
  // Return cached or empty immediately; refresh in background
  if (!m3uCache._refreshing) {
    m3uCache._refreshing = true;
    refreshM3uData().then(() => { m3uCache._refreshing = false; }).catch(() => { m3uCache._refreshing = false; });
  }
  return { channels: m3uCache.channels || [], vod: m3uCache.vod || [] };
}

function m3uItemToMedia(item, type) {
  return {
    id: 'm3u-' + hash(item.url),
    type: type === 'live' ? 'live' : 'movie',
    title: item.name || 'Untitled',
    overview: item.group || '',
    year: '',
    genres: item.group ? [item.group] : ['Live TV'],
    poster: item.logo || '',
    backdrop: item.logo || '',
    rating: 'Live',
    provider: item.provider || 'IPTV',
    providerId: item.providerId || '',
    sources: [{ id: 'src-1', provider: item.provider || 'IPTV', url: item.url, quality: 'Auto', format: 'mp4', priority: 1 }]
  };
}

// TMDb detail fetch
async function getTmdbDetail(tmdbId, type, tmdbApiKey) {
  try {
    const path = type === 'movie' ? '/3/movie/' + tmdbId : '/3/tv/' + tmdbId;
    const detail = await tmdbRequest(path + '?append_to_response=credits', tmdbApiKey);
    const isMovie = type === 'movie';
    return {
      id: (isMovie ? 'tmdb-movie-' : 'tmdb-tv-') + tmdbId,
      tmdbId: tmdbId,
      type: isMovie ? 'movie' : 'show',
      title: detail.title || detail.name || 'Untitled',
      overview: detail.overview || '',
      year: String((detail.release_date || detail.first_air_date || '').slice(0, 4)),
      genres: (detail.genres || []).map((g) => g.name),
      poster: tmdbImageUrl(detail.poster_path),
      backdrop: tmdbImageUrl(detail.backdrop_path, 'original'),
      rating: detail.vote_average ? (detail.vote_average / 2).toFixed(1) : '0.0',
      voteCount: detail.vote_count || 0,
      runtimeMinutes: detail.runtime || (detail.episode_run_time ? detail.episode_run_time[0] : null),
      popularity: detail.popularity || 0,
      cast: (detail.credits && detail.credits.cast ? detail.credits.cast.slice(0, 8) : []).map((c) => ({
        name: c.name,
        character: c.character,
        photo: tmdbImageUrl(c.profile_path, 'w185')
      })),
      crew: (detail.credits && detail.credits.crew ? detail.credits.crew.slice(0, 4) : []).map((c) => ({
        name: c.name,
        job: c.job
      }))
    };
  } catch (e) { return null; }
}

// Response helpers
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
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg'
  };
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }); res.end('Not found'); return; }
    res.writeHead(200, {
      'content-type': types[ext] || 'application/octet-stream',
      'cache-control': ext === '.html' ? 'no-store' : 'public, max-age=3600'
    });
    res.end(data);
  });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => body += chunk);
    req.on('end', () => { try { resolve(JSON.parse(body)); } catch (e) { resolve({}); } });
    req.on('error', reject);
  });
}

function mapItem(item) {
  const copy = Object.assign({}, item);
  delete copy.sources;
  return copy;
}

function getQuery(req) { return url.parse(req.url || '/', true).query || {}; }

// Startup logging
const tmdbApiKey = getTmdbKey();
const configPath = fs.existsSync(providerPath) ? providerPath : providerExamplePath;
const config = readJsonFile(configPath, {});

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('  Aether Stream v1.0.0');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('Config file: ' + (configPath === providerPath ? 'data/providers.json' : 'data/providers.example.json (FALLBACK)'));
console.log('TMDb API: ' + (tmdbApiKey ? 'Configured (' + tmdbApiKey.slice(0, 4) + '****...)' : 'NOT configured'));

const enabledProviders = (config.providers || []).filter((p) => p.enabled);
console.log('Providers: ' + enabledProviders.length + ' enabled');
enabledProviders.forEach((p) => {
  const configured = isProviderConfigured(p);
  console.log('  - [' + p.type + '] ' + p.name + (configured ? ' ✓' : ' ✗ (incomplete)'));
});
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

if (tmdbApiKey) {
  preloadTmdbGenres(tmdbApiKey).then(() => console.log('TMDb genres loaded')).catch((e) => console.log('TMDb genre preload failed:', e.message));
  refreshM3uData().then((data) => console.log('M3U loaded:', data.channels.length, 'channels,', data.vod.length, 'VOD')).catch((e) => console.log('M3U preload failed:', e.message));
}

server.listen(port, () => {
  console.log('Server running at http://localhost:' + port);
  console.log('Open your browser and go to the URL above');
});
