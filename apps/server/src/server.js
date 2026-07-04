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
const likesPath = path.join(root, 'data/likes.json');
const port = Number(process.env.PORT || 4173);

const TMDB_BASE = 'api.themoviedb.org';
const TMDB_IMG = 'https://image.tmdb.org/t/p';

const tmdbCache = new Map();
const m3uCache = { channels: null, vod: null, lastFetch: 0 };
const CACHE_TTL = 5 * 60 * 1000;

const CATEGORY_ORDER = [
  "MOST POPULAR", "SOCCER EVENTS", "PPV LIVE EVENTS", "4K EXCLUSIVE", "USA ENTERTAINMENT", "USA NEWS", "USA SPORTS", "USA MOVIE CHANNELS", "USA DOCUMENTARIES", "USA MUSIC CHANNELS", "USA ABC LOCALS", "USA CBS LOCALS", "USA CW LOCALS", "USA FOX LOCALS", "USA MYTV LOCALS", "USA NBC LOCALS", "USA PBS LOCALS", "USA TELEMUNDO LOCALS", "USA UNIVISION LOCALS", "CANADA ENTERTAINMENT", "CANADA LOCALS", "CANADA SPORTS", "TSN PLUS", "SPORTSNET PLUS", "DAZN CANADA", "CANADA FRENCH", "CANADA INTERNATIONAL", "UK ENTERTAINMENT", "UK NEWS", "UK MOVIES", "UK SPORTS", "UK MUSIC", "UK REGIONALS", "UK TNT SPORTS", "UK KIDS", "UK INTERNATIONAL", "UK SKY SPORTS", "UK SKY SPORTS PLUS", "UK DOCUMENTARIES", "DAZN UK", "IRELAND", "IRELAND SPORTS", "24/7 CHANNELS", "KIDS ZONE", "LAT ENTRETENIMIENTO", "LAT CINEMANA LATINO", "LAT INFANTIL", "LAT DEPORTES", "LAT NOTICIAS", "LAT PELICULAS CANALES", "DAZN LATAM", "ESPN+", "EPL", "EFL", "SPFL", "ENGLISH NATIONAL LEAGUE", "LA LIGA", "MLB PREMIUM", "MLS PREMIUM", "NFL PREMIUM", "NHL PREMIUM", "NBA PREMIUM", "MILB PREMIUM", "WNBA PREMIUM", "NCAAB", "NCAAF", "F1 RACING", "DISCOVERY+ SPORTS", "OPTUS/SPARK SPORTS", "BTN PLUS", "WORLD SPORTS VIP", "SUPERSPORTS", "FLO SPORTS", "TENNIS PLUS", "DIRTVISION", "VIAPLAY", "SK SPORTS", "PARAMOUNT PLUS", "PEACOCK NETWORK", "ARGENTINA", "AUSTRALIA", "BALKANS", "BELGIUM", "BOLIVIA", "LAT MUSICA", "NEPAL", "BRASIL", "TRILLER TV", "NBA G LEAGUE", "TAMIL", "CARIBBEAN", "VICTORY PLUS", "COLOMBIA", "COSTA RICA", "NETHERLANDS", "AFRICA", "ALBANIA", "ISRAEL", "INTERNATIONAL", "SELFSTREAM", "TELUGU", "UFC FIGHT PASS", "ECUADOR", "EL SALVADOR", "SCOTTISH CUP", "ESPAÑA", "INCOMING", "SERIE A", "ARABIC", "FRANCE", "DAZN FRANCE", "GERMAN", "GREEK", "GUJARATI", "HONDURAS", "INDIAN", "ITALY", "DAZN ITALY", "KANNADA", "MALAYSIA", "MEXICO", "NEW ZEALAND", "PERU", "PHILIPPINES", "POLISH", "PORTUGAL", "DAZN PORTUGAL", "PUNJABI", "REPUBLICA DOMINICANA", "SINGAPORE", "TAIWAN", "TURKISH", "URUGUAY", "VIETNAMESE", "FOR ADULTS (XXX)"
];

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

function readUsers() { return readJsonFile(usersPath, { users: [], sessions: [] }); }
function writeUsers(data) { writeJsonFile(usersPath, data); }
function readHistory() { return readJsonFile(historyPath, { entries: [] }); }
function writeHistory(data) { writeJsonFile(historyPath, data); }
function readLikes() { return readJsonFile(likesPath, {}); }
function writeLikes(data) { writeJsonFile(likesPath, data); }

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

function tmdbImageUrl(imgPath, size) { return imgPath ? TMDB_IMG + '/' + (size || 'w500') + imgPath : null; }

function normalizeTmdbItem(item, type) {
  const isMovie = type === 'movie' || item.media_type === 'movie' || !!item.title;
  const id = item.id;
  return {
    id: isMovie ? 'tmdb-movie-' + id : 'tmdb-tv-' + id,
    tmdbId: id,
    type: isMovie ? 'movie' : 'show',
    title: item.title || item.name || 'Untitled',
    overview: item.overview || '',
    year: String((item.release_date || item.first_air_date || '').slice(0, 4)),
    genres: (item.genre_ids || []).map((gid) => tmdbGenreName(gid, isMovie ? 'movie' : 'tv')),
    poster: tmdbImageUrl(item.poster_path),
    backdrop: tmdbImageUrl(item.backdrop_path, 'original'),
    rating: item.vote_average ? item.vote_average.toFixed(1) : '0.0',
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
  m3uCache.channels = allChannels.slice(0, 500);
  m3uCache.vod = allVod.slice(0, 500);
  m3uCache.lastFetch = Date.now();
  return { channels: m3uCache.channels, vod: m3uCache.vod };
}

async function getM3uData() {
  if (m3uCache.channels && Date.now() - m3uCache.lastFetch < CACHE_TTL) return { channels: m3uCache.channels, vod: m3uCache.vod };
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

async function getTmdbDetail(tmdbId, type, tmdbApiKey) {
  try {
    const detailPath = type === 'movie' ? '/3/movie/' + tmdbId : '/3/tv/' + tmdbId;
    const detail = await tmdbRequest(detailPath + '?append_to_response=credits,videos', tmdbApiKey);
    const isMovie = type === 'movie';
    const trailer = (detail.videos && detail.videos.results && detail.videos.results.find((v) => v.site === 'YouTube' && v.type === 'Trailer')) || null;
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
      rating: detail.vote_average ? detail.vote_average.toFixed(1) : '0.0',
      voteCount: detail.vote_count || 0,
      runtimeMinutes: detail.runtime || (detail.episode_run_time ? detail.episode_run_time[0] : null),
      popularity: detail.popularity || 0,
      trailer: trailer ? { key: trailer.key, name: trailer.name } : null,
      cast: (detail.credits && detail.credits.cast ? detail.credits.cast.slice(0, 8) : []).map((c) => ({
        name: c.name, character: c.character, photo: tmdbImageUrl(c.profile_path, 'w185')
      })),
      crew: (detail.credits && detail.credits.crew ? detail.credits.crew.slice(0, 4) : []).map((c) => ({ name: c.name, job: c.job }))
    };
  } catch (e) { return null; }
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
    '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg'
  };
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }); res.end('Not found'); return; }
    res.writeHead(200, { 'content-type': types[ext] || 'application/octet-stream', 'cache-control': ext === '.html' ? 'no-store' : 'public, max-age=3600' });
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

function mapItem(item) { const copy = Object.assign({}, item); delete copy.sources; return copy; }
function getQuery(req) { return url.parse(req.url || '/', true).query || {}; }
function getTmdbKey() {
  const config = getProviderConfig();
  return config.metadata && config.metadata.tmdbApiKey ? config.metadata.tmdbApiKey : null;
}

async function handleApi(req, res, pathname) {
  const catalog = readCatalog();
  const itemsById = new Map(catalog.items.map((item) => [item.id, item]));
  const tmdbApiKey = getTmdbKey();

  if (req.method === 'POST' && pathname === '/api/auth/register') {
    const body = await readBody(req);
    const username = String(body.username || '').trim().toLowerCase();
    const password = String(body.password || '');
    if (!username || !password || username.length < 3 || password.length < 4) return sendJson(res, 400, { error: 'Invalid credentials' });
    const users = readUsers();
    if (users.users.find((u) => u.username === username)) return sendJson(res, 409, { error: 'Username taken' });
    const user = { id: randomToken(), username, passwordHash: hash(password), createdAt: Date.now() };
    users.users.push(user); writeUsers(users);
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

  if (pathname === '/api/history') {
    const history = readHistory();
    return sendJson(res, 200, { entries: history.entries.slice().reverse().slice(0, 50) });
  }
  if (req.method === 'POST' && pathname === '/api/history') {
    const body = await readBody(req);
    const entry = { id: body.id, title: body.title, type: body.type, poster: body.poster, positionSeconds: body.positionSeconds || 0, durationSeconds: body.durationSeconds || 0, watchedAt: Date.now() };
    const history = readHistory();
    history.entries = history.entries.filter((e) => e.id !== entry.id);
    history.entries.push(entry); writeHistory(history);
    return sendJson(res, 200, { ok: true });
  }
  if (req.method === 'DELETE' && pathname === '/api/history') {
    writeJsonFile(historyPath, { entries: [] });
    return sendJson(res, 200, { ok: true });
  }

  if (pathname === '/api/likes') {
    if (req.method === 'GET') {
      const likes = readLikes();
      return sendJson(res, 200, likes);
    }
    if (req.method === 'POST') {
      const body = await readBody(req);
      const likes = readLikes();
      const id = String(body.id || '');
      if (!id) return sendJson(res, 400, { error: 'Missing id' });
      likes[id] = (likes[id] || 0) + (body.like ? 1 : -1);
      if (likes[id] < 0) likes[id] = 0;
      writeLikes(likes);
      return sendJson(res, 200, likes);
    }
  }

  if (pathname === '/api/config') {
    return sendJson(res, 200, { appName: 'Aether Stream', version: '1.0.0', capabilities: ['remote-navigation', 'html5-video', 'source-fallback', 'tmdb', 'm3u', 'xtream', 'auth'], theme: { background: '#0A0F18', accent: '#fff' }, tmdbEnabled: !!tmdbApiKey });
  }

  if (pathname === '/api/providers') return sendJson(res, 200, readProviders());

  if (pathname === '/api/home' || pathname === '/api/discover') {
    const rows = []; const featured = [];
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
    try {
      const m3u = await getM3uData();
      const liveChannels = (m3u.channels || []).slice(0, 15).map((c) => m3uItemToMedia(c, 'live'));
      if (liveChannels.length) rows.push({ id: 'live', title: 'Live TV', items: liveChannels });
    } catch (e) {}
    if (catalog.items && catalog.items.length) rows.push({ id: 'local', title: 'Your Catalog', items: catalog.items.map(mapItem) });
    return sendJson(res, 200, { featured, rows });
  }

  if (pathname === '/api/ranked') {
    if (!tmdbApiKey) return sendJson(res, 200, { top10: [], cinemas: [], netflix: [], topRated: [], actionMovies: [] });
    try {
      const [topRated, nowPlaying, actionMovies, netflix] = await Promise.all([
        tmdbRequest('/3/movie/top_rated', tmdbApiKey).catch(() => ({ results: [] })),
        tmdbRequest('/3/movie/now_playing', tmdbApiKey).catch(() => ({ results: [] })),
        tmdbRequest('/3/discover/movie?with_genres=28&sort_by=popularity.desc', tmdbApiKey).catch(() => ({ results: [] })),
        tmdbRequest('/3/discover/movie?with_watch_providers=8&watch_region=US&sort_by=popularity.desc', tmdbApiKey).catch(() => ({ results: [] }))
      ]);
      return sendJson(res, 200, {
        top10: (topRated.results || []).slice(0, 10).map((item) => normalizeTmdbItem(item, 'movie')),
        cinemas: (nowPlaying.results || []).slice(0, 20).map((item) => normalizeTmdbItem(item, 'movie')),
        netflix: (netflix.results || []).slice(0, 20).map((item) => normalizeTmdbItem(item, 'movie')),
        topRated: (topRated.results || []).slice(0, 20).map((item) => normalizeTmdbItem(item, 'movie')),
        actionMovies: (actionMovies.results || []).slice(0, 20).map((item) => normalizeTmdbItem(item, 'movie'))
      });
    } catch (e) { return sendJson(res, 500, { error: 'TMDb error' }); }
  }

  if (pathname === '/api/trending') {
    if (!tmdbApiKey) return sendJson(res, 200, { results: [] });
    try { const data = await tmdbRequest('/3/trending/all/week', tmdbApiKey); return sendJson(res, 200, { results: (data.results || []).map((item) => normalizeTmdbItem(item)) }); }
    catch (e) { return sendJson(res, 500, { error: 'TMDb error' }); }
  }

  if (pathname === '/api/movies') {
    if (!tmdbApiKey) return sendJson(res, 200, { results: [] });
    try { const data = await tmdbRequest('/3/movie/popular?page=1', tmdbApiKey); return sendJson(res, 200, { results: (data.results || []).slice(0, 40).map((item) => normalizeTmdbItem(item, 'movie')) }); }
    catch (e) { return sendJson(res, 500, { error: 'TMDb error' }); }
  }

  if (pathname === '/api/shows') {
    if (!tmdbApiKey) return sendJson(res, 200, { results: [] });
    try { const data = await tmdbRequest('/3/tv/popular?page=1', tmdbApiKey); return sendJson(res, 200, { results: (data.results || []).slice(0, 40).map((item) => normalizeTmdbItem(item, 'tv')) }); }
    catch (e) { return sendJson(res, 500, { error: 'TMDb error' }); }
  }

  if (pathname === '/api/categories') {
    return sendJson(res, 200, { categories: [
      { id: 'action', name: 'Action' }, { id: 'adventure', name: 'Adventure' }, { id: 'animation', name: 'Animation' },
      { id: 'comedy', name: 'Comedy' }, { id: 'crime', name: 'Crime' }, { id: 'documentary', name: 'Documentary' },
      { id: 'drama', name: 'Drama' }, { id: 'family', name: 'Family' }, { id: 'fantasy', name: 'Fantasy' },
      { id: 'history', name: 'History' }, { id: 'horror', name: 'Horror' }, { id: 'music', name: 'Music' },
      { id: 'mystery', name: 'Mystery' }, { id: 'romance', name: 'Romance' }, { id: 'scifi', name: 'Sci-Fi' },
      { id: 'thriller', name: 'Thriller' }, { id: 'war', name: 'War' }, { id: 'western', name: 'Western' }
    ] });
  }

  if (pathname.startsWith('/api/categories/')) {
    const catId = pathname.replace('/api/categories/', '');
    if (!tmdbApiKey) return sendJson(res, 200, { items: [] });
    const genreMap = { action: 28, adventure: 12, animation: 16, comedy: 35, crime: 80, documentary: 99, drama: 18, family: 10751, fantasy: 14, history: 36, horror: 27, music: 10402, mystery: 9648, romance: 10749, scifi: 878, thriller: 53, war: 10752, western: 37 };
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

  if (pathname === '/api/search') {
    const query = String(getQuery(req).q || '').trim();
    if (!query) return sendJson(res, 200, { query, results: [] });
    const results = [];
    if (tmdbApiKey) {
      try {
        const data = await tmdbRequest('/3/search/multi?query=' + encodeURIComponent(query) + '&include_adult=false', tmdbApiKey);
        results.push(...(data.results || []).filter((r) => r.media_type === 'movie' || r.media_type === 'tv').map((item) => normalizeTmdbItem(item)));
      } catch (e) {}
    }
    results.push(...catalog.items.filter((item) => [item.title, item.type, item.year, ...(item.genres || [])].join(' ').toLowerCase().includes(query.toLowerCase())).map(mapItem));
    return sendJson(res, 200, { query, results });
  }

  if (pathname === '/api/live/categories') {
    try {
      const m3u = await getM3uData();
      const categories = Array.from(new Set((m3u.channels || []).map((c) => c.group || 'Live TV').filter(Boolean)));
      const sorted = categories.sort((a, b) => {
        const ai = CATEGORY_ORDER.indexOf(a.toUpperCase());
        const bi = CATEGORY_ORDER.indexOf(b.toUpperCase());
        if (ai !== -1 && bi !== -1) return ai - bi;
        if (ai !== -1) return -1;
        if (bi !== -1) return 1;
        return a.localeCompare(b);
      });
      return sendJson(res, 200, { categories: sorted.length ? sorted : ['Live TV'] });
    } catch (e) { return sendJson(res, 200, { categories: ['Live TV'] }); }
  }

  if (pathname === '/api/live/channels') {
    const category = String(getQuery(req).category || '').trim();
    try {
      const m3u = await getM3uData();
      const channels = (m3u.channels || []).filter((c) => !category || (c.group || '') === category).map((c) => m3uItemToMedia(c, 'live'));
      return sendJson(res, 200, { category, channels });
    } catch (e) { return sendJson(res, 200, { category, channels: [] }); }
  }

  const tvSeasonsMatch = pathname.match(/^\/api\/tv\/(\d+)\/seasons$/);
  if (tvSeasonsMatch && tmdbApiKey) {
    const tmdbId = parseInt(tvSeasonsMatch[1], 10);
    try {
      const detail = await tmdbRequest('/3/tv/' + tmdbId + '?append_to_response=seasons', tmdbApiKey);
      const seasons = (detail.seasons || []).filter((s) => s.season_number > 0).map((s) => ({
        seasonNumber: s.season_number,
        name: s.name,
        episodeCount: s.episode_count,
        overview: s.overview,
        poster: tmdbImageUrl(s.poster_path)
      }));
      return sendJson(res, 200, { tmdbId, seasons });
    } catch (e) { return sendJson(res, 500, { error: 'TMDb error' }); }
  }

  const tvEpisodesMatch = pathname.match(/^\/api\/tv\/(\d+)\/season\/(\d+)$/);
  if (tvEpisodesMatch && tmdbApiKey) {
    const tmdbId = parseInt(tvEpisodesMatch[1], 10);
    const seasonNum = parseInt(tvEpisodesMatch[2], 10);
    try {
      const data = await tmdbRequest('/3/tv/' + tmdbId + '/season/' + seasonNum, tmdbApiKey);
      const episodes = (data.episodes || []).map((e) => ({
        episodeNumber: e.episode_number,
        name: e.name,
        overview: e.overview,
        airDate: e.air_date,
        still: tmdbImageUrl(e.still_path)
      }));
      return sendJson(res, 200, { tmdbId, seasonNumber: seasonNum, episodes });
    } catch (e) { return sendJson(res, 500, { error: 'TMDb error' }); }
  }

  const mediaMatch = pathname.match(/^\/api\/media\/([^/]+)$/);
  if (mediaMatch) {
    const mediaId = decodeURIComponent(mediaMatch[1]);
    const localItem = itemsById.get(mediaId);
    if (localItem) return sendJson(res, 200, mapItem(localItem));
    const m3u = await getM3uData();
    const m3uChannel = (m3u.channels || []).find((c) => 'm3u-' + hash(c.url) === mediaId);
    if (m3uChannel) return sendJson(res, 200, m3uItemToMedia(m3uChannel, 'live'));
    if (tmdbApiKey && mediaId.startsWith('tmdb-')) {
      const parts = mediaId.split('-');
      const tmdbId = parseInt(parts[2], 10);
      if (tmdbId) { const detail = await getTmdbDetail(tmdbId, parts[1], tmdbApiKey); if (detail) return sendJson(res, 200, detail); }
    }
    return sendJson(res, 404, { error: 'Media not found' });
  }

  const playbackMatch = pathname.match(/^\/api\/playback\/([^/]+)$/);
  if (playbackMatch) {
    const mediaId = decodeURIComponent(playbackMatch[1]);
    const localItem = itemsById.get(mediaId);
    if (localItem) return sendJson(res, 200, { mediaId: localItem.id, title: localItem.title, sources: (localItem.sources || []).slice().sort((a, b) => a.priority - b.priority) });
    const m3u = await getM3uData();
    const m3uChannel = (m3u.channels || []).find((c) => 'm3u-' + hash(c.url) === mediaId);
    if (m3uChannel) return sendJson(res, 200, { mediaId, title: m3uChannel.name || 'Live TV', sources: [{ id: 'src-1', provider: m3uChannel.provider || 'IPTV', url: m3uChannel.url, quality: 'Auto', format: 'mp4', priority: 1 }] });
    const m3uVod = (m3u.vod || []).find((v) => 'm3u-' + hash(v.url) === mediaId);
    if (m3uVod) return sendJson(res, 200, { mediaId, title: m3uVod.name || 'VOD', sources: [{ id: 'src-1', provider: m3uVod.provider || 'IPTV', url: m3uVod.url, quality: 'Auto', format: 'mp4', priority: 1 }] });
    return sendJson(res, 200, { mediaId, title: 'TMDb Item', sources: [] });
  }

  const similarMatch = pathname.match(/^\/api\/similar\/([^/]+)$/);
  if (similarMatch) {
    const mediaId = decodeURIComponent(similarMatch[1]);
    if (!tmdbApiKey) return sendJson(res, 200, { results: [] });
    const parts = mediaId.split('-');
    const tmdbId = parseInt(parts[2], 10);
    const type = parts[1];
    if (!tmdbId) return sendJson(res, 404, { error: 'Invalid ID' });
    try {
      const data = await tmdbRequest('/3/' + (type === 'movie' ? 'movie' : 'tv') + '/' + tmdbId + '/similar', tmdbApiKey);
      return sendJson(res, 200, { results: (data.results || []).map((item) => normalizeTmdbItem(item, type === 'movie' ? 'movie' : 'tv')) });
    } catch (e) { return sendJson(res, 500, { error: 'TMDb error' }); }
  }

  const ratingMatch = pathname.match(/^\/api\/media\/([^/]+)\/rating$/);
  if (ratingMatch && tmdbApiKey) {
    const mediaId = decodeURIComponent(ratingMatch[1]);
    if (!mediaId.startsWith('tmdb-')) return sendJson(res, 200, { rating: null });
    const parts = mediaId.split('-');
    const tmdbId = parseInt(parts[2], 10);
    const type = parts[1];
    if (!tmdbId) return sendJson(res, 404, { error: 'Invalid ID' });
    try {
      let cert = null;
      if (type === 'movie') {
        const data = await tmdbRequest('/3/movie/' + tmdbId + '/release_dates', tmdbApiKey);
        const us = (data.results || []).find((r) => r.iso_3166_1 === 'US');
        if (us && us.release_dates && us.release_dates.length) {
          cert = us.release_dates[0].certification;
        }
      } else {
        const data = await tmdbRequest('/3/tv/' + tmdbId + '/content_ratings', tmdbApiKey);
        const us = (data.results || []).find((r) => r.iso_3166_1 === 'US');
        if (us) cert = us.rating;
      }
      return sendJson(res, 200, { rating: cert || 'Unrated' });
    } catch (e) { return sendJson(res, 500, { error: 'TMDb error' }); }
  }

  const artworkMatch = pathname.match(/^\/api\/media\/([^/]+)\/artwork$/);
  if (artworkMatch && tmdbApiKey) {
    const mediaId = decodeURIComponent(artworkMatch[1]);
    if (!mediaId.startsWith('tmdb-')) return sendJson(res, 200, { backdrops: [], posters: [], logos: [] });
    const parts = mediaId.split('-');
    const tmdbId = parseInt(parts[2], 10);
    const type = parts[1];
    if (!tmdbId) return sendJson(res, 404, { error: 'Invalid ID' });
    try {
      const data = await tmdbRequest('/3/' + (type === 'movie' ? 'movie' : 'tv') + '/' + tmdbId + '/images', tmdbApiKey);
      return sendJson(res, 200, {
        backdrops: (data.backdrops || []).slice(0, 8).map((img) => tmdbImageUrl(img.file_path, 'original')),
        posters: (data.posters || []).slice(0, 8).map((img) => tmdbImageUrl(img.file_path, 'w500')),
        logos: (data.logos || []).slice(0, 8).map((img) => tmdbImageUrl(img.file_path, 'w500'))
      });
    } catch (e) { return sendJson(res, 500, { error: 'TMDb error' }); }
  }

  return sendJson(res, 404, { error: 'API route not found' });
}

const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url || '/');
  const pathname = decodeURIComponent(parsed.pathname || '/');
  if (pathname.startsWith('/api/')) return handleApi(req, res, pathname);
  const relative = pathname === '/' ? '/index.html' : pathname;
  const safePath = path.normalize(relative).replace(/^\.\.{2,}/, '');
  const filePath = path.join(clientRoot, safePath);
  if (!filePath.startsWith(clientRoot)) { res.writeHead(403); res.end('Forbidden'); return; }
  sendFile(res, filePath);
});

// Startup
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