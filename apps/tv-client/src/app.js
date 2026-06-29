(function () {
  var app = document.getElementById('app');
  var state = {
    route: 'boot', home: null, current: null, sources: [], activeSourceIndex: 0,
    focus: 0, focusables: [], focusMemory: {}, player: null, overlay: null, controlsVisible: true,
    capabilities: {}, searchQuery: '', liveCategory: '', liveCategories: [], sidebarOpen: false
  };

  function api(path) { return fetch(path).then(function (res) { if (!res.ok) throw new Error('API failed: ' + path); return res.json(); }); }
  function el(tag, className, text) { var node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; }
  function esc(value) { return String(value === undefined || value === null ? '' : value).replace(/[&<>"']/g, function (char) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]; }); }
  function poster(item) { return item.poster || '/public/poster-demo.svg'; }
  function backdrop(item) { return item.backdrop || '/public/backdrop-demo.svg'; }
  function rating(item) { return item.type === 'live' ? 'LIVE' : '★★★★☆'; }
  function runtime(item) { return item.type === 'live' ? '24/7' : ((item.runtimeMinutes || 96) > 59 ? Math.floor((item.runtimeMinutes || 96) / 60) + 'h ' + ((item.runtimeMinutes || 96) % 60) + 'm' : (item.runtimeMinutes || 96) + 'm'); }
  function setScreen(className) { app.innerHTML = ''; var screen = el('main', 'screen ' + (className || '')); app.appendChild(screen); return screen; }

  function supportsLocalStorage() { try { localStorage.setItem('__vmh__', '1'); localStorage.removeItem('__vmh__'); return true; } catch (error) { return false; } }
  function detectCapabilities() {
    var video = document.createElement('video');
    state.capabilities = { nativeHls: !!video.canPlayType && video.canPlayType('application/vnd.apple.mpegurl') !== '', mediaSource: typeof window.MediaSource !== 'undefined', localStorage: supportsLocalStorage(), resolution: window.innerWidth + 'x' + window.innerHeight };
  }
  function storeKey(name) { return 'vidaamovieshub:' + name; }
  function progressKey(id) { return storeKey('progress:' + id); }
  function readJson(key, fallback) { if (!state.capabilities.localStorage) return fallback; try { return JSON.parse(localStorage.getItem(key) || 'null') || fallback; } catch (error) { return fallback; } }
  function writeJson(key, value) { if (state.capabilities.localStorage) localStorage.setItem(key, JSON.stringify(value)); }
  function readProgress(id) { return readJson(progressKey(id), null); }
  function saveProgress() { if (state.current && state.player && state.player.duration) writeJson(progressKey(state.current.id), { positionSeconds: Math.floor(state.player.currentTime), durationSeconds: Math.floor(state.player.duration) }); }
  function getFavorites() { return readJson(storeKey('favorites'), []); }
  function isFavorite(id) { return getFavorites().indexOf(id) !== -1; }
  function toggleFavorite(id) { var list = getFavorites(); var index = list.indexOf(id); if (index === -1) list.push(id); else list.splice(index, 1); writeJson(storeKey('favorites'), list); renderDetails(id); }

  function rememberFocus() { if (state.route) state.focusMemory[state.route] = state.focus; }
  function setFocus(index) {
    state.focusables.forEach(function (node) { node.classList.remove('focused'); });
    if (!state.focusables.length) return;
    state.focus = Math.max(0, Math.min(index, state.focusables.length - 1));
    var node = state.focusables[state.focus]; node.classList.add('focused'); node.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    if (node.dataset.backdrop) document.documentElement.style.setProperty('--ambient-bg', 'url(' + node.dataset.backdrop + ')');
  }
  function registerFocusables(screen, initial) { state.focusables = Array.prototype.slice.call(screen.querySelectorAll('[data-focusable="true"]')); setFocus(initial || 0); }

  function renderBoot() {
    state.route = 'boot';
    var screen = setScreen('boot-screen');
    screen.innerHTML = '<div class="splash-logo">VIDAA<br><span>MoviesHub</span></div><div class="splash-message">Connecting…</div>';
    setTimeout(function () { renderSkeletonHome(); }, 650);
    api('/api/home').then(function (home) { state.home = home; setTimeout(renderHome, 1150); }).catch(renderError);
  }
  function renderSkeletonHome() { var screen = setScreen('home-screen'); screen.innerHTML = '<section class="hero skeleton hero-skeleton"></section><section class="rail-skeleton"><div></div><span></span><span></span><span></span><span></span></section><section class="rail-skeleton"><div></div><span></span><span></span><span></span><span></span></section>'; }

  function renderSidebar(screen, active) {
    var sidebar = el('aside', 'sidebar' + (state.sidebarOpen ? ' open' : ''));
    [['home', '⌂', 'Home'], ['movies', '🎬', 'Movies'], ['shows', '▣', 'TV Shows'], ['live', '📡', 'Live TV'], ['search', '⌕', 'Search'], ['favorites', '♡', 'Watchlist'], ['continue', '◷', 'Continue'], ['settings', '⚙', 'Settings']].forEach(function (item) {
      var button = el('div', 'side-item' + (active === item[0] ? ' selected' : ''), item[1] + '  ' + item[2]);
      button.setAttribute('data-focusable', state.sidebarOpen ? 'true' : 'false'); button.dataset.action = item[0]; sidebar.appendChild(button);
    });
    screen.appendChild(sidebar);
  }
  function openSidebar() { if (state.sidebarOpen) return; state.sidebarOpen = true; if (state.route === 'home') renderHome(); else if (state.route === 'search') renderSearch(); else if (state.route === 'live') renderLive(); else if (state.route === 'favorites') renderFavorites(); else if (state.route === 'settings') renderSettings(); }
  function closeSidebar() { if (!state.sidebarOpen) return; state.sidebarOpen = false; if (state.route === 'home') renderHome(); else if (state.route === 'search') renderSearch(); else if (state.route === 'live') renderLive(); else if (state.route === 'favorites') renderFavorites(); else if (state.route === 'settings') renderSettings(); }

  function allItems() { return state.home ? flattenHome(state.home) : []; }
  function flattenHome(home) { var seen = {}; return home.rows.reduce(function (all, row) { return all.concat(row.items); }, home.featured.slice()).filter(function (item) { if (seen[item.id]) return false; seen[item.id] = true; return true; }); }
  function homeRows() {
    var rows = state.home.rows.slice();
    if (!rows.some(function (r) { return r.title === 'Trending'; })) rows.splice(1, 0, { id: 'trending', title: 'Trending', items: allItems() });
    if (!rows.some(function (r) { return r.title === 'Recently Added'; })) rows.splice(2, 0, { id: 'recent', title: 'Recently Added', items: allItems() });
    if (!rows.some(function (r) { return r.title === 'Action'; })) rows.splice(3, 0, { id: 'action', title: 'Action', items: allItems().filter(function (i) { return (i.genres || []).join(' ').indexOf('Action') !== -1; }).concat(allItems()).slice(0, 7) });
    if (!rows.some(function (r) { return r.title === 'Comedy'; })) rows.splice(4, 0, { id: 'comedy', title: 'Comedy', items: allItems().filter(function (i) { return (i.genres || []).join(' ').indexOf('Comedy') !== -1; }).concat(allItems()).slice(0, 7) });
    return rows;
  }

  function renderHome() {
    if (!state.home) return renderBoot();
    state.route = 'home';
    var screen = setScreen('home-screen cinematic'); renderSidebar(screen, 'home');
    var featured = state.home.featured[0] || allItems()[0]; document.documentElement.style.setProperty('--ambient-bg', 'url(' + backdrop(featured) + ')');
    var hero = el('section', 'hero'); hero.style.setProperty('--hero-bg', 'url(' + backdrop(featured) + ')');
    hero.innerHTML = '<div class="hero-content"><div class="meta-line">' + esc((featured.genres || []).join(' • ')) + ' • ' + esc(runtime(featured)) + ' • ' + esc(rating(featured)) + ' • ' + esc(featured.year || '') + '</div><h1>' + esc(featured.title) + '</h1><p>' + esc(featured.overview) + '</p><div class="button-row"><div class="button primary" data-focusable="true" data-action="play-featured" data-id="' + esc(featured.id) + '">▶ Play</div><div class="button" data-focusable="true" data-action="details" data-id="' + esc(featured.id) + '">ⓘ Details</div></div></div>';
    screen.appendChild(hero);
    homeRows().forEach(function (row) { renderRail(screen, row.title, row.items); });
    registerFocusables(screen, state.sidebarOpen ? 0 : (state.focusMemory.home || 0)); preloadArtwork(allItems());
  }
  function renderRail(screen, title, items) { var section = el('section', 'row'); section.innerHTML = '<h2>' + esc(title) + '</h2>'; var cardRow = el('div', 'card-row'); items.forEach(function (item) { cardRow.appendChild(renderCard(item)); }); section.appendChild(cardRow); screen.appendChild(section); }
  function renderCard(item) { var saved = readProgress(item.id); var card = el('article', 'card'); card.setAttribute('data-focusable', 'true'); card.dataset.action = 'details'; card.dataset.id = item.id; card.dataset.backdrop = backdrop(item); card.innerHTML = '<div class="poster-wrap"><img class="poster" loading="lazy" src="' + poster(item) + '" alt=""><span class="poster-glow"></span>' + (saved ? '<div class="mini-progress"><span style="width:' + Math.min(100, Math.floor((saved.positionSeconds / Math.max(saved.durationSeconds, 1)) * 100)) + '%"></span></div>' : '') + '</div><div class="card-title">' + esc(item.title) + '</div><div class="card-meta">' + esc(item.year || 'Live') + ' · ' + esc(rating(item)) + '</div>'; return card; }
  function preloadArtwork(items) { items.slice(0, 10).forEach(function (item) { var img = new Image(); img.src = poster(item); if (item.backdrop) { var bg = new Image(); bg.src = item.backdrop; } }); }

  function renderDetails(id) {
    rememberFocus(); state.route = 'details';
    var screen = setScreen('details-screen'); screen.innerHTML = '<section class="detail-hero skeleton"></section>';
    return Promise.all([api('/api/media/' + id), api('/api/playback/' + id)]).then(function (results) {
      state.current = results[0]; state.sources = results[1].sources; var item = state.current; document.documentElement.style.setProperty('--ambient-bg', 'url(' + backdrop(item) + ')');
      screen = setScreen('details-screen cinematic');
      var wrap = el('section', 'detail-hero'); wrap.style.setProperty('--detail-bg', 'url(' + backdrop(item) + ')');
      wrap.innerHTML = '<div class="detail-copy"><h1>' + esc(item.title) + '</h1><div class="badge-row"><span>' + esc(item.year || '') + '</span><span>HDR</span><span>4K</span><span>Dolby</span><span>' + esc(rating(item)) + '</span><span>' + esc(runtime(item)) + '</span></div><div class="genre-row">' + (item.genres || []).map(function (g) { return '<span>' + esc(g) + '</span>'; }).join('') + '</div><div class="button-row"><div class="button primary" data-focusable="true" data-action="play">▶ Play</div><div class="button" data-focusable="true" data-action="trailer">Trailer</div><div class="button" data-focusable="true" data-action="favorite">' + (isFavorite(item.id) ? '✓ Watchlist' : '+ Watchlist') + '</div></div><h2>Overview</h2><p class="overview">' + esc(item.overview) + '</p><h2>Cast</h2><div class="cast-row">' + ['Lead', 'Co-Star', 'Director', 'Guest', 'Creator'].map(function (name) { return '<div class="cast-chip" data-focusable="true" data-action="noop"><span></span>' + name + '</div>'; }).join('') + '</div><h2>Recommended</h2><div class="card-row recommended"></div><h2>Movie Sources</h2><div class="source-list"></div></div>';
      screen.appendChild(wrap);
      var recommended = screen.querySelector('.recommended'); allItems().filter(function (i) { return i.id !== item.id; }).concat(allItems()).slice(0, 8).forEach(function (rec) { recommended.appendChild(renderCard(rec)); });
      var sources = screen.querySelector('.source-list'); state.sources.forEach(function (source) { var s = el('div', 'provider-option', '○ ' + source.provider + ' · ' + source.quality + ' · ' + source.format); s.setAttribute('data-focusable', 'true'); s.dataset.action = 'play'; s.dataset.source = source.id; sources.appendChild(s); });
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
    state.route = route; var screen = setScreen(route + '-screen cinematic'); renderSidebar(screen, route);
    var heading = el('section', 'page-heading'); heading.innerHTML = '<h1>' + esc(title) + '</h1>'; screen.appendChild(heading); if (before) before(screen);
    var grid = el('div', 'poster-grid'); screen.appendChild(grid); grid.innerHTML = skeletonCards(8);
    return itemsPromise().then(function (items) { grid.innerHTML = ''; if (!items.length) grid.appendChild(emptyState()); items.forEach(function (item) { grid.appendChild(renderCard(item)); }); registerFocusables(screen, state.sidebarOpen ? 0 : (state.focusMemory[route] || 0)); }).catch(renderError);
  }
  function skeletonCards(count) { var html = ''; for (var i = 0; i < count; i += 1) html += '<div class="skeleton poster-skeleton"></div>'; return html; }
  function emptyState() { var box = el('div', 'empty-state'); box.innerHTML = '<h2>Couldn\'t load this content.</h2><div class="button-row"><div class="button primary" data-focusable="true" data-action="retry">Retry</div><div class="button" data-focusable="true" data-action="home">Go Home</div></div>'; return box; }
  function renderSearch() { return renderMediaList('search', 'Search', function () { return api('/api/search?q=' + encodeURIComponent(state.searchQuery)).then(function (data) { return data.results; }); }, function (screen) { var panel = el('section', 'search-panel'); panel.innerHTML = '<div class="search-box">' + esc(state.searchQuery || 'Search movies, shows, live TV') + '</div><div class="keyboard-hint">Type with a keyboard/remote. Results update instantly.</div><h2>Trending</h2>'; screen.appendChild(panel); }); }
  function renderLive() { return api('/api/live/categories').then(function (data) { state.liveCategories = data.categories || []; return renderMediaList('live', 'Live TV', function () { return api('/api/live/channels?category=' + encodeURIComponent(state.liveCategory)).then(function (data) { return data.channels; }); }, function (screen) { var row = el('div', 'filter-row'); [''].concat(state.liveCategories).forEach(function (cat) { var pill = el('div', 'filter-pill' + (state.liveCategory === cat ? ' selected' : ''), cat || 'All Channels'); pill.setAttribute('data-focusable', 'true'); pill.dataset.action = 'live-filter'; pill.dataset.category = cat; row.appendChild(pill); }); screen.appendChild(row); }); }); }
  function renderFavorites() { var ids = getFavorites(); return renderMediaList('favorites', 'Watchlist', function () { return Promise.resolve(allItems().filter(function (item) { return ids.indexOf(item.id) !== -1; })); }); }
  function renderContinue() { return renderMediaList('continue', 'Continue Watching', function () { return Promise.resolve(allItems().filter(function (item) { return readProgress(item.id); })); }); }
  function renderMovies() { return renderMediaList('movies', 'Movies', function () { return Promise.resolve(allItems().filter(function (item) { return item.type === 'movie'; })); }); }
  function renderShows() { return renderMediaList('shows', 'TV Shows', function () { return Promise.resolve(allItems().filter(function (item) { return item.type === 'show'; })); }); }
  function renderSettings() { state.route = 'settings'; var screen = setScreen('settings-screen cinematic'); renderSidebar(screen, 'settings'); var heading = el('section', 'page-heading'); heading.innerHTML = '<h1>Settings</h1>'; screen.appendChild(heading); var panel = el('section', 'settings-panel'); panel.innerHTML = ['Appearance', 'Player', 'Subtitle', 'Language', 'Provider', 'Version', 'Storage', 'About'].map(function (name) { return '<div class="settings-tile" data-focusable="true" data-action="noop"><span>' + name + '</span><strong>' + (name === 'Version' ? '0.1.0' : name === 'Storage' ? (state.capabilities.localStorage ? 'Available' : 'Unavailable') : 'Configure') + '</strong></div>'; }).join(''); screen.appendChild(panel); registerFocusables(screen, state.sidebarOpen ? 0 : (state.focusMemory.settings || 0)); }
  function renderError(error) { state.route = 'error'; var screen = setScreen('error-screen'); var box = emptyState(); box.querySelector('h2').textContent = "Couldn't load this content."; screen.appendChild(box); registerFocusables(screen, 0); }

  function activate(node) {
    if (!node) return; var action = node.dataset.action; rememberFocus();
    if (action === 'home') { state.sidebarOpen = false; renderHome(); }
    if (action === 'movies') { state.sidebarOpen = false; renderMovies(); }
    if (action === 'shows') { state.sidebarOpen = false; renderShows(); }
    if (action === 'continue') { state.sidebarOpen = false; renderContinue(); }
    if (action === 'details') renderDetails(node.dataset.id);
    if (action === 'play-featured') return api('/api/media/' + node.dataset.id).then(function () { return Promise.all([api('/api/media/' + node.dataset.id), api('/api/playback/' + node.dataset.id)]); }).then(function (results) { state.current = results[0]; state.sources = results[1].sources; renderPlayer(); });
    if (action === 'play') renderPlayer(node.dataset.source);
    if (action === 'favorite') toggleFavorite(state.current.id);
    if (action === 'search') { state.sidebarOpen = false; renderSearch(); }
    if (action === 'live') { state.sidebarOpen = false; renderLive(); }
    if (action === 'favorites') { state.sidebarOpen = false; renderFavorites(); }
    if (action === 'settings') { state.sidebarOpen = false; renderSettings(); }
    if (action === 'live-filter') { state.liveCategory = node.dataset.category || ''; renderLive(); }
    if (action === 'retry') renderHome();
  }
  function back() { if (state.sidebarOpen) return closeSidebar(); if (state.route === 'home') return; if (state.route === 'player') { if (state.player) state.player.pause(); return renderDetails(state.current.id); } renderHome(); }

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
    if (key === 'ArrowLeft' && !state.sidebarOpen && (state.focus < 2 || state.route !== 'details')) { event.preventDefault(); return openSidebar(); }
    if (key === 'ArrowRight' && state.sidebarOpen) { event.preventDefault(); return closeSidebar(); }
    if (key === 'ArrowRight' || key === 'ArrowDown') { event.preventDefault(); setFocus(state.focus + 1); }
    if (key === 'ArrowLeft' || key === 'ArrowUp') { event.preventDefault(); setFocus(state.focus - 1); }
    if (key === 'Enter' || code === 13) { event.preventDefault(); activate(state.focusables[state.focus]); }
    if (key === 'Backspace' || key === 'Escape' || code === 461 || code === 10009) { event.preventDefault(); back(); }
  });

  detectCapabilities(); renderBoot();
})();
