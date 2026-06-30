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
    const options = { hostname: parsed.hostname, path: parsed.path, method: 'GET', headers: { 'Accept': '*/*' }, timeout: 5000 };
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

// Preload TMDb genres on startup
let tmdbKey = null;
function getTmdbKey() {
  if (tmdbKey) return tmdbKey;
  const config = getProviderConfig();
  tmdbKey = config.metadata && config.metadata.tmdbApiKey ? config.metadata.tmdbApiKey : null;
  return tmdbKey;
}

async function handleApi(req, res, pathname) {
  const catalog = readCatalog();
  const itemsById = new Map(catalog.items.map((item) => [item.id, item]));
  const tmdbApiKey = getTmdbKey();

  // Auth endpoints
  if (req.method === 'POST' && pathname === '/api/auth/register') {
    const body = await readBody(req);
    const username = String(body.username || '').trim().toLowerCase();
    const password = String(body.password || '');
    if (!username || !password || username.length < 3 || password.length < 4) return sendJson(res, 400, { error: 'Invalid credentials' });
    const users = readUsers();
    if (users.users.find((u) => u.username === username)) return sendJson(res, 409, { error: 'Username taken' });
    const user = { id: randomToken(), username, passwordHash: hash(password), createdAt: Date.now() };
    users.users.push(user);
    writeUsers(users);
    const token = createSession(user.id);
    return sendJson(res, 201, { token, user: { id: user.id, username: user.username } });
  }

  if (req.method === 'POST' && pathname === '/api/auth/login') {
    const body = await readBody(req);
    const username = String(body.username || '').trim().toLowerCase();
    const password = String(body.password || '');
    const users = readUsers();
    const user = users.users.find((u) => u.username === username && u.passwordHash === hash(password));
    if (!user) return sendJson(res, 401, { error: 'Invalid credentials' });
    const token = createSession(user.id);
    return sendJson(res, 200, { token, user: { id: user.id, username: user.username } });
  }

  if (req.method === 'POST' && pathname === '/api/auth/logout') {
    const auth = String(req.headers['authorization'] || '');
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (token) invalidateSession(token);
    return sendJson(res, 200, { ok: true });
  }

  if (pathname === '/api/auth/me') {
    const user = getSessionUser(req);
    return sendJson(res, 200, user ? { id: user.id, username: user.username } : null);
  }

  // History
  if (pathname === '/api/history') {
    const user = getSessionUser(req);
    const history = readHistory();
    const entries = history.entries.slice().reverse().slice(0, 50);
    return sendJson(res, 200, { entries });
  }

  if (req.method === 'POST' && pathname === '/api/history') {
    const user = getSessionUser(req);
    const body = await readBody(req);
    const entry = { id: body.id, title: body.title, type: body.type, poster: body.poster, positionSeconds: body.positionSeconds || 0, durationSeconds: body.durationSeconds || 0, watchedAt: Date.now() };
    const history = readHistory();
    history.entries = history.entries.filter((e) => e.id !== entry.id);
    history.entries.push(entry);
    writeHistory(history);
    return sendJson(res, 200, { ok: true });
  }

  if (req.method === 'DELETE' && pathname === '/api/history') {
    const user = getSessionUser(req);
    writeJsonFile(historyPath, { entries: [] });
    return sendJson(res, 200, { ok: true });
  }

  // Config
  if (pathname === '/api/config') {
    return sendJson(res, 200, {
      appName: 'Aether Stream',
      version: '1.0.0',
      capabilities: ['remote-navigation', 'html5-video', 'source-fallback', 'tmdb', 'm3u', 'xtream', 'auth'],
      theme: { background: '#0a0a0a', accent: '#3b82f6' },
      tmdbEnabled: !!tmdbApiKey
    });
  }

  // Providers
  if (pathname === '/api/providers') {
    return sendJson(res, 200, readProviders());
  }

  // Discover / Home
  if (pathname === '/api/home' || pathname === '/api/discover') {
    const rows = [];
    const featured = [];

    if (tmdbApiKey) {
      try {
        const [trending, popularMovies, popularTv] = await Promise.all([
          tmdbRequest('/3/trending/all/week', tmdbApiKey),
          tmdbRequest('/3/movie/popular', tmdbApiKey),
          tmdbRequest('/3/tv/popular', tmdbApiKey)
        ]);
        const trendingItems = (trending.results || []).slice(0, 10).map((item) => normalizeTmdbItem(item));
        const movieItems = (popularMovies.results || []).slice(0, 10).map((item) => normalizeTmdbItem(item, 'movie'));
        const tvItems = (popularTv.results || []).slice(0, 10).map((item) => normalizeTmdbItem(item, 'tv'));
        featured.push(...trendingItems.slice(0, 5));
        rows.push({ id: 'trending', title: 'Trending Now', items: trendingItems });
        rows.push({ id: 'movies', title: 'Popular Movies', items: movieItems });
        rows.push({ id: 'tv', title: 'Popular TV Shows', items: tvItems });
      } catch (e) { console.error('TMDb home error:', e.message); }
    }

    // Add M3U live TV
    try {
      const m3u = await getM3uData();
      const liveChannels = (m3u.channels || []).slice(0, 15).map((c) => m3uItemToMedia(c, 'live'));
      if (liveChannels.length) rows.push({ id: 'live', title: 'Live TV', items: liveChannels });
    } catch (e) {}

    // Add local catalog items
    if (catalog.items && catalog.items.length) {
      const localItems = catalog.items.map(mapItem);
      rows.push({ id: 'local', title: 'Your Catalog', items: localItems });
    }

    return sendJson(res, 200, { featured, rows });
  }

  // Trending
  if (pathname === '/api/trending') {
    if (!tmdbApiKey) return sendJson(res, 200, { results: [] });
    try {
      const data = await tmdbRequest('/3/trending/all/week', tmdbApiKey);
      const results = (data.results || []).map((item) => normalizeTmdbItem(item));
      return sendJson(res, 200, { results });
    } catch (e) { return sendJson(res, 500, { error: 'TMDb error' }); }
  }

  // Categories
  if (pathname === '/api/categories') {
    const categories = [
      { id: 'action', name: 'Action', genreId: 28 },
      { id: 'adventure', name: 'Adventure', genreId: 12 },
      { id: 'animation', name: 'Animation', genreId: 16 },
      { id: 'comedy', name: 'Comedy', genreId: 35 },
      { id: 'crime', name: 'Crime', genreId: 80 },
      { id: 'documentary', name: 'Documentary', genreId: 99 },
      { id: 'drama', name: 'Drama', genreId: 18 },
      { id: 'family', name: 'Family', genreId: 10751 },
      { id: 'fantasy', name: 'Fantasy', genreId: 14 },
      { id: 'history', name: 'History', genreId: 36 },
      { id: 'horror', name: 'Horror', genreId: 27 },
      { id: 'music', name: 'Music', genreId: 10402 },
      { id: 'mystery', name: 'Mystery', genreId: 9648 },
      { id: 'romance', name: 'Romance', genreId: 10749 },
      { id: 'scifi', name: 'Sci-Fi', genreId: 878 },
      { id: 'thriller', name: 'Thriller', genreId: 53 },
      { id: 'war', name: 'War', genreId: 10752 },
      { id: 'western', name: 'Western', genreId: 37 }
    ];
    return sendJson(res, 200, { categories });
  }

  if (pathname.startsWith('/api/categories/')) {
    const catId = pathname.replace('/api/categories/', '');
    if (!tmdbApiKey) return sendJson(res, 200, { items: [] });
    const genreMap = {
      action: 28, adventure: 12, animation: 16, comedy: 35, crime: 80, documentary: 99,
      drama: 18, family: 10751, fantasy: 14, history: 36, horror: 27, music: 10402,
      mystery: 9648, romance: 10749, scifi: 878, thriller: 53, war: 10752, western: 37
    };
    const genreId = genreMap[catId];
    if (!genreId) return sendJson(res, 404, { error: 'Category not found' });
    try {
      const [movieData, tvData] = await Promise.all([
        tmdbRequest('/3/discover/movie?with_genres=' + genreId + '&sort_by=popularity.desc', tmdbApiKey),
        tmdbRequest('/3/discover/tv?with_genres=' + genreId + '&sort_by=popularity.desc', tmdbApiKey)
      ]);
      const movies = (movieData.results || []).map((item) => normalizeTmdbItem(item, 'movie'));
      const tv = (tvData.results || []).map((item) => normalizeTmdbItem(item, 'tv'));
      return sendJson(res, 200, { id: catId, items: movies.concat(tv).slice(0, 20) });
    } catch (e) { return sendJson(res, 500, { error: 'TMDb error' }); }
  }

  // Search
  if (pathname === '/api/search') {
    const query = String(getQuery(req).q || '').trim();
    if (!query) return sendJson(res, 200, { query, results: [] });

    const results = [];

    if (tmdbApiKey) {
      try {
        const data = await tmdbRequest('/3/search/multi?query=' + encodeURIComponent(query) + '&include_adult=false', tmdbApiKey);
        const tmdbResults = (data.results || []).filter((r) => r.media_type === 'movie' || r.media_type === 'tv').map((item) => normalizeTmdbItem(item));
        results.push(...tmdbResults);
      } catch (e) {}
    }

    // Local catalog search
    const local = catalog.items
      .filter((item) => [item.title, item.type, item.year, ...(item.genres || [])].join(' ').toLowerCase().includes(query.toLowerCase()))
      .map(mapItem);
    results.push(...local);

    return sendJson(res, 200, { query, results });
  }

  // Live TV
  if (pathname === '/api/live/categories') {
    try {
      const m3u = await getM3uData();
      const categories = Array.from(new Set((m3u.channels || []).map((c) => c.group || 'Live TV').filter(Boolean)));
      return sendJson(res, 200, { categories: categories.length ? categories : ['Live TV'] });
    } catch (e) { return sendJson(res, 200, { categories: ['Live TV'] }); }
  }

  if (pathname === '/api/live/channels') {
    const category = String(getQuery(req).category || '').trim();
    try {
      const m3u = await getM3uData();
      const channels = (m3u.channels || [])
        .filter((c) => !category || (c.group || '') === category)
        .map((c) => m3uItemToMedia(c, 'live'));
      return sendJson(res, 200, { category, channels });
    } catch (e) { return sendJson(res, 200, { category, channels: [] }); }
  }

  // Media detail
  const mediaMatch = pathname.match(/^\/api\/media\/([^/]+)$/);
  if (mediaMatch) {
    const mediaId = decodeURIComponent(mediaMatch[1]);
    // Check local catalog first
    const localItem = itemsById.get(mediaId);
    if (localItem) return sendJson(res, 200, mapItem(localItem));

    // Check M3U
    const m3u = await getM3uData();
    const m3uChannel = (m3u.channels || []).find((c) => 'm3u-' + hash(c.url) === mediaId);
    if (m3uChannel) return sendJson(res, 200, m3uItemToMedia(m3uChannel, 'live'));

    // Check TMDb
    if (tmdbApiKey && mediaId.startsWith('tmdb-')) {
      const parts = mediaId.split('-');
      const type = parts[1]; // movie or tv
      const tmdbId = parseInt(parts[2], 10);
      if (tmdbId) {
        const detail = await getTmdbDetail(tmdbId, type, tmdbApiKey);
        if (detail) return sendJson(res, 200, detail);
      }
    }

    return sendJson(res, 404, { error: 'Media not found' });
  }

  // Playback
  const playbackMatch = pathname.match(/^\/api\/playback\/([^/]+)$/);
  if (playbackMatch) {
    const mediaId = decodeURIComponent(playbackMatch[1]);

    // Local catalog
    const localItem = itemsById.get(mediaId);
    if (localItem) {
      const sources = (localItem.sources || []).slice().sort((a, b) => a.priority - b.priority);
      return sendJson(res, 200, { mediaId: localItem.id, title: localItem.title, sources });
    }

    // M3U channel
    const m3u = await getM3uData();
    const m3uChannel = (m3u.channels || []).find((c) => 'm3u-' + hash(c.url) === mediaId);
    if (m3uChannel) {
      return sendJson(res, 200, {
        mediaId: mediaId,
        title: m3uChannel.name || 'Live TV',
        sources: [{ id: 'src-1', provider: m3uChannel.provider || 'IPTV', url: m3uChannel.url, quality: 'Auto', format: 'mp4', priority: 1 }]
      });
    }

    // M3U VOD
    const m3uVod = (m3u.vod || []).find((v) => 'm3u-' + hash(v.url) === mediaId);
    if (m3uVod) {
      return sendJson(res, 200, {
        mediaId: mediaId,
        title: m3uVod.name || 'VOD',
        sources: [{ id: 'src-1', provider: m3uVod.provider || 'IPTV', url: m3uVod.url, quality: 'Auto', format: 'mp4', priority: 1 }]
      });
    }

    // For TMDb items, try to find matching VOD source
    if (tmdbApiKey && mediaId.startsWith('tmdb-')) {
      const m3uData = await getM3uData();
      const allVod = (m3uData.vod || []);
      const parts = mediaId.split('-');
      const tmdbTitle = parts.slice(2).join('-'); // This won't work well, but let's try fuzzy matching
      // For now, return empty sources with a message
      return sendJson(res, 200, { mediaId, title: 'TMDb Item', sources: [] });
    }

    return sendJson(res, 404, { error: 'Media not found' });
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

// Preload TMDb genres on startup
const tmdbApiKey = getTmdbKey();
if (tmdbApiKey) {
  preloadTmdbGenres(tmdbApiKey).then(() => console.log('TMDb genres loaded')).catch(() => console.log('TMDb genre preload failed'));
  // Preload M3U data
  refreshM3uData().then((data) => console.log('M3U loaded:', data.channels.length, 'channels,', data.vod.length, 'VOD')).catch(() => console.log('M3U preload failed'));
}

server.listen(port, () => {
  console.log('Aether Stream running at http://localhost:' + port);
});
