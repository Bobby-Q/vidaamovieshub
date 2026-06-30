(function () {
  var app = document.getElementById('app');
  var state = {
    route: 'boot', home: null, current: null, sources: [], activeSourceIndex: 0,
    focus: 0, focusables: [], focusMemory: {}, player: null, overlay: null, controlsVisible: true,
    capabilities: {}, searchQuery: '', liveCategory: '', liveCategories: [], sidebarOpen: false,
    categories: [], auth: null, history: [], heroIndex: 0, heroTimer: null
  };

  function api(path) { return fetch(path).then(function (res) { if (!res.ok) throw new Error('API failed: ' + path); return res.json(); }); }
  function apiPost(path, body) { return fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(function (res) { return res.json(); }); }
  function apiAuth(path) { var headers = { 'Accept': 'application/json' }; if (state.auth && state.auth.token) headers['Authorization'] = 'Bearer ' + state.auth.token; return fetch(path, { headers: headers }).then(function (res) { return res.json(); }); }
  function apiAuthPost(path, body) { var headers = { 'Content-Type': 'application/json' }; if (state.auth && state.auth.token) headers['Authorization'] = 'Bearer ' + state.auth.token; return fetch(path, { method: 'POST', headers: headers, body: JSON.stringify(body) }).then(function (res) { return res.json(); }); }
  function el(tag, className, text) { var node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; }
  function esc(value) { return String(value === undefined || value === null ? '' : value).replace(/[&<>"']/g, function (char) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]; }); }
  function poster(item) { return item.poster || item.logo || '/public/poster-demo.svg'; }
  function backdrop(item) { return item.backdrop || item.logo || '/public/backdrop-demo.svg'; }
  function rating(item) { return item.type === 'live' ? 'LIVE' : (item.rating ? '★ ' + item.rating : '★★★★☆'); }
  function runtime(item) { return item.type === 'live' ? '24/7' : ((item.runtimeMinutes || 96) > 59 ? Math.floor((item.runtimeMinutes || 96) / 60) + 'h ' + ((item.runtimeMinutes || 96) % 60) + 'm' : (item.runtimeMinutes || 96) + 'm'); }
  function setScreen(className) { app.innerHTML = ''; var screen = el('main', 'screen ' + (className || '')); app.appendChild(screen); return screen; }
  function setScreenWithNav(className) { var screen = setScreen(className); renderTopNav(screen); return screen; }

  function supportsLocalStorage() { try { localStorage.setItem('__vmh__', '1'); localStorage.removeItem('__vmh__'); return true; } catch (error) { return false; } }
  function detectCapabilities() {
    var video = document.createElement('video');
    state.capabilities = { nativeHls: !!video.canPlayType && video.canPlayType('application/vnd.apple.mpegurl') !== '', mediaSource: typeof window.MediaSource !== 'undefined', localStorage: supportsLocalStorage(), resolution: window.innerWidth + 'x' + window.innerHeight };
  }
  function storeKey(name) { return 'aetherstream:' + name; }
  function progressKey(id) { return storeKey('progress:' + id); }
  function readJson(key, fallback) { if (!state.capabilities.localStorage) return fallback; try { return JSON.parse(localStorage.getItem(key) || 'null') || fallback; } catch (error) { return fallback; } }
  function writeJson(key, value) { if (state.capabilities.localStorage) localStorage.setItem(key, JSON.stringify(value)); }
  function readProgress(id) { return readJson(progressKey(id), null); }
  function saveProgress() { if (state.current && state.player && state.player.duration) writeJson(progressKey(state.current.id), { positionSeconds: Math.floor(state.player.currentTime), durationSeconds: Math.floor(state.player.duration) }); }
  function getFavorites() { return readJson(storeKey('favorites'), []); }
  function isFavorite(id) { return getFavorites().indexOf(id) !== -1; }
  function toggleFavorite(id) { var list = getFavorites(); var index = list.indexOf(id); if (index === -1) list.push(id); else list.splice(index, 1); writeJson(storeKey('favorites'), list); if (state.route === 'details') renderDetails(id); }
  function loadAuth() { state.auth = readJson(storeKey('auth'), null); }
  function saveAuth(auth) { state.auth = auth; writeJson(storeKey('auth'), auth); }
  function clearAuth() { state.auth = null; writeJson(storeKey('auth'), null); }

  function rememberFocus() { if (state.route) state.focusMemory[state.route] = state.focus; }
  function setFocus(index) {
    state.focusables.forEach(function (node) { node.classList.remove('focused'); });
    if (!state.focusables.length) return;
    state.focus = Math.max(0, Math.min(index, state.focusables.length - 1));
    var node = state.focusables[state.focus]; node.classList.add('focused'); node.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    if (node.dataset.backdrop) document.documentElement.style.setProperty('--ambient-bg', 'url(' + node.dataset.backdrop + ')');
  }
  function registerFocusables(screen, initial) { state.focusables = Array.prototype.slice.call(screen.querySelectorAll('[data-focusable="true"]')); setFocus(initial || 0); }

  function renderTopNav(screen) {
    var nav = el('nav', 'top-nav');
    var left = el('div', 'nav-left');
    var logo = el('div', 'nav-logo', 'Aether');
    logo.setAttribute('data-focusable', 'true'); logo.dataset.action = 'home';
    left.appendChild(logo);

    var tabs = el('div', 'nav-tabs');
    [['home', 'Home'], ['movies', 'Movies'], ['shows', 'TV Shows'], ['live', 'Live TV'], ['categories', 'Categories']].forEach(function (tab) {
      var t = el('div', 'nav-tab' + (state.route === tab[0] ? ' active' : ''), tab[1]);
      t.setAttribute('data-focusable', 'true'); t.dataset.action = tab[0];
      tabs.appendChild(t);
    });
    left.appendChild(tabs);

    var right = el('div', 'nav-right');
    var searchBtn = el('div', 'nav-icon', '⌕');
    searchBtn.setAttribute('data-focusable', 'true'); searchBtn.dataset.action = 'search';
    var userBtn = el('div', 'nav-icon', state.auth ? '●' : '○');
    userBtn.setAttribute('data-focusable', 'true'); userBtn.dataset.action = 'auth';
    right.appendChild(searchBtn); right.appendChild(userBtn);

    nav.appendChild(left); nav.appendChild(right);
    screen.appendChild(nav);
    return nav;
  }

  function renderBoot() {
    state.route = 'boot';
    var screen = setScreen('boot-screen');
    screen.innerHTML = '<div class="splash-logo">Aether<span>Stream</span></div><div class="splash-message">Loading your world...</div>';
    loadAuth();
    setTimeout(function () { renderSkeletonHome(); }, 650);
    api('/api/discover').then(function (home) { state.home = home; setTimeout(renderHome, 1150); }).catch(renderError);
  }
  function renderSkeletonHome() { var screen = setScreen('home-screen'); screen.innerHTML = '<section class="hero skeleton hero-skeleton"></section><section class="rail-skeleton"><div></div><span></span><span></span><span></span><span></span></section><section class="rail-skeleton"><div></div><span></span><span></span><span></span><span></span></section>'; }

  function startHeroCarousel() {
    if (state.heroTimer) clearInterval(state.heroTimer);
    if (!state.home || !state.home.featured || !state.home.featured.length) return;
    state.heroTimer = setInterval(function () {
      state.heroIndex = (state.heroIndex + 1) % state.home.featured.length;
      var hero = document.querySelector('.hero');
      var dots = document.querySelectorAll('.hero-dot');
      if (hero && state.home.featured[state.heroIndex]) {
        var item = state.home.featured[state.heroIndex];
        hero.style.setProperty('--hero-bg', 'url(' + backdrop(item) + ')');
        var content = hero.querySelector('.hero-content');
        if (content) {
          content.innerHTML = '<div class="meta-line">' + esc((item.genres || []).join(' • ')) + ' • ' + esc(runtime(item)) + ' • ' + esc(rating(item)) + ' • ' + esc(item.year || '') + '</div><h1>' + esc(item.title) + '</h1><p>' + esc(item.overview) + '</p><div class="button-row"><div class="button primary" data-focusable="true" data-action="play-featured" data-id="' + esc(item.id) + '">▶ Play</div><div class="button" data-focusable="true" data-action="details" data-id="' + esc(item.id) + '">ⓘ Details</div></div>';
        }
      }
      dots.forEach(function (d, i) { d.className = 'hero-dot' + (i === state.heroIndex ? ' active' : ''); });
    }, 6000);
  }

  function renderHome() {
    if (!state.home) return renderBoot();
    state.route = 'home';
    var screen = setScreenWithNav('home-screen');
    var featured = state.home.featured[state.heroIndex] || state.home.featured[0] || {};
    document.documentElement.style.setProperty('--ambient-bg', 'url(' + backdrop(featured) + ')');

    var hero = el('section', 'hero'); hero.style.setProperty('--hero-bg', 'url(' + backdrop(featured) + ')');
    hero.innerHTML = '<div class="hero-content"><div class="meta-line">' + esc((featured.genres || []).join(' • ')) + ' • ' + esc(runtime(featured)) + ' • ' + esc(rating(featured)) + ' • ' + esc(featured.year || '') + '</div><h1>' + esc(featured.title) + '</h1><p>' + esc(featured.overview) + '</p><div class="button-row"><div class="button primary" data-focusable="true" data-action="play-featured" data-id="' + esc(featured.id) + '">▶ Play</div><div class="button" data-focusable="true" data-action="details" data-id="' + esc(featured.id) + '">ⓘ Details</div></div></div>';

    var dots = el('div', 'hero-dots');
    state.home.featured.forEach(function (f, i) {
      var dot = el('div', 'hero-dot' + (i === state.heroIndex ? ' active' : ''));
      dot.setAttribute('data-focusable', 'true'); dot.dataset.action = 'hero-dot'; dot.dataset.index = String(i);
      dots.appendChild(dot);
    });
    hero.appendChild(dots);
    screen.appendChild(hero);

    state.home.rows.forEach(function (row) { renderRow(screen, row.title, row.items); });
    registerFocusables(screen, state.focusMemory.home || 0);
    startHeroCarousel();
  }

  function renderRow(screen, title, items) {
    var section = el('section', 'row');
    var header = el('div', 'row-header');
    header.innerHTML = '<h2>' + esc(title) + '</h2><span class="view-more" data-focusable="true" data-action="view-more" data-title="' + esc(title) + '">View more →</span>';
    section.appendChild(header);
    var cardRow = el('div', 'card-row');
    items.forEach(function (item) { cardRow.appendChild(renderCard(item)); });
    section.appendChild(cardRow); screen.appendChild(section);
  }
  function renderCard(item) {
    var saved = readProgress(item.id);
    var card = el('article', 'card');
    card.setAttribute('data-focusable', 'true'); card.dataset.action = 'details'; card.dataset.id = item.id; card.dataset.backdrop = backdrop(item);
    card.innerHTML = '<div class="poster-wrap"><img class="poster" loading="lazy" src="' + poster(item) + '" alt="" onerror="this.src=\'/public/poster-demo.svg\'"><span class="poster-glow"></span>' + (saved ? '<div class="mini-progress"><span style="width:' + Math.min(100, Math.floor((saved.positionSeconds / Math.max(saved.durationSeconds, 1)) * 100)) + '%"></span></div>' : '') + '</div><div class="card-info"><div class="card-title">' + esc(item.title) + '</div><div class="card-meta">' + esc(item.year || 'Live') + ' · ' + esc(item.type === 'movie' ? 'Movie' : item.type === 'show' ? 'TV Show' : 'Live') + '</div></div>';
    return card;
  }
  function preloadArtwork(items) { items.slice(0, 10).forEach(function (item) { var img = new Image(); img.src = poster(item); if (item.backdrop) { var bg = new Image(); bg.src = item.backdrop; } }); }

  function renderDetails(id) {
    rememberFocus(); state.route = 'details';
    var screen = setScreenWithNav('details-screen'); screen.innerHTML = '<section class="detail-hero skeleton"></section>';
    return Promise.all([api('/api/media/' + id), api('/api/playback/' + id)]).then(function (results) {
      state.current = results[0]; state.sources = results[1].sources || [];
      var item = state.current; document.documentElement.style.setProperty('--ambient-bg', 'url(' + backdrop(item) + ')');
      screen = setScreenWithNav('details-screen');
      var wrap = el('section', 'detail-hero'); wrap.style.setProperty('--detail-bg', 'url(' + backdrop(item) + ')');
      wrap.innerHTML = '<div class="detail-copy"><h1>' + esc(item.title) + '</h1><div class="badge-row"><span>' + esc(item.year || '') + '</span><span>HDR</span><span>4K</span><span>' + esc(rating(item)) + '</span><span>' + esc(runtime(item)) + '</span></div><div class="genre-row">' + (item.genres || []).map(function (g) { return '<span>' + esc(g) + '</span>'; }).join('') + '</div><div class="button-row"><div class="button primary" data-focusable="true" data-action="play">▶ Play</div><div class="button" data-focusable="true" data-action="trailer">Trailer</div><div class="button" data-focusable="true" data-action="favorite">' + (isFavorite(item.id) ? '✓ Watchlist' : '+ Watchlist') + '</div></div><h2>Overview</h2><p class="overview">' + esc(item.overview) + '</p><h2>Cast</h2><div class="cast-row">' + (item.cast || []).map(function (c) { return '<div class="cast-chip" data-focusable="true" data-action="noop"><span style="background-image:url(' + (c.photo || '') + ')"></span>' + esc(c.name) + '</div>'; }).join('') + '</div><h2>Recommended</h2><div class="card-row recommended"></div><h2>Sources</h2><div class="source-list"></div></div>';
      screen.appendChild(wrap);
      var recommended = screen.querySelector('.recommended'); if (state.home) { allItems().filter(function (i) { return i.id !== item.id; }).concat(allItems()).slice(0, 8).forEach(function (rec) { recommended.appendChild(renderCard(rec)); }); }
      var sources = screen.querySelector('.source-list'); state.sources.forEach(function (source) { var s = el('div', 'provider-option', '○ ' + source.provider + ' · ' + source.quality + ' · ' + source.format); s.setAttribute('data-focusable', 'true'); s.dataset.action = 'play'; s.dataset.source = source.id; sources.appendChild(s); });
      if (!state.sources.length) { sources.innerHTML = '<div class="empty-source">No sources available for this item.</div>'; }
      registerFocusables(screen, state.focusMemory.details || 0);
    }).catch(renderError);
  }

  function renderPlayer(sourceId) {
    state.route = 'player'; state.controlsVisible = true; state.activeSourceIndex = Math.max(0, state.sources.findIndex(function (s) { return sourceId && s.id === sourceId; })); if (state.activeSourceIndex < 0) state.activeSourceIndex = 0;
    var screen = setScreen('player-screen'); var video = el('video'); video.controls = false; video.autoplay = true; video.playsInline = true; var overlay = el('div', 'player-controls'); screen.appendChild(video); screen.appendChild(overlay); state.player = video; state.overlay = overlay;
    video.addEventListener('error', tryNextSource); video.addEventListener('waiting', function () { updatePlayerOverlay('Buffering…'); }); video.addEventListener('playing', function () { updatePlayerOverlay('Playing'); }); video.addEventListener('pause', function () { updatePlayerOverlay('Paused'); }); video.addEventListener('timeupdate', function () { saveProgress(); updateProgressBar(); }); loadActiveSource();
  }
  function loadActiveSource() { var source = state.sources[state.activeSourceIndex]; if (!source) return updatePlayerOverlay('No playable source.'); state.player.src = source.url; updatePlayerOverlay('Connecting to ' + source.provider); var saved = readProgress(state.current.id); state.player.onloadedmetadata = function () { if (saved && saved.positionSeconds > 15 && state.current.type !== 'live') state.player.currentTime = saved.positionSeconds; }; state.player.play().catch(function () { updatePlayerOverlay('Press OK to play'); }); }
  function tryNextSource() { if (state.activeSourceIndex + 1 >= state.sources.length) return updatePlayerOverlay('Couldn\'t play this source.'); state.activeSourceIndex += 1; loadActiveSource(); }
  function formatTime(seconds) { if (!seconds || !isFinite(seconds)) return '00:00'; var m = Math.floor(seconds / 60); var s = Math.floor(seconds % 60); return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s; }
  function updatePlayerOverlay(status) { if (!state.overlay) return; state.overlay.className = 'player-controls' + (state.controlsVisible ? ' visible' : ''); var source = state.sources[state.activeSourceIndex] || {}; state.overlay.innerHTML = '<h1>' + esc(state.current.title) + '</h1><div class="player-status">' + esc(status) + ' · ' + esc(source.quality || 'Auto') + '</div><div class="progress"><span></span></div><div class="time-row"><span>' + formatTime(state.player.currentTime) + '</span><span>' + formatTime(state.player.duration) + '</span></div><div class="transport"><span>◄◄</span><span>▶</span><span>►►</span><span>Audio</span><span>CC</span><span>Quality</span><span>Episodes</span><span>More</span></div>'; updateProgressBar(); }
  function updateProgressBar() { var bar = state.overlay && state.overlay.querySelector('.progress span'); if (!bar || !state.player) return; bar.style.width = (state.player.duration ? (state.player.currentTime / state.player.duration) * 100 : 0) + '%'; var times = state.overlay.querySelectorAll('.time-row span'); if (times.length) { times[0].textContent = formatTime(state.player.currentTime); times[1].textContent = formatTime(state.player.duration); } }

  function renderMediaList(route, title, itemsPromise, before) {
    state.route = route; var screen = setScreenWithNav(route + '-screen');
    var heading = el('section', 'page-heading'); heading.innerHTML = '<h1>' + esc(title) + '</h1>'; screen.appendChild(heading); if (before) before(screen);
    var grid = el('div', 'poster-grid'); screen.appendChild(grid); grid.innerHTML = skeletonCards(8);
    return itemsPromise().then(function (items) { grid.innerHTML = ''; if (!items.length) grid.appendChild(emptyState()); items.forEach(function (item) { grid.appendChild(renderCard(item)); }); registerFocusables(screen, state.focusMemory[route] || 0); }).catch(renderError);
  }
  function skeletonCards(count) { var html = ''; for (var i = 0; i < count; i += 1) html += '<div class="skeleton poster-skeleton"></div>'; return html; }
  function emptyState() { var box = el('div', 'empty-state'); box.innerHTML = '<h2>Couldn\'t load this content.</h2><div class="button-row"><div class="button primary" data-focusable="true" data-action="retry">Retry</div><div class="button" data-focusable="true" data-action="home">Go Home</div></div>'; return box; }

  function renderSearch() { return renderMediaList('search', 'Search', function () { return api('/api/search?q=' + encodeURIComponent(state.searchQuery)).then(function (data) { return data.results; }); }, function (screen) { var panel = el('section', 'search-panel'); panel.innerHTML = '<div class="search-box">' + esc(state.searchQuery || 'Search movies, shows, live TV...') + '</div><div class="keyboard-hint">Type with a keyboard/remote. Results update instantly.</div>'; screen.appendChild(panel); }); }
  function renderLive() { return api('/api/live/categories').then(function (data) { state.liveCategories = data.categories || []; return renderMediaList('live', 'Live TV', function () { return api('/api/live/channels?category=' + encodeURIComponent(state.liveCategory)).then(function (data) { return data.channels; }); }, function (screen) { var row = el('div', 'filter-row'); [''].concat(state.liveCategories).forEach(function (cat) { var pill = el('div', 'filter-pill' + (state.liveCategory === cat ? ' selected' : ''), cat || 'All Channels'); pill.setAttribute('data-focusable', 'true'); pill.dataset.action = 'live-filter'; pill.dataset.category = cat; row.appendChild(pill); }); screen.appendChild(row); }); }); }
  function renderFavorites() { var ids = getFavorites(); return renderMediaList('favorites', 'Watchlist', function () { return Promise.resolve(allItems().filter(function (item) { return ids.indexOf(item.id) !== -1; })); }); }
  function renderContinue() { return renderMediaList('continue', 'Continue Watching', function () { return Promise.resolve(allItems().filter(function (item) { return readProgress(item.id); })); }); }
  function renderMovies() { return renderMediaList('movies', 'Movies', function () { return api('/api/search?q=').then(function (data) { return data.results.filter(function (i) { return i.type === 'movie'; }); }); }); }
  function renderShows() { return renderMediaList('shows', 'TV Shows', function () { return api('/api/search?q=').then(function (data) { return data.results.filter(function (i) { return i.type === 'show'; }); }); }); }

  function renderCategories() {
    state.route = 'categories'; var screen = setScreenWithNav('categories-screen');
    var heading = el('section', 'page-heading'); heading.innerHTML = '<h1>Categories</h1>'; screen.appendChild(heading);
    var grid = el('div', 'category-grid'); screen.appendChild(grid); grid.innerHTML = skeletonCards(8);
    return api('/api/categories').then(function (data) {
      grid.innerHTML = ''; state.categories = data.categories || [];
      state.categories.forEach(function (cat) {
        var tile = el('div', 'category-tile'); tile.setAttribute('data-focusable', 'true'); tile.dataset.action = 'category'; tile.dataset.id = cat.id;
        tile.innerHTML = '<div class="category-bg" style="background:linear-gradient(135deg, #1a1a2e, #16213e)"></div><div class="category-name">' + esc(cat.name) + '</div>';
        grid.appendChild(tile);
      });
      registerFocusables(screen, 0);
    }).catch(renderError);
  }
  function renderCategory(id) {
    return renderMediaList('category', 'Category', function () { return api('/api/categories/' + id).then(function (data) { return data.items || []; }); });
  }

  function renderAuth() {
    state.route = 'auth'; var screen = setScreenWithNav('auth-screen');
    var panel = el('div', 'auth-panel');
    if (state.auth && state.auth.token) {
      panel.innerHTML = '<h1>Account</h1><p>Logged in as <strong>' + esc(state.auth.user.username) + '</strong></p><div class="button-row"><div class="button primary" data-focusable="true" data-action="logout">Logout</div></div>';
    } else {
      panel.innerHTML = '<h1>Sign In</h1><input type="text" class="auth-input" placeholder="Username" id="auth-username"><input type="password" class="auth-input" placeholder="Password" id="auth-password"><div class="button-row"><div class="button primary" data-focusable="true" data-action="login">Sign In</div><div class="button" data-focusable="true" data-action="register">Create Account</div></div>';
    }
    screen.appendChild(panel); registerFocusables(screen, 0);
  }

  function renderHistory() {
    return renderMediaList('history', 'Watch History', function () { return apiAuth('/api/history').then(function (data) { return (data.entries || []).map(function (e) { return { id: e.id, title: e.title, type: e.type, poster: e.poster, year: '' }; }); }); });
  }

  function renderSettings() {
    state.route = 'settings'; var screen = setScreenWithNav('settings-screen');
    var heading = el('section', 'page-heading'); heading.innerHTML = '<h1>Settings</h1>'; screen.appendChild(heading);
    var panel = el('section', 'settings-panel');
    panel.innerHTML = ['Appearance', 'Player', 'Subtitle', 'Language', 'Provider', 'Version', 'Storage', 'About'].map(function (name) {
      return '<div class="settings-tile" data-focusable="true" data-action="noop"><span>' + name + '</span><strong>' + (name === 'Version' ? '1.0.0' : name === 'Storage' ? (state.capabilities.localStorage ? 'Available' : 'Unavailable') : 'Configure') + '</strong></div>';
    }).join('');
    screen.appendChild(panel); registerFocusables(screen, 0);
  }
  function renderError(error) { state.route = 'error'; var screen = setScreen('error-screen'); var box = emptyState(); box.querySelector('h2').textContent = "Couldn't load this content."; screen.appendChild(box); registerFocusables(screen, 0); }

  function allItems() { return state.home ? flattenHome(state.home) : []; }
  function flattenHome(home) { var seen = {}; return home.rows.reduce(function (all, row) { return all.concat(row.items); }, home.featured.slice()).filter(function (item) { if (seen[item.id]) return false; seen[item.id] = true; return true; }); }

  function activate(node) {
    if (!node) return; var action = node.dataset.action; rememberFocus();
    if (action === 'home') { state.heroIndex = 0; renderHome(); }
    if (action === 'movies') { renderMovies(); }
    if (action === 'shows') { renderShows(); }
    if (action === 'continue') { renderContinue(); }
    if (action === 'details') renderDetails(node.dataset.id);
    if (action === 'play-featured') return Promise.all([api('/api/media/' + node.dataset.id), api('/api/playback/' + node.dataset.id)]).then(function (results) { state.current = results[0]; state.sources = results[1].sources; renderPlayer(); });
    if (action === 'play') renderPlayer(node.dataset.source);
    if (action === 'favorite') toggleFavorite(state.current.id);
    if (action === 'search') { renderSearch(); }
    if (action === 'live') { renderLive(); }
    if (action === 'favorites') { renderFavorites(); }
    if (action === 'settings') { renderSettings(); }
    if (action === 'categories') { renderCategories(); }
    if (action === 'category') { renderCategory(node.dataset.id); }
    if (action === 'auth') { renderAuth(); }
    if (action === 'history') { renderHistory(); }
    if (action === 'live-filter') { state.liveCategory = node.dataset.category || ''; renderLive(); }
    if (action === 'retry') renderHome();
    if (action === 'hero-dot') { state.heroIndex = parseInt(node.dataset.index, 10); if (state.heroTimer) clearInterval(state.heroTimer); renderHome(); }
    if (action === 'login') {
      var username = document.getElementById('auth-username'); var password = document.getElementById('auth-password');
      apiPost('/api/auth/login', { username: username ? username.value : '', password: password ? password.value : '' }).then(function (res) { if (res.token) { saveAuth({ token: res.token, user: res.user }); renderHome(); } else { alert(res.error || 'Login failed'); } });
    }
    if (action === 'register') {
      var rusername = document.getElementById('auth-username'); var rpassword = document.getElementById('auth-password');
      apiPost('/api/auth/register', { username: rusername ? rusername.value : '', password: rpassword ? rpassword.value : '' }).then(function (res) { if (res.token) { saveAuth({ token: res.token, user: res.user }); renderHome(); } else { alert(res.error || 'Registration failed'); } });
    }
    if (action === 'logout') { clearAuth(); renderHome(); }
    if (action === 'noop') { /* nothing */ }
  }
  function back() { if (state.route === 'home') return; if (state.route === 'player') { if (state.player) state.player.pause(); return renderDetails(state.current.id); } renderHome(); }

  document.addEventListener('keydown', function (event) {
    var key = event.key; var code = event.keyCode;
    if (state.route === 'player') {
      if (key === 'Backspace' || key === 'Escape' || code === 461 || code === 10009) { event.preventDefault(); return back(); }
      if (key === 'Enter' || code === 13 || key === 'MediaPlayPause') { event.preventDefault(); state.controlsVisible = true; state.player.paused ? state.player.play() : state.player.pause(); return updatePlayerOverlay(state.player.paused ? 'Paused' : 'Playing'); }
      if (key === 'ArrowRight') { state.player.currentTime += 15; state.controlsVisible = true; updatePlayerOverlay('Seeking forward'); }
      if (key === 'ArrowLeft') { state.player.currentTime -= 15; state.controlsVisible = true; updatePlayerOverlay('Seeking back'); }
      if (key === 'ArrowUp') { state.controlsVisible = true; updatePlayerOverlay('Menu'); }
      if (key === 'ArrowDown') { state.controlsVisible = false; updatePlayerOverlay('Hidden'); }
      return;
    }
    if (state.route === 'search' && key.length === 1 && !event.ctrlKey && !event.metaKey) { state.searchQuery += key; renderSearch(); return; }
    if (state.route === 'search' && key === 'Backspace' && state.searchQuery) { event.preventDefault(); state.searchQuery = state.searchQuery.slice(0, -1); renderSearch(); return; }
    if (key === 'ArrowRight' || key === 'ArrowDown') { event.preventDefault(); setFocus(state.focus + 1); }
    if (key === 'ArrowLeft' || key === 'ArrowUp') { event.preventDefault(); setFocus(state.focus - 1); }
    if (key === 'Enter' || code === 13) { event.preventDefault(); activate(state.focusables[state.focus]); }
    if (key === 'Backspace' || key === 'Escape' || code === 461 || code === 10009) { event.preventDefault(); back(); }
  });

  detectCapabilities(); loadAuth(); renderBoot();
})();
