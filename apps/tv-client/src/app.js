(function () {
  var app = document.getElementById('app');
  var state = {
    route: 'home', home: null, current: null, sources: [], activeSourceIndex: 0,
    focus: 0, focusables: [], lastHomeFocus: 0, player: null, overlay: null,
    capabilities: {}, searchQuery: '', liveCategory: '', liveCategories: [], clockTimer: null
  };

  function api(path) { return fetch(path).then(function (res) { if (!res.ok) throw new Error('API failed: ' + path); return res.json(); }); }
  function el(tag, className, text) { var node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; }
  function setScreen(className) { app.innerHTML = ''; var screen = el('main', 'screen ' + (className || '')); app.appendChild(screen); return screen; }
  function poster(item) { return item.poster || '/public/poster-demo.svg'; }
  function backdrop(item) { return item.backdrop || '/public/backdrop-demo.svg'; }
  function esc(value) { return String(value === undefined || value === null ? '' : value).replace(/[&<>"']/g, function (char) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]; }); }

  function setFocus(index) {
    state.focusables.forEach(function (node) { node.classList.remove('focused'); });
    if (!state.focusables.length) return;
    state.focus = Math.max(0, Math.min(index, state.focusables.length - 1));
    state.focusables[state.focus].classList.add('focused');
    state.focusables[state.focus].scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  function registerFocusables(screen, initial) {
    state.focusables = Array.prototype.slice.call(screen.querySelectorAll('[data-focusable="true"]'));
    setFocus(initial || 0);
  }

  function detectCapabilities() {
    var video = document.createElement('video');
    state.capabilities = {
      nativeHls: !!video.canPlayType && video.canPlayType('application/vnd.apple.mpegurl') !== '',
      mediaSource: typeof window.MediaSource !== 'undefined',
      localStorage: supportsLocalStorage(),
      resolution: window.innerWidth + 'x' + window.innerHeight
    };
  }

  function supportsLocalStorage() {
    try { localStorage.setItem('__vidaamovieshub_test__', '1'); localStorage.removeItem('__vidaamovieshub_test__'); return true; } catch (error) { return false; }
  }

  function storeKey(name) { return 'vidaamovieshub:' + name; }
  function progressKey(id) { return storeKey('progress:' + id); }
  function saveProgress() {
    if (!state.capabilities.localStorage || !state.current || !state.player || !state.player.duration) return;
    localStorage.setItem(progressKey(state.current.id), JSON.stringify({ positionSeconds: Math.floor(state.player.currentTime), durationSeconds: Math.floor(state.player.duration) }));
  }
  function readProgress(id) {
    if (!state.capabilities.localStorage) return null;
    try { return JSON.parse(localStorage.getItem(progressKey(id)) || 'null'); } catch (error) { return null; }
  }
  function getFavorites() {
    if (!state.capabilities.localStorage) return [];
    try { return JSON.parse(localStorage.getItem(storeKey('favorites')) || '[]'); } catch (error) { return []; }
  }
  function isFavorite(id) { return getFavorites().indexOf(id) !== -1; }
  function toggleFavorite(id) {
    if (!state.capabilities.localStorage) return;
    var favorites = getFavorites(); var index = favorites.indexOf(id);
    if (index === -1) favorites.push(id); else favorites.splice(index, 1);
    localStorage.setItem(storeKey('favorites'), JSON.stringify(favorites));
    renderDetails(id);
  }

  function renderTopbar(screen, title) {
    var topbar = el('div', 'topbar');
    topbar.innerHTML = '<div><div class="eyebrow">VIDAA Web App</div><div class="brand">' + esc(title || 'MoviesHub') + '</div></div><div class="top-actions"><span id="clock"></span><span>Arrows</span><span>OK</span><span>Back</span></div>';
    screen.appendChild(topbar);
    updateClock();
    if (!state.clockTimer) state.clockTimer = setInterval(updateClock, 30000);
  }

  function updateClock() {
    var clock = document.getElementById('clock');
    if (clock) clock.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function renderShellNav(screen, active) {
    var nav = el('section', 'quick-nav');
    [['home', 'Home'], ['search', 'Search'], ['live', 'Live TV'], ['favorites', 'Favorites'], ['settings', 'Settings']].forEach(function (item) {
      var button = el('div', 'nav-pill' + (active === item[0] ? ' active' : ''), item[1]);
      button.setAttribute('data-focusable', 'true'); button.dataset.action = item[0];
      nav.appendChild(button);
    });
    screen.appendChild(nav);
  }

  function renderHome() {
    state.route = 'home';
    var screen = setScreen('home-screen'); renderTopbar(screen, 'MoviesHub');
    if (!state.home) { screen.appendChild(el('div', 'skeleton hero-skeleton')); return api('/api/home').then(function (home) { state.home = home; renderHome(); }).catch(renderError); }
    var featured = state.home.featured[0] || (state.home.rows[0] && state.home.rows[0].items[0]);
    var hero = el('section', 'hero');
    hero.style.setProperty('--hero-bg', 'url(' + backdrop(featured) + ')'); hero.setAttribute('data-focusable', 'true'); hero.dataset.action = 'details'; hero.dataset.id = featured.id;
    hero.innerHTML = '<div class="hero-copy"><div class="eyebrow">Featured for VIDAA</div><h1>' + esc(featured.title) + '</h1><p>' + esc(featured.overview) + '</p><div class="hero-buttons"><span class="button primary">Play / Details</span><span class="button">' + esc(featured.type) + '</span></div></div><div class="hero-panel"><strong>Ready</strong><span>HTML5 playback</span><span>Source fallback</span><span>Remote-first focus</span></div>';
    screen.appendChild(hero);
    renderShellNav(screen, 'home');
    state.home.rows.forEach(function (row) { renderRail(screen, row.title, row.items); });
    registerFocusables(screen, state.lastHomeFocus);
  }

  function renderRail(screen, title, items) {
    var section = el('section', 'row'); section.appendChild(el('h2', '', title));
    var cardRow = el('div', 'card-row');
    items.forEach(function (item) { cardRow.appendChild(renderCard(item)); });
    section.appendChild(cardRow); screen.appendChild(section);
  }
  function renderCard(item) {
    var card = el('article', 'card'); card.setAttribute('data-focusable', 'true'); card.dataset.action = 'details'; card.dataset.id = item.id;
    card.innerHTML = '<img class="poster" loading="lazy" src="' + poster(item) + '" alt=""><div class="card-title">' + esc(item.title) + '</div><div class="card-meta">' + esc(item.year || 'Live') + ' • ' + esc(item.type || 'media') + '</div>';
    return card;
  }

  function renderDetails(id) {
    if (state.route === 'home') state.lastHomeFocus = state.focus;
    state.route = 'details';
    var screen = setScreen('details-screen'); renderTopbar(screen, 'Details'); screen.appendChild(el('div', 'skeleton detail-skeleton'));
    return Promise.all([api('/api/media/' + id), api('/api/playback/' + id)]).then(function (results) {
      state.current = results[0]; state.sources = results[1].sources;
      screen = setScreen('details-screen'); renderTopbar(screen, 'Details');
      var wrap = el('section', 'details'); wrap.style.setProperty('--detail-bg', 'url(' + backdrop(state.current) + ')');
      var saved = readProgress(state.current.id); var playLabel = saved && saved.positionSeconds > 15 ? 'Resume from ' + Math.floor(saved.positionSeconds / 60) + 'm' : 'Play Now';
      wrap.innerHTML = '<img class="details-poster" src="' + poster(state.current) + '" alt=""><div class="details-body"><div class="eyebrow">' + esc(state.current.type) + '</div><h1>' + esc(state.current.title) + '</h1><div class="meta">' + esc(state.current.year || '') + ' • ' + esc((state.current.genres || []).join(', ')) + '</div><p class="overview">' + esc(state.current.overview) + '</p><div class="action-strip"></div><h2>Available Sources</h2><div class="source-list"></div></div>';
      var actions = wrap.querySelector('.action-strip');
      [['play', playLabel, 'primary'], ['favorite', isFavorite(state.current.id) ? 'Remove Favorite' : '+ Favorite', ''], ['back', 'Back', '']].forEach(function (action) { var b = el('div', 'button ' + action[2], action[1]); b.setAttribute('data-focusable', 'true'); b.dataset.action = action[0]; actions.appendChild(b); });
      var list = wrap.querySelector('.source-list');
      state.sources.forEach(function (source, index) { var s = el('div', 'source-card', (index + 1) + '. ' + esc(source.provider) + ' • ' + esc(source.format) + ' • ' + esc(source.quality)); s.setAttribute('data-focusable', 'true'); s.dataset.action = 'play'; s.dataset.source = source.id; list.appendChild(s); });
      screen.appendChild(wrap); registerFocusables(screen, 0);
    }).catch(renderError);
  }

  function renderPlayer(sourceId) {
    state.route = 'player'; state.activeSourceIndex = Math.max(0, state.sources.findIndex(function (s) { return sourceId && s.id === sourceId; })); if (state.activeSourceIndex < 0) state.activeSourceIndex = 0;
    var screen = setScreen('player-screen'); var video = el('video'); video.controls = false; video.autoplay = true; video.playsInline = true; var overlay = el('div', 'player-overlay');
    screen.appendChild(video); screen.appendChild(overlay); state.player = video; state.overlay = overlay;
    video.addEventListener('error', tryNextSource); video.addEventListener('waiting', function () { updatePlayerOverlay('Buffering…'); }); video.addEventListener('playing', function () { updatePlayerOverlay('Playing'); }); video.addEventListener('pause', function () { updatePlayerOverlay('Paused'); }); video.addEventListener('timeupdate', function () { saveProgress(); updateProgressBar(); }); loadActiveSource();
  }
  function loadActiveSource() { var source = state.sources[state.activeSourceIndex]; if (!source) { updatePlayerOverlay('No playable source available.'); return; } state.player.src = source.url; updatePlayerOverlay('Loading ' + source.provider + ' • ' + source.format + ' • ' + source.quality); var saved = readProgress(state.current.id); state.player.onloadedmetadata = function () { if (saved && saved.positionSeconds > 15 && state.current.type !== 'live') state.player.currentTime = saved.positionSeconds; }; state.player.play().catch(function () { updatePlayerOverlay('Press OK to start playback.'); }); }
  function tryNextSource() { if (state.activeSourceIndex + 1 >= state.sources.length) { updatePlayerOverlay('All sources failed. Press Back and choose another item.'); return; } state.activeSourceIndex += 1; loadActiveSource(); }
  function updatePlayerOverlay(status) { var source = state.sources[state.activeSourceIndex]; state.overlay.innerHTML = '<strong>' + esc(state.current.title) + '</strong><div class="nav-hint">' + esc(status) + ' • Source ' + (state.activeSourceIndex + 1) + '/' + state.sources.length + (source ? ' • ' + esc(source.quality) : '') + '</div><div class="nav-hint">OK Play/Pause • Left/Right Seek • Up Next Source • Back Return</div><div class="progress"><span></span></div>'; updateProgressBar(); }
  function updateProgressBar() { if (!state.overlay || !state.player) return; var bar = state.overlay.querySelector('span'); if (!bar) return; var pct = state.player.duration ? (state.player.currentTime / state.player.duration) * 100 : 0; bar.style.width = pct + '%'; }

  function renderMediaList(title, fetcher, active, before) {
    state.route = active || 'list'; var screen = setScreen('list-screen'); renderTopbar(screen, title); renderShellNav(screen, active);
    if (before) before(screen);
    var holder = el('div', 'grid'); screen.appendChild(holder); holder.appendChild(el('div', 'skeleton grid-skeleton'));
    return fetcher().then(function (items) { holder.innerHTML = ''; if (!items.length) holder.appendChild(el('p', 'empty-state', 'No items found. Use Search or add providers in Settings.')); items.forEach(function (item) { holder.appendChild(renderCard(item)); }); var backButton = el('div', 'button', 'Back'); backButton.setAttribute('data-focusable', 'true'); backButton.dataset.action = 'back'; screen.appendChild(backButton); registerFocusables(screen, active === 'search' ? 5 : 0); }).catch(renderError);
  }

  function renderSearch() {
    return renderMediaList('Search', function () { return api('/api/search?q=' + encodeURIComponent(state.searchQuery)).then(function (data) { return data.results; }); }, 'search', function (screen) {
      var panel = el('section', 'search-panel'); panel.innerHTML = '<div class="eyebrow">Remote keyboard</div><h1>' + esc(state.searchQuery || 'Type to search') + '</h1><p class="overview">Use number/letter keys on your remote or keyboard, Backspace to delete, and OK on a result.</p>'; screen.appendChild(panel);
    });
  }
  function renderLive() { return api('/api/live/categories').then(function (data) { state.liveCategories = data.categories || []; return renderMediaList('Live TV', function () { return api('/api/live/channels?category=' + encodeURIComponent(state.liveCategory)).then(function (d) { return d.channels; }); }, 'live', renderLiveFilters); }); }
  function renderLiveFilters(screen) { var filters = el('section', 'filter-row'); var all = [''].concat(state.liveCategories); all.forEach(function (category) { var label = category || 'All Channels'; var pill = el('div', 'filter-pill' + (state.liveCategory === category ? ' active' : ''), label); pill.setAttribute('data-focusable', 'true'); pill.dataset.action = 'live-filter'; pill.dataset.category = category; filters.appendChild(pill); }); screen.appendChild(filters); }
  function renderFavorites() { var ids = getFavorites(); return renderMediaList('Favorites', function () { if (!state.home) return api('/api/home').then(function (home) { state.home = home; return flattenHome(home).filter(function (item) { return ids.indexOf(item.id) !== -1; }); }); return Promise.resolve(flattenHome(state.home).filter(function (item) { return ids.indexOf(item.id) !== -1; })); }, 'favorites'); }
  function flattenHome(home) { var seen = {}; return home.rows.reduce(function (all, row) { return all.concat(row.items); }, home.featured.slice()).filter(function (item) { if (seen[item.id]) return false; seen[item.id] = true; return true; }); }
  function renderSettings() { state.route = 'settings'; var screen = setScreen('settings-screen'); renderTopbar(screen, 'Settings'); renderShellNav(screen, 'settings'); screen.innerHTML += '<section class="settings-panel"><h1>Playback & Device</h1><p class="overview">Same-origin backend APIs are active. Add Xtream, M3U, and TMDb credentials on the server when provider setup is ready.</p><div class="settings-grid"><div>Resolution<strong>' + esc(state.capabilities.resolution) + '</strong></div><div>Native HLS<strong>' + (state.capabilities.nativeHls ? 'Yes' : 'No') + '</strong></div><div>MediaSource<strong>' + (state.capabilities.mediaSource ? 'Yes' : 'No') + '</strong></div><div>Local Storage<strong>' + (state.capabilities.localStorage ? 'Yes' : 'No') + '</strong></div></div></section>'; var back = el('div', 'button primary', 'Back'); back.setAttribute('data-focusable', 'true'); back.dataset.action = 'back'; screen.appendChild(back); registerFocusables(screen, 0); }
  function renderError(error) { var screen = setScreen(''); renderTopbar(screen, 'Error'); screen.appendChild(el('div', 'error', error.message || String(error))); var back = el('div', 'button primary', 'Back'); back.setAttribute('data-focusable', 'true'); back.dataset.action = 'back'; screen.appendChild(back); registerFocusables(screen, 0); }

  function activate(node) { if (!node) return; var action = node.dataset.action; if (action === 'home') renderHome(); if (action === 'details') renderDetails(node.dataset.id); if (action === 'play') renderPlayer(node.dataset.source); if (action === 'favorite') toggleFavorite(state.current.id); if (action === 'search') renderSearch(); if (action === 'live') renderLive(); if (action === 'favorites') renderFavorites(); if (action === 'settings') renderSettings(); if (action === 'live-filter') { state.liveCategory = node.dataset.category || ''; renderLive(); } if (action === 'back') back(); }
  function back() { if (state.route === 'home') return; if (state.route === 'player') { if (state.player) state.player.pause(); renderDetails(state.current.id); } else renderHome(); }

  document.addEventListener('keydown', function (event) {
    var key = event.key; var code = event.keyCode;
    if (state.route === 'player') { if (key === 'Backspace' || key === 'Escape' || code === 461 || code === 10009) { event.preventDefault(); back(); } if (key === 'Enter' || code === 13 || key === 'MediaPlayPause') { event.preventDefault(); state.player.paused ? state.player.play() : state.player.pause(); } if (key === 'ArrowRight') state.player.currentTime += 15; if (key === 'ArrowLeft') state.player.currentTime -= 15; if (key === 'ArrowUp') tryNextSource(); return; }
    if (state.route === 'search' && key.length === 1 && !event.ctrlKey && !event.metaKey) { state.searchQuery += key; renderSearch(); return; }
    if (state.route === 'search' && key === 'Backspace' && state.searchQuery) { event.preventDefault(); state.searchQuery = state.searchQuery.slice(0, -1); renderSearch(); return; }
    if (key === 'ArrowRight' || key === 'ArrowDown') { event.preventDefault(); setFocus(state.focus + 1); }
    if (key === 'ArrowLeft' || key === 'ArrowUp') { event.preventDefault(); setFocus(state.focus - 1); }
    if (key === 'Enter' || code === 13) { event.preventDefault(); activate(state.focusables[state.focus]); }
    if (key === 'Backspace' || key === 'Escape' || code === 461 || code === 10009) { event.preventDefault(); back(); }
  });

  detectCapabilities(); renderHome();
})();
