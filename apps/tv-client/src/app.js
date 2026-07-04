(function () {
  var app = document.getElementById('app');
  var state = {
    route: 'boot', home: null, current: null, sources: [], activeSourceIndex: 0,
    focus: 0, focusables: [], focusMemory: {}, player: null, overlay: null, controlsVisible: true,
    capabilities: {}, searchQuery: '', liveCategory: '', liveCategories: [], sidebarOpen: false,
    categories: [], auth: null, history: [], heroIndex: 0, heroTimer: null,
    likes: {}, ranked: null, likeCounts: {}, similar: [], tvSeasons: [], tvEpisodes: [],
    idleTimer: null, idleIndex: 0, idleScreenTimer: null,
    heroMuted: true, trailerPlayer: null
  };

  /* =========================================================
     SVG ICONS — Apple HIG Style, 2px stroke, rounded ends
     ========================================================= */
  function svgIcon(name, size) {
    size = size || 20;
    var s = '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">';
    switch (name) {
      case 'back':     s += '<path d="M15 18l-6-6 6-6"/>'; break;
      case 'chevron-left':  s += '<path d="M15 18l-6-6 6-6"/>'; break;
      case 'chevron-right': s += '<path d="M9 18l6-6-6-6"/>'; break;
      case 'play':     s += '<polygon points="5 3 19 12 5 21 5 3"/>'; break;
      case 'pause':    s += '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>'; break;
      case 'plus':     s += '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>'; break;
      case 'heart':    s += '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>'; break;
      case 'search':   s += '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>'; break;
      case 'mute':     s += '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>'; break;
      case 'unmute':   s += '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/>'; break;
      case 'settings': s += '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.17 15 1.65 1.65 0 0 0 2.67 14.1 2 2 0 0 1 1.83 12a2 2 0 0 1 .84-1.1 1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33h.09A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 .33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33 1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1 1.65 1.65 0 0 0 1.1.84 2 2 0 0 1 1.1 1.73 2 2 0 0 1-.84 1.1z"/>'; break;
      case 'user':     s += '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>'; break;
      case 'tv':       s += '<rect x="2" y="7" width="20" height="15" rx="2" ry="2"/><polyline points="17 2 12 7 7 2"/>'; break;
      case 'film':     s += '<rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/><line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="17" x2="22" y2="17"/><line x1="17" y1="7" x2="22" y2="7"/>'; break;
      case 'grid':     s += '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>'; break;
      case 'check':    s += '<polyline points="20 6 9 17 4 12"/>'; break;
      case 'star':     s += '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>'; break;
      case 'info':     s += '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>'; break;
      default: s += '<circle cx="12" cy="12" r="10"/>';
    }
    s += '</svg>';
    return s;
  }

  /* =========================================================
     API HELPERS
     ========================================================= */
  function api(path) { return fetch(path).then(function (res) { if (!res.ok) throw new Error('API failed: ' + path); return res.json(); }); }
  function apiPost(path, body) { return fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(function (res) { return res.json(); }); }
  function apiAuth(path) { var headers = { 'Accept': 'application/json' }; if (state.auth && state.auth.token) headers['Authorization'] = 'Bearer ' + state.auth.token; return fetch(path, { headers: headers }).then(function (res) { return res.json(); }); }

  /* =========================================================
     DOM HELPERS
     ========================================================= */
  function el(tag, className, text) { var node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; }
  function esc(value) { return String(value === undefined || value === null ? '' : value).replace(/[&<>"']/g, function (char) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]; }); }
  function wsrv(url) { if (!url) return ''; if (url.startsWith('data:')) return url; return 'https://wsrv.nl/?url=' + encodeURIComponent(url) + '&output=webp&q=50&n=-1'; }
  function poster(item) { return wsrv(item.poster || item.logo || ''); }
  function backdrop(item) { return wsrv(item.backdrop || item.logo || ''); }
  function runtime(item) { return item.type === 'live' ? '24/7' : ((item.runtimeMinutes || 96) > 59 ? Math.floor((item.runtimeMinutes || 96) / 60) + 'h ' + ((item.runtimeMinutes || 96) % 60) + 'm' : (item.runtimeMinutes || 96) + 'm'); }
  function setScreen(className) { app.innerHTML = ''; var screen = el('main', 'screen ' + (className || '')); app.appendChild(screen); return screen; }
  function setScreenWithNav(className) { var screen = setScreen(className); renderTopNav(screen); screen.addEventListener('scroll', function () { var nav = document.querySelector('.top-nav'); if (!nav) return; var st = screen.scrollTop; var last = screen._lastScrollTop || 0; if (st > last && st > 80) { nav.classList.add('nav-hidden'); } else if (st < last) { nav.classList.remove('nav-hidden'); } screen._lastScrollTop = st; }); return screen; }

  /* =========================================================
     STORAGE & AUTH
     ========================================================= */
  function supportsLocalStorage() { try { localStorage.setItem('__vmh__', '1'); localStorage.removeItem('__vmh__'); return true; } catch (e) { return false; } }
  function detectCapabilities() { var video = document.createElement('video'); state.capabilities = { nativeHls: !!video.canPlayType && video.canPlayType('application/vnd.apple.mpegurl') !== '', mediaSource: typeof window.MediaSource !== 'undefined', localStorage: supportsLocalStorage(), resolution: window.innerWidth + 'x' + window.innerHeight }; }
  function storeKey(name) { return 'aetherstream:' + name; }
  function readJson(key, fallback) { if (!state.capabilities.localStorage) return fallback; try { return JSON.parse(localStorage.getItem(key) || 'null') || fallback; } catch (e) { return fallback; } }
  function writeJson(key, value) { if (state.capabilities.localStorage) localStorage.setItem(key, JSON.stringify(value)); }
  function getFavorites() { return readJson(storeKey('favorites'), []); }
  function isFavorite(id) { return getFavorites().indexOf(id) !== -1; }
  function toggleFavorite(id) { var list = getFavorites(); var index = list.indexOf(id); if (index === -1) list.push(id); else list.splice(index, 1); writeJson(storeKey('favorites'), list); if (state.route === 'details') renderDetails(id); }
  function loadAuth() { state.auth = readJson(storeKey('auth'), null); }
  function saveAuth(auth) { state.auth = auth; writeJson(storeKey('auth'), auth); }
  function clearAuth() { state.auth = null; writeJson(storeKey('auth'), null); }

  /* =========================================================
     FOCUS SYSTEM — Premium TV Focus
     ========================================================= */
  function rememberFocus() { if (state.route) state.focusMemory[state.route] = state.focus; }
  function setFocus(index) {
    state.focusables.forEach(function (node) { node.classList.remove('focused'); });
    if (!state.focusables.length) return;
    state.focus = Math.max(0, Math.min(index, state.focusables.length - 1));
    var node = state.focusables[state.focus];
    node.classList.add('focused');
    var screen = document.querySelector('.screen');
    if (screen && node.closest && node.closest('.hero')) {
      screen.scrollTo({ top: 0 });
    } else if (screen && node.scrollIntoView) {
      node.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }
  function registerFocusables(screen, initial) { state.focusables = Array.prototype.slice.call(screen.querySelectorAll('[data-focusable="true"]')); setFocus(initial || 0); }

  /* =========================================================
     NAVIGATION LOGIC — Predictable D-Pad
     ========================================================= */
  function getSection(el) {
    if (!el) return null;
    if (el.closest('.top-nav')) return { type: 'nav', index: 0 };
    if (el.closest('.hero')) return { type: 'hero', index: 1 };
    var row = el.closest('.row');
    if (row) {
      var rows = Array.prototype.slice.call(document.querySelectorAll('.row'));
      return { type: 'row', index: 2 + rows.indexOf(row) };
    }
    if (el.closest('.detail-hero')) {
      if (el.closest('.back-btn')) return { type: 'detail-back', index: 9 };
      if (el.closest('.mute-icon')) return { type: 'detail-mute', index: 9.5 };
      if (el.closest('.hero-buttons')) return { type: 'detail-buttons', index: 10 };
    }
    if (el.closest('.detail-body')) {
      if (el.closest('.overview-wrap')) return { type: 'detail-overview', index: 11 };
      if (el.closest('.cast-wrap')) return { type: 'detail-cast', index: 12 };
      if (el.closest('.seasons-wrap')) return { type: 'detail-seasons', index: 13 };
      if (el.closest('.recommended-wrap')) return { type: 'detail-recommended', index: 14 };
      if (el.closest('.similar-wrap')) return { type: 'detail-similar', index: 15 };
    }
    if (el.closest('.auth-panel')) return { type: 'auth', index: 20 };
    if (el.closest('.settings-panel')) return { type: 'settings', index: 21 };
    if (el.closest('.category-grid')) return { type: 'categories', index: 22 };
    return { type: 'content', index: 99 };
  }

  function getFocusablesInSection(section) {
    if (!section) return [];
    return state.focusables.filter(function (el) {
      var s = getSection(el);
      return s && s.type === section.type && s.index === section.index;
    });
  }

  /* =========================================================
     NAVIGATION — DOWN goes to FIRST item of next row
     ========================================================= */
  function navDown() {
    var current = state.focusables[state.focus];
    if (!current) return;
    var section = getSection(current);
    if (!section) return;

    // Hero → first row
    if (section.type === 'hero') {
      var firstRow = document.querySelector('.row');
      if (firstRow) {
        var firstCard = firstRow.querySelector('[data-focusable="true"]');
        if (firstCard) { setFocus(state.focusables.indexOf(firstCard)); return; }
      }
    }
    // Nav → hero
    if (section.type === 'nav') {
      var hero = document.querySelector('.hero [data-focusable="true"]');
      if (hero) { setFocus(state.focusables.indexOf(hero)); return; }
    }
    // Row → next row FIRST item
    if (section.type === 'row') {
      var allRows = Array.prototype.slice.call(document.querySelectorAll('.row'));
      var nextRow = allRows[section.index - 2 + 1];
      if (nextRow) {
        var firstCard = nextRow.querySelector('[data-focusable="true"]');
        if (firstCard) { setFocus(state.focusables.indexOf(firstCard)); return; }
      }
    }
    // Detail hero buttons → overview
    if (section.type === 'detail-buttons') {
      var overview = document.querySelector('.overview-wrap [data-focusable="true"]');
      if (overview) { setFocus(state.focusables.indexOf(overview)); return; }
    }
    // Overview → cast
    if (section.type === 'detail-overview') {
      var cast = document.querySelector('.cast-wrap [data-focusable="true"]');
      if (cast) { setFocus(state.focusables.indexOf(cast)); return; }
    }
    // Cast → seasons (if TV)
    if (section.type === 'detail-cast') {
      var seasons = document.querySelector('.seasons-wrap [data-focusable="true"]');
      if (seasons) { setFocus(state.focusables.indexOf(seasons)); return; }
    }
    // Seasons → recommended
    if (section.type === 'detail-seasons') {
      var rec = document.querySelector('.recommended-wrap [data-focusable="true"]');
      if (rec) { setFocus(state.focusables.indexOf(rec)); return; }
    }
    // Recommended → similar
    if (section.type === 'detail-recommended') {
      var sim = document.querySelector('.similar-wrap [data-focusable="true"]');
      if (sim) { setFocus(state.focusables.indexOf(sim)); return; }
    }
  }

  function navUp() {
    var current = state.focusables[state.focus];
    if (!current) return;
    var section = getSection(current);
    if (!section) return;

    // Row → previous row (keep approximate index, or last if fewer)
    if (section.type === 'row') {
      var allRows = Array.prototype.slice.call(document.querySelectorAll('.row'));
      var prevRow = allRows[section.index - 2 - 1];
      if (prevRow) {
        var cards = Array.prototype.slice.call(prevRow.querySelectorAll('[data-focusable="true"]'));
        var target = cards[Math.min(cards.length - 1, 0)]; // go to first of prev row
        if (target) { setFocus(state.focusables.indexOf(target)); return; }
      }
      // First row → hero
      var hero = document.querySelector('.hero [data-focusable="true"]');
      if (hero) { setFocus(state.focusables.indexOf(hero)); return; }
    }
    // Hero → nav
    if (section.type === 'hero') {
      var nav = document.querySelector('.top-nav [data-focusable="true"]');
      if (nav) { setFocus(state.focusables.indexOf(nav)); return; }
    }
    // Overview → buttons
    if (section.type === 'detail-overview') {
      var btns = document.querySelector('.hero-buttons [data-focusable="true"]');
      if (btns) { setFocus(state.focusables.indexOf(btns)); return; }
    }
    // Cast → overview
    if (section.type === 'detail-cast') {
      var overview = document.querySelector('.overview-wrap [data-focusable="true"]');
      if (overview) { setFocus(state.focusables.indexOf(overview)); return; }
    }
    // Seasons → cast
    if (section.type === 'detail-seasons') {
      var cast = document.querySelector('.cast-wrap [data-focusable="true"]');
      if (cast) { setFocus(state.focusables.indexOf(cast)); return; }
    }
    // Recommended → seasons or cast
    if (section.type === 'detail-recommended') {
      var seasons = document.querySelector('.seasons-wrap [data-focusable="true"]');
      if (seasons) { setFocus(state.focusables.indexOf(seasons)); return; }
      var cast = document.querySelector('.cast-wrap [data-focusable="true"]');
      if (cast) { setFocus(state.focusables.indexOf(cast)); return; }
    }
    // Similar → recommended
    if (section.type === 'detail-similar') {
      var rec = document.querySelector('.recommended-wrap [data-focusable="true"]');
      if (rec) { setFocus(state.focusables.indexOf(rec)); return; }
    }
  }

  /* =========================================================
     BOOT SCREEN
     ========================================================= */
  function renderBoot() {
    state.route = 'boot';
    var screen = setScreen('boot-screen');
    screen.innerHTML = '<div class="splash-logo">Aether<span>TV</span></div><div class="splash-message">Loading your experience...</div>';
    api('/api/home').then(function (data) {
      state.home = data;
      state.ranked = (data.ranked || []).slice(0, 10);
      loadAuth();
      renderHome();
    }).catch(function (err) {
      var msg = screen.querySelector('.splash-message');
      if (msg) msg.textContent = 'Connection failed. Retrying...';
      console.error('Boot error:', err);
      setTimeout(renderBoot, 2000);
    });
  }

  /* =========================================================
     TOP NAVIGATION — Glass Surface
     ========================================================= */
  function renderTopNav(screen) {
    var nav = el('nav', 'top-nav');
    var left = el('div', 'nav-left');
    var logo = el('div', 'nav-logo');
    logo.innerHTML = 'Aether<span>TV</span>';
    left.appendChild(logo);

    var tabs = el('div', 'nav-tabs');
    var items = [
      { label: 'Home', route: 'home' },
      { label: 'Movies', route: 'movies' },
      { label: 'TV Shows', route: 'tv' },
      { label: 'Live TV', route: 'live' },
      { label: 'Categories', route: 'categories' }
    ];
    items.forEach(function (item) {
      var tab = el('button', 'nav-tab' + (state.route === item.route ? ' active' : ''), item.label);
      tab.setAttribute('data-focusable', 'true');
      tab.tabIndex = -1;
      tab.onclick = function () { if (item.route === 'home') renderHome(); else if (item.route === 'movies') renderCategory('movie'); else if (item.route === 'tv') renderCategory('tv'); else if (item.route === 'live') renderLive(); else if (item.route === 'categories') renderCategories(); };
      tabs.appendChild(tab);
    });
    left.appendChild(tabs);
    nav.appendChild(left);

    var right = el('div', 'nav-right');
    var searchBtn = el('button', 'nav-icon');
    searchBtn.innerHTML = svgIcon('search', 20);
    searchBtn.setAttribute('data-focusable', 'true');
    searchBtn.tabIndex = -1;
    searchBtn.onclick = renderSearch;
    right.appendChild(searchBtn);

    var settingsBtn = el('button', 'nav-icon');
    settingsBtn.innerHTML = svgIcon('settings', 20);
    settingsBtn.setAttribute('data-focusable', 'true');
    settingsBtn.tabIndex = -1;
    settingsBtn.onclick = renderSettings;
    right.appendChild(settingsBtn);

    nav.appendChild(right);
    screen.appendChild(nav);
  }

  /* =========================================================
     HOME SCREEN — Hero + Rows
     ========================================================= */
  function renderHome() {
    rememberFocus(); clearIdleTimer(); state.route = 'home';
    var screen = setScreenWithNav('cinematic');
    var home = state.home || { featured: [], rows: [] };

    if (home.featured && home.featured.length) {
      renderHero(screen, home.featured);
    }

    // Continue Watching
    var continueWatching = (state.history || []).slice(0, 12);
    if (continueWatching.length) {
      renderLandscapeRow(screen, 'Continue Watching', continueWatching);
    }

    // Top 10
    if (state.ranked && state.ranked.length) {
      renderTop10Row(screen, 'Top 10 This Week', state.ranked);
    }

    // Regular rows
    (home.rows || []).forEach(function (row) {
      var title = row.title || '';
      var isLandscape = /in theaters|netflix|trending|continue watching/i.test(title);
      if (isLandscape) {
        renderLandscapeRow(screen, title, row.items || []);
      } else {
        renderPortraitRow(screen, title, row.items || []);
      }
    });

    registerFocusables(screen, state.focusMemory['home'] || 0);
    resetIdleTimer();
  }

  /* =========================================================
     HERO — Floating Poster Card, 40/60 Layout
     ========================================================= */
  function renderHero(screen, featured) {
    var hero = el('section', 'hero');
    var idx = state.heroIndex % featured.length;
    var item = featured[idx];
    state.current = item;

    // Layer 1: Backdrop
    var heroBackdrop = el('div', 'hero-backdrop');
    heroBackdrop.style.backgroundImage = 'url(' + esc(backdrop(item)) + ')';
    hero.appendChild(heroBackdrop);

    // Layer 2: Left gradient
    hero.appendChild(el('div', 'hero-gradient-left'));

    // Layer 3: Bottom radial
    hero.appendChild(el('div', 'hero-gradient-bottom'));

    // Layer 4: Vignette
    hero.appendChild(el('div', 'hero-vignette'));

    // Inner container
    var inner = el('div', 'hero-inner');
    inner.setAttribute('data-focusable', 'true');
    inner.tabIndex = -1;
    inner.onclick = function () { renderDetails(item.id); };

    // Left 40% — Info
    var info = el('div', 'hero-info');

    // Metadata line
    var meta = el('div', 'hero-meta');
    var badgeParts = [];
    if (item.rating) badgeParts.push('<span class="rating-badge-hero">' + svgIcon('star', 14) + ' ' + esc(item.rating) + '</span>');
    if (item.year) badgeParts.push(esc(item.year));
    if (item.type) badgeParts.push(esc(item.type === 'tv' ? 'TV Series' : 'Movie'));
    if (item.runtimeMinutes) badgeParts.push(runtime(item));
    meta.innerHTML = badgeParts.join('<span class="meta-sep"> • </span>');
    info.appendChild(meta);

    // Title
    var h1 = el('h1', 'hero-title', esc(item.title || 'Untitled'));
    info.appendChild(h1);

    // Overview
    if (item.overview) {
      var overview = el('p', 'hero-overview', esc(item.overview));
      info.appendChild(overview);
    }

    // Buttons
    var btnRow = el('div', 'hero-buttons');
    var playBtn = el('button', 'btn-pill primary');
    playBtn.innerHTML = svgIcon('play', 20) + '<span>Play</span>';
    playBtn.onclick = function () { playMedia(item); };
    btnRow.appendChild(playBtn);

    var infoBtn = el('button', 'btn-pill secondary');
    infoBtn.innerHTML = svgIcon('info', 20) + '<span>More Info</span>';
    infoBtn.onclick = function () { renderDetails(item.id); };
    btnRow.appendChild(infoBtn);

    var favBtn = el('button', 'btn-pill secondary');
    var isFav = isFavorite(item.id);
    favBtn.innerHTML = svgIcon(isFav ? 'heart' : 'plus', 20);
    favBtn.onclick = function () { toggleFavorite(item.id); };
    btnRow.appendChild(favBtn);
    info.appendChild(btnRow);

    // Age rating badge — bottom-right of hero info
    if (item.ageRating && item.ageRating !== 'Unrated') {
      var ageBadge = el('div', 'hero-age-badge', esc(item.ageRating));
      info.appendChild(ageBadge);
    }

    inner.appendChild(info);

    // Right 60% — Floating Poster
    var artwork = el('div', 'hero-artwork');
    var posterCard = el('div', 'hero-poster-card');
    var posterImg = el('img');
    posterImg.src = poster(item);
    posterImg.alt = esc(item.title || '');
    posterImg.onerror = function () { this.style.display = 'none'; posterCard.classList.add('no-poster'); };
    posterCard.appendChild(posterImg);
    artwork.appendChild(posterCard);
    inner.appendChild(artwork);

    hero.appendChild(inner);

    // Dots
    if (featured.length > 1) {
      var dots = el('div', 'hero-dots');
      featured.forEach(function (_, i) {
        var dot = el('button', 'hero-dot' + (i === idx ? ' active' : ''));
        dot.onclick = function () { state.heroIndex = i; renderHome(); };
        dots.appendChild(dot);
      });
      hero.appendChild(dots);
    }

    screen.appendChild(hero);
    startHeroTimer(featured);
  }

  function startHeroTimer(featured) {
    if (state.heroTimer) clearInterval(state.heroTimer);
    state.heroTimer = setInterval(function () {
      state.heroIndex = (state.heroIndex + 1) % featured.length;
      renderHome();
    }, 8000);
  }

  /* =========================================================
     ROWS — Portrait, Landscape, Top 10
     ========================================================= */
  function renderPortraitRow(screen, title, items) {
    if (!items.length) return;
    renderRow(screen, title, items, 'portrait');
  }

  function renderLandscapeRow(screen, title, items) {
    if (!items.length) return;
    renderRow(screen, title, items, 'landscape');
  }

  function renderRow(screen, title, items, type) {
    var row = el('div', 'row');
    var header = el('div', 'row-header');
    header.appendChild(el('h2', 'row-title', esc(title)));
    row.appendChild(header);

    var wrap = el('div', 'row-wrap');
    var leftArrow = el('button', 'row-arrow');
    leftArrow.innerHTML = svgIcon('chevron-left', 20);
    leftArrow.setAttribute('data-focusable', 'true');
    leftArrow.tabIndex = -1;
    leftArrow.onclick = function () { rowEl.scrollBy({ left: -600, behavior: 'smooth' }); };
    wrap.appendChild(leftArrow);

    var rowEl = el('div', 'card-row');
    items.forEach(function (item) {
      var card;
      if (type === 'landscape') {
        card = renderLandscapeCard(item);
      } else {
        card = renderPortraitCard(item);
      }
      rowEl.appendChild(card);
    });
    wrap.appendChild(rowEl);

    var rightArrow = el('button', 'row-arrow');
    rightArrow.innerHTML = svgIcon('chevron-right', 20);
    rightArrow.setAttribute('data-focusable', 'true');
    rightArrow.tabIndex = -1;
    rightArrow.onclick = function () { rowEl.scrollBy({ left: 600, behavior: 'smooth' }); };
    wrap.appendChild(rightArrow);

    row.appendChild(wrap);
    screen.appendChild(row);
  }

  function renderPortraitCard(item) {
    var card = el('div', 'card');
    card.dataset.id = item.id;
    card.dataset.backdrop = backdrop(item);

    var wrap = el('div', 'poster-wrap');
    wrap.setAttribute('data-focusable', 'true');
    wrap.tabIndex = -1;
    var img = el('img', 'poster');
    img.src = poster(item);
    img.alt = esc(item.title || '');
    img.loading = 'lazy';
    img.onerror = function () { this.style.display = 'none'; wrap.classList.add('no-poster'); wrap.innerHTML = '<div class="poster-fallback"><span>' + esc(item.title || '') + '</span></div>'; };
    wrap.appendChild(img);

    // Progress bar for continue watching
    if (item.progress) {
      var progress = el('div', 'mini-progress');
      progress.innerHTML = '<span style="width:' + Math.round(item.progress * 100) + '%"></span>';
      wrap.appendChild(progress);
    }

    card.appendChild(wrap);

    // Card info — NOT focusable, stays static
    var info = el('div', 'card-info');
    info.appendChild(el('div', 'card-title', esc(item.title || '')));
    var metaParts = [];
    if (item.year) metaParts.push(item.year);
    if (item.type) metaParts.push(item.type === 'tv' ? 'TV' : 'Movie');
    if (metaParts.length) {
      info.appendChild(el('div', 'card-meta', metaParts.join(' • ')));
    }
    card.appendChild(info);

    wrap.onclick = function () { renderDetails(item.id); };
    return card;
  }
  function renderLandscapeCard(item) {
    var card = el('div', 'card-landscape');
    card.dataset.id = item.id;
    card.dataset.backdrop = backdrop(item);

    var wrap = el('div', 'landscape-wrap');
    wrap.setAttribute('data-focusable', 'true');
    wrap.tabIndex = -1;
    var img = el('img');
    img.src = wsrv(item.backdrop || item.poster || item.logo || '');
    img.alt = esc(item.title || '');
    img.loading = 'lazy';
    img.onerror = function () { this.style.display = 'none'; };
    wrap.appendChild(img);

    var overlay = el('div', 'landscape-overlay');
    overlay.appendChild(el('div', 'landscape-title', esc(item.title || '')));
    var metaParts = [];
    if (item.year) metaParts.push(item.year);
    if (item.runtimeMinutes) metaParts.push(runtime(item));
    if (metaParts.length) {
      overlay.appendChild(el('div', 'landscape-meta', metaParts.join(' • ')));
    }
    // Progress bar
    if (item.progress) {
      var progress = el('div', 'mini-progress');
      progress.innerHTML = '<span style="width:' + Math.round(item.progress * 100) + '%"></span>';
      overlay.appendChild(progress);
    }
    wrap.appendChild(overlay);
    card.appendChild(wrap);

    wrap.onclick = function () { renderDetails(item.id); };
    return card;
  }
  /* =========================================================
     TOP 10 ROW — Netflix Style
     ========================================================= */
  function renderTop10Row(screen, title, items) {
    var row = el('div', 'row');
    var header = el('div', 'row-header');
    header.appendChild(el('h2', 'row-title', esc(title)));
    row.appendChild(header);

    var wrap = el('div', 'row-wrap');
    var leftArrow = el('button', 'row-arrow');
    leftArrow.innerHTML = svgIcon('chevron-left', 20);
    leftArrow.setAttribute('data-focusable', 'true');
    leftArrow.tabIndex = -1;
    wrap.appendChild(leftArrow);

    var rowEl = el('div', 'card-row');
    items.forEach(function (item, i) {
      var card = el('div', 'top10-card');
      card.dataset.id = item.id;

      var number = el('div', 'top10-number', String(i + 1));
      card.appendChild(number);

      var wrap2 = el('div', 'poster-wrap');
      wrap2.setAttribute('data-focusable', 'true');
      wrap2.tabIndex = -1;
      var img = el('img', 'poster');
      img.src = poster(item);
      img.alt = esc(item.title || '');
      img.loading = 'lazy';
      img.onerror = function () { this.style.display = 'none'; wrap2.classList.add('no-poster'); wrap2.innerHTML = '<div class="poster-fallback"><span>' + esc(item.title || '') + '</span></div>'; };
      wrap2.appendChild(img);
      card.appendChild(wrap2);

      wrap2.onclick = function () { renderDetails(item.id); };
      rowEl.appendChild(card);
    });
    wrap.appendChild(rowEl);

    var rightArrow = el('button', 'row-arrow');
    rightArrow.innerHTML = svgIcon('chevron-right', 20);
    rightArrow.setAttribute('data-focusable', 'true');
    rightArrow.tabIndex = -1;
    wrap.appendChild(rightArrow);

    row.appendChild(wrap);
    screen.appendChild(row);
  }

  /* =========================================================
     DETAIL SCREEN — Correct Focus Order
     ========================================================= */
  function renderDetails(id) {
    rememberFocus(); clearIdleTimer(); state.route = 'details';
    var screen = setScreenWithNav('cinematic');

    Promise.all([
      api('/api/media/' + id),
      api('/api/playback/' + id),
      api('/api/similar/' + id),
      api('/api/media/' + id + '/rating').catch(function () { return { rating: null }; })
    ]).then(function (results) {
      var item = results[0];
      item.sources = results[1].sources || [];
      state.similar = results[2].similar || [];
      item.ageRating = results[3].rating;
      state.current = item;

      // Trailer
      var hasTrailer = item.trailerUrl && item.trailerUrl.includes('youtube');
      var trailerWrap, trailerPoster, muteBtn;

      if (hasTrailer) {
        trailerWrap = el('div', 'trailer-iframe-wrap');
        var iframe = el('iframe');
        iframe.src = item.trailerUrl + (item.trailerUrl.includes('?') ? '&' : '?') + 'autoplay=1&mute=1&controls=0&modestbranding=1&rel=0&playsinline=1&iv_load_policy=3&fs=0&disablekb=1&endscreen=0&enablejsapi=1';
        iframe.allow = 'autoplay; encrypted-media';
        trailerWrap.appendChild(iframe);

        trailerPoster = el('div', 'trailer-poster');
        trailerPoster.style.backgroundImage = 'url(' + esc(backdrop(item)) + ')';

        muteBtn = el('button', 'mute-icon');
        muteBtn.innerHTML = svgIcon('mute', 20);
        muteBtn.style.display = 'none';
        muteBtn.onclick = function () {
          state.heroMuted = !state.heroMuted;
          muteBtn.innerHTML = svgIcon(state.heroMuted ? 'mute' : 'unmute', 20);
          var ifr = trailerWrap.querySelector('iframe');
          if (ifr) {
            ifr.contentWindow.postMessage('{"event":"command","func":"' + (state.heroMuted ? 'mute' : 'unMute') + '","args":""}', '*');
          }
        };

        setTimeout(function () {
          if (trailerWrap) trailerWrap.classList.add('active');
          setTimeout(function () { if (trailerPoster) trailerPoster.classList.add('hidden'); }, 1500);
        }, 500);
      }

      // Detail hero
      var hero = el('div', 'detail-hero');
      var dBackdrop = el('div', 'detail-backdrop');
      dBackdrop.style.backgroundImage = 'url(' + esc(backdrop(item)) + ')';
      hero.appendChild(dBackdrop);
      hero.appendChild(el('div', 'detail-fade'));

      var heroContent = el('div', 'detail-hero-content');

      // Title
      heroContent.appendChild(el('h1', 'detail-title', esc(item.title || 'Untitled')));

      // Meta
      var meta = el('div', 'detail-meta');
      var metaParts = [];
      if (item.rating) metaParts.push('<span class="rating">' + svgIcon('star', 14) + ' ' + esc(item.rating) + '</span>');
      if (item.year) metaParts.push(esc(item.year));
      if (item.type) metaParts.push(esc(item.type === 'tv' ? 'TV Series' : 'Movie'));
      if (item.runtimeMinutes) metaParts.push(runtime(item));
      meta.innerHTML = metaParts.join('<span class="meta-sep"> • </span>');
      heroContent.appendChild(meta);

      // Overview
      if (item.overview) {
        var overviewWrap = el('div', 'overview-wrap');
        var overview = el('p', 'detail-overview', esc(item.overview));
        overview.setAttribute('data-focusable', 'true');
        overview.tabIndex = -1;
        overviewWrap.appendChild(overview);
        heroContent.appendChild(overviewWrap);
      }

      // Buttons
      var btnRow = el('div', 'hero-buttons');
      var playBtn = el('button', 'btn-pill primary');
      playBtn.innerHTML = svgIcon('play', 20) + '<span>Play</span>';
      playBtn.setAttribute('data-focusable', 'true');
      playBtn.tabIndex = -1;
      playBtn.onclick = function () { playMedia(item); };
      btnRow.appendChild(playBtn);

      var favBtn = el('button', 'btn-pill secondary');
      var isFav = isFavorite(item.id);
      favBtn.innerHTML = svgIcon(isFav ? 'heart' : 'plus', 20) + '<span>' + (isFav ? 'Favourited' : 'My List') + '</span>';
      favBtn.setAttribute('data-focusable', 'true');
      favBtn.tabIndex = -1;
      favBtn.onclick = function () { toggleFavorite(item.id); };
      btnRow.appendChild(favBtn);

      var trailerBtn = el('button', 'btn-pill secondary');
      trailerBtn.innerHTML = svgIcon('play', 20) + '<span>Trailer</span>';
      trailerBtn.setAttribute('data-focusable', 'true');
      trailerBtn.tabIndex = -1;
      trailerBtn.onclick = function () {
        if (item.trailerUrl) window.open(item.trailerUrl, '_blank');
      };
      btnRow.appendChild(trailerBtn);
      heroContent.appendChild(btnRow);

      // Age rating badge
      if (item.ageRating && item.ageRating !== 'Unrated') {
        var ageBadge = el('div', 'hero-age-badge', esc(item.ageRating));
        heroContent.appendChild(ageBadge);
      }

      hero.appendChild(heroContent);
      if (trailerWrap) hero.appendChild(trailerWrap);
      if (trailerPoster) hero.appendChild(trailerPoster);
      // Back button — FIRST in DOM order for focus
      var back = el('button', 'back-btn');
      back.innerHTML = svgIcon('back', 22);
      back.setAttribute('data-focusable', 'true');
      back.tabIndex = -1;
      back.onclick = function () { window.history.back(); };
      screen.appendChild(back);

      screen.appendChild(hero);
      if (muteBtn) screen.appendChild(muteBtn);

      // Detail body
      var body = el('div', 'detail-body');

      // Cast
      if (item.cast && item.cast.length) {
        var castWrap = el('div', 'cast-wrap');
        var castTitle = el('h2', 'row-title', 'Cast');
        castWrap.appendChild(castTitle);
        var castRow = el('div', 'cast-row');
        item.cast.forEach(function (actor) {
          var member = el('div', 'cast-member');
          member.setAttribute('data-focusable', 'true');
          member.tabIndex = -1;
          var avatar = el('img', 'cast-avatar');
          avatar.src = wsrv(actor.photo || '');
          avatar.alt = esc(actor.name || '');
          avatar.onerror = function () { this.style.display = 'none'; };
          member.appendChild(avatar);
          member.appendChild(el('div', 'cast-name', esc(actor.name || '')));
          castRow.appendChild(member);
        });
        castWrap.appendChild(castRow);
        body.appendChild(castWrap);
      }

      // Seasons (TV only)
      if (item.type === 'tv') {
        loadTvSeasons(item.id, body);
      }

      // Recommended
      if (state.similar.length) {
        var recWrap = el('div', 'recommended-wrap');
        renderPortraitRow(recWrap, 'Recommended', state.similar);
        body.appendChild(recWrap);
      }

      // Similar
      if (state.similar.length > 6) {
        var simWrap = el('div', 'similar-wrap');
        renderPortraitRow(simWrap, 'Similar Titles', state.similar.slice(6));
        body.appendChild(simWrap);
      }

      screen.appendChild(body);
      registerFocusables(screen, 0);
    }).catch(function (err) {
      console.error('Details error:', err);
      renderHome();
    });
  }

  function loadTvSeasons(id, body) {
    api('/api/tv/' + id + '/seasons').then(function (data) {
      state.tvSeasons = data.seasons || [];
      if (!state.tvSeasons.length) return;

      var seasonsWrap = el('div', 'seasons-wrap');
      seasonsWrap.appendChild(el('h2', 'row-title', 'Seasons & Episodes'));

      var selector = el('div', 'season-selector');
      state.tvSeasons.forEach(function (season, idx) {
        var tab = el('button', 'season-tab' + (idx === 0 ? ' active' : ''), 'Season ' + season.number);
        tab.setAttribute('data-focusable', 'true');
        tab.tabIndex = -1;
        tab.onclick = function () {
          Array.prototype.slice.call(selector.querySelectorAll('.season-tab')).forEach(function (t) { t.classList.remove('active'); });
          tab.classList.add('active');
          loadTvEpisodes(id, season.number, episodeList);
        };
        selector.appendChild(tab);
      });
      seasonsWrap.appendChild(selector);

      var episodeList = el('div', 'episode-list');
      seasonsWrap.appendChild(episodeList);
      body.appendChild(seasonsWrap);

      loadTvEpisodes(id, state.tvSeasons[0].number, episodeList);
    }).catch(function () {});
  }

  function loadTvEpisodes(id, seasonNumber, container) {
    api('/api/tv/' + id + '/season/' + seasonNumber).then(function (data) {
      state.tvEpisodes = data.episodes || [];
      container.innerHTML = '';
      state.tvEpisodes.forEach(function (ep) {
        var card = el('div', 'episode-card');
        card.setAttribute('data-focusable', 'true');
        card.tabIndex = -1;

        var thumb = el('img', 'episode-thumb');
        thumb.src = wsrv(ep.thumbnail || '');
        thumb.onerror = function () { this.style.display = 'none'; };
        card.appendChild(thumb);

        var info = el('div', 'episode-info');
        info.appendChild(el('h4', '', 'E' + ep.number + ': ' + esc(ep.title || '')));
        if (ep.overview) info.appendChild(el('p', '', esc(ep.overview)));
        card.appendChild(info);

        card.onclick = function () { playMedia({ id: ep.id, title: ep.title, sources: ep.sources || [] }); };
        container.appendChild(card);
      });

      // Re-register focusables to include new episodes
      var screen = document.querySelector('.screen');
      if (screen) registerFocusables(screen, state.focus);
    }).catch(function () {});
  }

  /* =========================================================
     PLAYER
     ========================================================= */
  function playMedia(item) {
    if (!item.sources || !item.sources.length) return;
    var src = item.sources[0].url;
    state.overlay = el('div', 'player-overlay');
    var video = el('video');
    video.src = src;
    video.autoplay = true;
    video.controls = true;
    state.player = video;
    state.overlay.appendChild(video);
    document.body.appendChild(state.overlay);
    video.focus();
    video.requestFullscreen && video.requestFullscreen();
    video.onended = function () { closePlayer(); };
  }

  function closePlayer() {
    if (state.player) { state.player.pause(); state.player.src = ''; }
    if (state.overlay) { state.overlay.remove(); state.overlay = null; }
    state.player = null;
    document.exitFullscreen && document.exitFullscreen();
  }

  /* =========================================================
     SEARCH
     ========================================================= */
  function renderSearch() {
    rememberFocus(); clearIdleTimer(); state.route = 'search';
    var screen = setScreenWithNav('');
    var overlay = el('div', 'search-overlay');

    var input = el('input', 'search-input');
    input.placeholder = 'Search movies, TV shows...';
    input.value = state.searchQuery || '';
    overlay.appendChild(input);

    var results = el('div', 'search-results');
    overlay.appendChild(results);
    screen.appendChild(overlay);

    function doSearch(q) {
      if (!q) { results.innerHTML = ''; return; }
      api('/api/search?q=' + encodeURIComponent(q)).then(function (data) {
        results.innerHTML = '';
        (data.results || []).forEach(function (item) {
          results.appendChild(renderPortraitCard(item));
        });
      }).catch(function () {});
    }

    input.oninput = function () { state.searchQuery = input.value; doSearch(input.value); };
    if (state.searchQuery) doSearch(state.searchQuery);

    registerFocusables(screen, 0);
  }

  /* =========================================================
     SETTINGS / CATEGORIES / LIVE TV
     ========================================================= */
  function renderSettings() {
    rememberFocus(); clearIdleTimer(); state.route = 'settings';
    var screen = setScreenWithNav('');
    var panel = el('div', 'settings-panel');
    panel.appendChild(el('h2', '', 'Settings'));
    var providers = el('div', '');
    api('/api/providers').then(function (data) {
      providers.innerHTML = '<p>Providers configured: ' + (data.providers || []).length + '</p>';
    }).catch(function () {});
    panel.appendChild(providers);
    screen.appendChild(panel);
    registerFocusables(screen, 0);
  }

  function renderCategories() {
    rememberFocus(); clearIdleTimer(); state.route = 'categories';
    var screen = setScreenWithNav('');
    var grid = el('div', 'category-grid');
    var cats = ['Action', 'Comedy', 'Drama', 'Horror', 'Sci-Fi', 'Documentary', 'Animation', 'Thriller'];
    cats.forEach(function (cat) {
      var card = el('div', 'category-card', cat);
      card.setAttribute('data-focusable', 'true');
      card.tabIndex = -1;
      card.onclick = function () { renderCategory(cat.toLowerCase()); };
      grid.appendChild(card);
    });
    screen.appendChild(grid);
    registerFocusables(screen, 0);
  }

  function renderCategory(cat) {
    rememberFocus(); clearIdleTimer(); state.route = 'category-' + cat;
    var screen = setScreenWithNav('');
    api('/api/category/' + encodeURIComponent(cat)).then(function (data) {
      var grid = el('div', 'poster-grid');
      (data.items || []).forEach(function (item) {
        grid.appendChild(renderPortraitCard(item));
      });
      screen.appendChild(grid);
      registerFocusables(screen, 0);
    }).catch(function () {
      screen.appendChild(el('p', '', 'Error loading category'));
      registerFocusables(screen, 0);
    });
  }

  function renderLive() {
    rememberFocus(); clearIdleTimer(); state.route = 'live';
    var screen = setScreenWithNav('');
    api('/api/live').then(function (data) {
      var grid = el('div', 'channel-grid');
      (data.channels || []).forEach(function (ch) {
        var card = el('div', 'channel-card');
        card.setAttribute('data-focusable', 'true');
        card.tabIndex = -1;
        if (ch.logo) {
          var img = el('img');
          img.src = wsrv(ch.logo);
          img.onerror = function () { this.style.display = 'none'; };
          card.appendChild(img);
        }
        card.appendChild(el('div', '', esc(ch.name || '')));
        card.onclick = function () { playMedia(ch); };
        grid.appendChild(card);
      });
      screen.appendChild(grid);
      registerFocusables(screen, 0);
    }).catch(function () {
      screen.appendChild(el('p', '', 'Error loading live TV'));
      registerFocusables(screen, 0);
    });
  }

  /* =========================================================
     IDLE SCREEN
     ========================================================= */
  function renderIdle() {
    rememberFocus(); clearIdleTimer(); state.route = 'idle';
    var screen = setScreen('idle-screen');
    var bg = el('div', 'idle-bg');
    bg.style.backgroundImage = 'url(' + esc(backdrop(state.current || { backdrop: '' })) + ')';
    screen.appendChild(bg);
    screen.appendChild(el('div', 'idle-overlay'));
    var clock = el('div', 'idle-clock');
    function tick() { clock.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
    tick();
    state.idleTimer = setInterval(tick, 60000);
    screen.appendChild(clock);
  }

  function startIdleTimer() {
    if (state.idleScreenTimer) clearTimeout(state.idleScreenTimer);
    state.idleScreenTimer = setTimeout(function () {
      if (state.route === 'home' || state.route === 'details') renderIdle();
    }, 300000);
  }
  function clearIdleTimer() {
    if (state.idleTimer) clearInterval(state.idleTimer);
    if (state.idleScreenTimer) clearTimeout(state.idleScreenTimer);
  }
  function resetIdleTimer() { clearIdleTimer(); startIdleTimer(); }

  /* =========================================================
     KEYBOARD / REMOTE HANDLER
     ========================================================= */
  document.addEventListener('keydown', function (e) {
    var key = e.key;
    var current = state.focusables[state.focus];

    if (key === 'Enter') {
      e.preventDefault();
      if (current && current.click) current.click();
      return;
    }
    if (key === 'Escape') {
      e.preventDefault();
      if (state.overlay) closePlayer();
      else if (state.route !== 'home') renderHome();
      return;
    }
    if (key === 'ArrowRight') {
      e.preventDefault();
      if (current && current.closest('.hero-inner')) {
        // Hero slide navigation
        var featured = state.home && state.home.featured;
        if (featured && featured.length > 1) {
          state.heroIndex = (state.heroIndex + 1) % featured.length;
          renderHome();
        }
        return;
      }
      if (current && current.closest('.card-row')) {
        var rowCards = Array.prototype.slice.call(current.parentElement.querySelectorAll('[data-focusable="true"]'));
        var idx = rowCards.indexOf(current);
        if (idx < rowCards.length - 1) setFocus(state.focusables.indexOf(rowCards[idx + 1]));
      } else if (state.focus < state.focusables.length - 1) {
        setFocus(state.focus + 1);
      }
    }
    else if (key === 'ArrowLeft') {
      e.preventDefault();
      if (current && current.closest('.hero-inner')) {
        // Hero slide navigation
        var featured = state.home && state.home.featured;
        if (featured && featured.length > 1) {
          state.heroIndex = (state.heroIndex - 1 + featured.length) % featured.length;
          renderHome();
        }
        return;
      }
      if (current && current.closest('.card-row')) {
        var rowCards = Array.prototype.slice.call(current.parentElement.querySelectorAll('[data-focusable="true"]'));
        var idx = rowCards.indexOf(current);
        if (idx > 0) setFocus(state.focusables.indexOf(rowCards[idx - 1]));
      } else if (state.focus > 0) {
        setFocus(state.focus - 1);
      }
    }
    else if (key === 'ArrowDown') {
      e.preventDefault();
      navDown();
    }
    else if (key === 'ArrowUp') {
      e.preventDefault();
      navUp();
    }
  });

  /* =========================================================
     INIT
     ========================================================= */
  detectCapabilities();
  renderBoot();
})();