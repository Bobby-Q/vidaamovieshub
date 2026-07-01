(function () {
  var app = document.getElementById('app');
  var state = {
    route: 'boot', home: null, current: null, sources: [], activeSourceIndex: 0,
    focus: 0, focusables: [], focusMemory: {}, player: null, overlay: null, controlsVisible: true,
    capabilities: {}, searchQuery: '', liveCategory: '', liveCategories: [], sidebarOpen: false,
    categories: [], auth: null, history: [], heroIndex: 0, heroTimer: null,
    likes: {}, ranked: null, likeCounts: {}, similar: [], tvSeasons: [], tvEpisodes: []
  };

  function api(path) { return fetch(path).then(function (res) { if (!res.ok) throw new Error('API failed: ' + path); return res.json(); }); }
  function apiPost(path, body) { return fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(function (res) { return res.json(); }); }
  function apiAuth(path) { var headers = { 'Accept': 'application/json' }; if (state.auth && state.auth.token) headers['Authorization'] = 'Bearer ' + state.auth.token; return fetch(path, { headers: headers }).then(function (res) { return res.json(); }); }
  function apiAuthPost(path, body) { var headers = { 'Content-Type': 'application/json' }; if (state.auth && state.auth.token) headers['Authorization'] = 'Bearer ' + state.auth.token; return fetch(path, { method: 'POST', headers: headers, body: JSON.stringify(body) }).then(function (res) { return res.json(); }); }
  function el(tag, className, text) { var node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; }
  function esc(value) { return String(value === undefined || value === null ? '' : value).replace(/[&<>"']/g, function (char) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]; }); }
  function wsrv(url) { if (!url) return ''; if (url.startsWith('data:')) return url; return 'https://wsrv.nl/?url=' + encodeURIComponent(url) + '&output=webp&q=50&n=-1'; }
  function poster(item) { return wsrv(item.poster || item.logo || ''); }
  function backdrop(item) { return wsrv(item.backdrop || item.logo || ''); }
  function rating(item) { return item.type === 'live' ? 'LIVE' : (item.rating ? '★ ' + item.rating : '★★★★☆'); }
  function runtime(item) { return item.type === 'live' ? '24/7' : ((item.runtimeMinutes || 96) > 59 ? Math.floor((item.runtimeMinutes || 96) / 60) + 'h ' + ((item.runtimeMinutes || 96) % 60) + 'm' : (item.runtimeMinutes || 96) + 'm'); }
  function setScreen(className) { app.innerHTML = ''; var screen = el('main', 'screen ' + (className || '')); app.appendChild(screen); return screen; }
  function setScreenWithNav(className) { var screen = setScreen(className); renderTopNav(screen); screen.addEventListener('scroll', function () { var nav = document.querySelector('.top-nav'); if (!nav) return; var st = screen.scrollTop; var last = screen._lastScrollTop || 0; if (st > last && st > 80) { nav.classList.add('nav-hidden'); } else if (st < last) { nav.classList.remove('nav-hidden'); } screen._lastScrollTop = st; }); return screen; }

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
    var node = state.focusables[state.focus]; node.classList.add('focused');
    var screen = document.querySelector('.screen');
    if (screen && node.closest && node.closest('.hero')) {
      screen.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (screen && node.closest && node.closest('.detail-hero')) {
      if (node.closest('.button-row')) {
        screen.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        node.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      }
    } else {
      node.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
    if (node.dataset.backdrop) document.documentElement.style.setProperty('--ambient-bg', 'url(' + node.dataset.backdrop + ')');
  }
  function registerFocusables(screen, initial) { state.focusables = Array.prototype.slice.call(screen.querySelectorAll('[data-focusable="true"]')); setFocus(initial || 0); }

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
      if (el.closest('.button-row')) return { type: 'detail-buttons', index: 10 };
    }
    if (el.closest('.detail-body')) {
      if (el.closest('.recommended-wrap')) return { type: 'detail-recommended', index: 11 };
      if (el.closest('.similar-wrap')) return { type: 'detail-similar', index: 12 };
      if (el.closest('.source-list')) return { type: 'detail-sources', index: 13 };
      if (el.closest('.season-selector')) return { type: 'detail-seasons', index: 14 };
      if (el.closest('.episode-list')) return { type: 'detail-episodes', index: 15 };
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

  function moveFocus(direction) {
    var current = state.focusables[state.focus];
    if (!current) return;
    var section = getSection(current);
    var sectionEls = getFocusablesInSection(section);
    var sectionIdx = sectionEls.indexOf(current);

    if (direction === 'right' || direction === 'left') {
      if (section.type === 'nav') {
        var next = sectionIdx + (direction === 'right' ? 1 : -1);
        if (next >= 0 && next < sectionEls.length) setFocus(state.focusables.indexOf(sectionEls[next]));
      } else if (section.type === 'hero') {
        if (current.dataset.action === 'play-featured' && direction === 'left') {
          var details = sectionEls.find(function (el) { return el.dataset.action === 'details'; });
          if (details) setFocus(state.focusables.indexOf(details));
        } else if (current.dataset.action === 'details' && direction === 'left') {
          prevHeroSlide();
        } else if (current.dataset.action === 'details' && direction === 'right') {
          var play = sectionEls.find(function (el) { return el.dataset.action === 'play-featured'; });
          if (play) setFocus(state.focusables.indexOf(play));
        } else if (current.dataset.action === 'play-featured' && direction === 'right') {
          nextHeroSlide();
        } else {
          var next2 = sectionIdx + (direction === 'right' ? 1 : -1);
          if (next2 >= 0 && next2 < sectionEls.length) setFocus(state.focusables.indexOf(sectionEls[next2]));
        }
      } else if (section.type === 'row' || section.type === 'detail-recommended' || section.type === 'detail-similar' || section.type === 'detail-episodes') {
        var next3 = sectionIdx + (direction === 'right' ? 1 : -1);
        if (next3 >= 0 && next3 < sectionEls.length) setFocus(state.focusables.indexOf(sectionEls[next3]));
      } else if (section.type === 'detail-back') {
        if (direction === 'right') {
          var mute = state.focusables.find(function (el) { return getSection(el).type === 'detail-mute'; });
          if (mute) setFocus(state.focusables.indexOf(mute));
        }
      } else if (section.type === 'detail-mute') {
        if (direction === 'left') {
          var back = state.focusables.find(function (el) { return getSection(el).type === 'detail-back'; });
          if (back) setFocus(state.focusables.indexOf(back));
        }
      } else if (section.type === 'detail-seasons') {
        var next4 = sectionIdx + (direction === 'right' ? 1 : -1);
        if (next4 >= 0 && next4 < sectionEls.length) setFocus(state.focusables.indexOf(sectionEls[next4]));
      } else {
        var next5 = sectionIdx + (direction === 'right' ? 1 : -1);
        if (next5 >= 0 && next5 < sectionEls.length) setFocus(state.focusables.indexOf(sectionEls[next5]));
      }
    } else if (direction === 'down' || direction === 'up') {
      var delta = direction === 'down' ? 1 : -1;
      var targetType = section.type;
      var targetIndex = section.index;

      if (section.type === 'nav') {
        targetType = 'hero';
        targetIndex = 1;
      } else if (section.type === 'hero') {
        if (delta === -1) { targetType = 'nav'; targetIndex = 0; }
        else { targetType = 'row'; targetIndex = 2; }
      } else if (section.type === 'row') {
        if (delta === -1 && section.index === 2) { targetType = 'hero'; targetIndex = 1; }
        else { targetType = 'row'; targetIndex = section.index + delta; }
      } else if (section.type === 'detail-back') {
        if (delta === 1) { targetType = 'detail-buttons'; targetIndex = 10; }
      } else if (section.type === 'detail-mute') {
        if (delta === 1) { targetType = 'detail-buttons'; targetIndex = 10; }
      } else if (section.type === 'detail-buttons') {
        if (delta === -1) { targetType = 'detail-back'; targetIndex = 9; }
        else { targetType = 'detail-recommended'; targetIndex = 11; }
      } else if (section.type === 'detail-recommended') {
        if (delta === -1) { targetType = 'detail-buttons'; targetIndex = 10; }
        else { targetType = 'detail-similar'; targetIndex = 12; }
      } else if (section.type === 'detail-similar') {
        if (delta === -1) { targetType = 'detail-recommended'; targetIndex = 11; }
        else { targetType = 'detail-seasons'; targetIndex = 14; }
      } else if (section.type === 'detail-seasons') {
        if (delta === -1) { targetType = 'detail-similar'; targetIndex = 12; }
        else { targetType = 'detail-episodes'; targetIndex = 15; }
      } else if (section.type === 'detail-episodes') {
        if (delta === -1) { targetType = 'detail-seasons'; targetIndex = 14; }
      }

      var targetSection = { type: targetType, index: targetIndex };
      var targetEls = getFocusablesInSection(targetSection);
      while (targetIndex >= 0 && !targetEls.length) {
        if (targetType === 'row') {
          targetIndex += delta;
          targetSection = { type: 'row', index: targetIndex };
          targetEls = getFocusablesInSection(targetSection);
          if (targetIndex < 2) { targetType = 'hero'; targetIndex = 1; targetSection = { type: 'hero', index: 1 }; targetEls = getFocusablesInSection(targetSection); break; }
        } else {
          break;
        }
      }
      if (targetEls.length) {
        var targetIdx = Math.min(Math.max(0, sectionIdx), targetEls.length - 1);
        setFocus(state.focusables.indexOf(targetEls[targetIdx]));
      } else if (direction === 'down' && section.type === 'nav') {
        var fallback = state.focusables.find(function (el) { return getSection(el).type !== 'nav'; });
        if (fallback) setFocus(state.focusables.indexOf(fallback));
      }
    }
  }

  function renderTopNav(screen) {
    var nav = el('nav', 'top-nav');
    var left = el('div', 'nav-left');
    var logo = el('div', 'nav-logo', 'Aether');
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
    api('/api/likes').then(function (likes) { state.likeCounts = likes || {}; });
    api('/api/ranked').then(function (ranked) { state.ranked = ranked; }).catch(function () {});
    setTimeout(function () { renderSkeletonHome(); }, 650);
    api('/api/discover').then(function (home) { state.home = home; setTimeout(renderHome, 1150); }).catch(renderError);
  }
  function renderSkeletonHome() { var screen = setScreen('home-screen'); screen.innerHTML = '<section class="hero skeleton hero-skeleton"></section><section class="rail-skeleton"><div></div><span></span><span></span><span></span><span></span></section><section class="rail-skeleton"><div></div><span></span><span></span><span></span><span></span></section>'; }

  function updateHeroSlide() {
    if (!state.home || !state.home.featured || !state.home.featured.length) return;
    var hero = document.querySelector('.hero');
    var dots = document.querySelectorAll('.hero-dot');
    if (hero && state.home.featured[state.heroIndex]) {
      var item = state.home.featured[state.heroIndex];
      hero.style.setProperty('--hero-bg', 'url(' + esc(backdrop(item)) + ')');
      var meta = hero.querySelector('.meta-line');
      var title = hero.querySelector('h1');
      var overview = hero.querySelector('p');
      var playBtn = hero.querySelector('[data-action="play-featured"]');
      var detailsBtn = hero.querySelector('[data-action="details"]');
      if (meta) meta.textContent = (item.genres || []).join(' • ') + ' • ' + runtime(item) + ' • ' + rating(item) + ' • ' + (item.year || '');
      if (title) title.textContent = item.title;
      if (overview) overview.textContent = item.overview;
      if (playBtn) playBtn.dataset.id = item.id;
      if (detailsBtn) detailsBtn.dataset.id = item.id;
    }
    if (dots.length) dots.forEach(function (d, i) { d.classList.remove('active'); if (i === state.heroIndex) d.classList.add('active'); });
  }

  function startHeroCarousel() {
    if (state.heroTimer) clearInterval(state.heroTimer);
    if (!state.home || !state.home.featured || !state.home.featured.length) return;
    state.heroTimer = setInterval(function () {
      state.heroIndex = (state.heroIndex + 1) % state.home.featured.length;
      updateHeroSlide();
    }, 6000);
  }

  function prevHeroSlide() {
    if (!state.home || !state.home.featured || !state.home.featured.length) return;
    state.heroIndex = (state.heroIndex - 1 + state.home.featured.length) % state.home.featured.length;
    updateHeroSlide();
    if (state.heroTimer) { clearInterval(state.heroTimer); startHeroCarousel(); }
  }

  function nextHeroSlide() {
    if (!state.home || !state.home.featured || !state.home.featured.length) return;
    state.heroIndex = (state.heroIndex + 1) % state.home.featured.length;
    updateHeroSlide();
    if (state.heroTimer) { clearInterval(state.heroTimer); startHeroCarousel(); }
  }

  function renderHome() {
    if (!state.home) return renderBoot();
    state.route = 'home';
    var screen = setScreenWithNav('home-screen');
    var featured = state.home.featured[state.heroIndex] || state.home.featured[0] || {};
    document.documentElement.style.setProperty('--ambient-bg', 'url(' + esc(backdrop(featured)) + ')');

    var hero = el('section', 'hero'); hero.style.setProperty('--hero-bg', 'url(' + esc(backdrop(featured)) + ')');
    hero.innerHTML = '<div class="hero-content"><div class="meta-line">' + esc((featured.genres || []).join(' • ')) + ' • ' + esc(runtime(featured)) + ' • ' + esc(rating(featured)) + ' • ' + esc(featured.year || '') + '</div><h1>' + esc(featured.title) + '</h1><p>' + esc(featured.overview) + '</p><div class="button-row netflix-row"><div class="btn-play" data-focusable="true" data-action="play-featured" data-id="' + esc(featured.id) + '">▶ Play</div><div class="btn-secondary" data-focusable="true" data-action="details" data-id="' + esc(featured.id) + '">ⓘ More Info</div></div></div>';

    var dots = el('div', 'hero-dots');
    state.home.featured.forEach(function (f, i) {
      var dot = el('div', 'hero-dot' + (i === state.heroIndex ? ' active' : ''));
      dot.dataset.index = String(i);
      dot.addEventListener('click', function () {
        state.heroIndex = i;
        if (state.heroTimer) clearInterval(state.heroTimer);
        renderHome();
      });
      dots.appendChild(dot);
    });
    hero.appendChild(dots);
    screen.appendChild(hero);

    if (state.ranked && state.ranked.top10 && state.ranked.top10.length) {
      renderRankedRow(screen, 'Top 10 Movies Today', state.ranked.top10.slice(0, 10));
    }
    if (state.ranked && state.ranked.cinemas && state.ranked.cinemas.length) {
      renderRow(screen, 'In Theaters', state.ranked.cinemas);
    }
    if (state.ranked && state.ranked.netflix && state.ranked.netflix.length) {
      renderRow(screen, 'On Netflix', state.ranked.netflix);
    }
    if (state.ranked && state.ranked.topRated && state.ranked.topRated.length) {
      renderRow(screen, 'Top Rated', state.ranked.topRated);
    }
    if (state.ranked && state.ranked.actionMovies && state.ranked.actionMovies.length) {
      renderRow(screen, 'Action Movies', state.ranked.actionMovies);
    }

    state.home.rows.forEach(function (row) { renderRow(screen, row.title, row.items); });
    registerFocusables(screen, state.focusMemory.home || 0);
    if (state.focusMemory.home === undefined) {
      var heroPlay = state.focusables.find(function (el) { return el.dataset.action === 'play-featured'; });
      if (heroPlay) setFocus(state.focusables.indexOf(heroPlay));
    }
    startHeroCarousel();
  }

  function renderRow(screen, title, items) {
    var section = el('section', 'row');
    var header = el('div', 'row-header');
    header.innerHTML = '<h2>' + esc(title) + '</h2>';
    section.appendChild(header);
    var wrap = el('div', 'row-wrap');
    var cardRow = el('div', 'card-row');
    items.forEach(function (item) { cardRow.appendChild(renderCard(item)); });
    var arrow = el('div', 'row-arrow', '→');
    arrow.setAttribute('data-focusable', 'true'); arrow.dataset.action = 'view-more'; arrow.dataset.title = esc(title);
    wrap.appendChild(cardRow); wrap.appendChild(arrow);
    section.appendChild(wrap); screen.appendChild(section);
  }

  function renderRankedRow(screen, title, items) {
    var section = el('section', 'row');
    var header = el('div', 'row-header');
    header.innerHTML = '<h2>' + esc(title) + '</h2>';
    section.appendChild(header);
    var wrap = el('div', 'row-wrap');
    var cardRow = el('div', 'card-row');
    items.forEach(function (item, i) {
      var card = renderCard(item, i + 1);
      cardRow.appendChild(card);
    });
    var arrow = el('div', 'row-arrow', '→');
    arrow.setAttribute('data-focusable', 'true'); arrow.dataset.action = 'view-more'; arrow.dataset.title = esc(title);
    wrap.appendChild(cardRow); wrap.appendChild(arrow);
    section.appendChild(wrap); screen.appendChild(section);
  }

  function renderCard(item, rank) {
    var saved = readProgress(item.id);
    var card = el('article', 'card');
    card.setAttribute('data-focusable', 'true'); card.dataset.action = 'details'; card.dataset.id = item.id; card.dataset.backdrop = backdrop(item);
    var posterUrl = poster(item);
    var posterHtml = '';
    if (posterUrl) {
      posterHtml = '<img class="poster" loading="lazy" src="' + esc(posterUrl) + '" alt="" onerror="this.parentNode.classList.add(\'no-poster\')">';
    } else {
      posterHtml = '<div class="poster-fallback"><span>' + esc(item.title || '') + '</span></div>';
    }
    var rankHtml = rank ? '<div class="rank-sticker">' + rank + '</div>' : '';
    card.innerHTML = '<div class="poster-wrap' + (posterUrl ? '' : ' no-poster') + '">' + posterHtml + '<span class="poster-glow"></span>' + (saved ? '<div class="mini-progress"><span style="width:' + Math.min(100, Math.floor((saved.positionSeconds / Math.max(saved.durationSeconds, 1)) * 100)) + '%"></span></div>' : '') + rankHtml + '</div><div class="card-info"><div class="card-title">' + esc(item.title) + '</div><div class="card-meta">' + esc(item.year || 'Live') + ' · ' + esc(item.type === 'movie' ? 'Movie' : item.type === 'show' ? 'TV Show' : 'Live') + '</div></div>';
    return card;
  }

  function preloadArtwork(items) { items.slice(0, 10).forEach(function (item) { var img = new Image(); img.src = poster(item); if (item.backdrop) { var bg = new Image(); bg.src = backdrop(item); } }); }

  function renderDetails(id) {
    rememberFocus(); state.route = 'details'; state.focusMemory.details = undefined;
    var screen = setScreen('details-screen'); screen.innerHTML = '<section class="detail-hero skeleton"></section>';
    return Promise.all([api('/api/media/' + id), api('/api/playback/' + id), api('/api/similar/' + id)]).then(function (results) {
      state.current = results[0]; state.sources = results[1].sources || []; state.similar = results[2].results || [];
      var item = state.current; document.documentElement.style.setProperty('--ambient-bg', 'url(' + esc(backdrop(item)) + ')');
      screen = setScreen('details-screen');
      var hasTrailer = item.trailer && item.trailer.key;
      var bgUrl = esc(backdrop(item));

      var trailerHtml = '';
      var posterOverlayHtml = '';
      var muteHtml = '';
      if (hasTrailer) {
        trailerHtml = '<div class="trailer-iframe-wrap" id="trailer-wrap"><iframe id="trailer-iframe" src="https://www.youtube.com/embed/' + esc(item.trailer.key) + '?autoplay=1&mute=1&controls=0&modestbranding=1&rel=0&loop=1&playlist=' + esc(item.trailer.key) + '" frameborder="0" allow="autoplay; encrypted-media" allowfullscreen></iframe></div>';
        posterOverlayHtml = '<div class="trailer-poster" id="trailer-poster" style="background-image:url(' + bgUrl + ')"></div>';
        muteHtml = '<div class="mute-icon" id="mute-btn" data-focusable="true" data-action="mute-toggle">🔇</div>';
      }

      var likeCount = state.likeCounts[item.id] || 0;
      var badgeParts = [];
      if (item.rating) badgeParts.push('<span class="rating-badge">★ ' + esc(item.rating) + '</span>');
      if (item.year) badgeParts.push('<span>' + esc(item.year) + '</span>');
      if (item.runtimeMinutes) badgeParts.push('<span>' + esc(runtime(item)) + '</span>');
      if (item.type === 'movie') badgeParts.push('<span>Movie</span>');
      else if (item.type === 'show') badgeParts.push('<span>TV Series</span>');
      if (item.voteCount) badgeParts.push('<span>' + esc(item.voteCount.toLocaleString()) + ' votes</span>');
      var badgeHtml = badgeParts.join('<span style="color:rgba(255,255,255,.3)">•</span>');

      var genreHtml = (item.genres || []).map(function (g) { return '<span>' + esc(g) + '</span>'; }).join('');

      var isShow = item.type === 'show';
      var seasonHtml = '';
      if (isShow) {
        seasonHtml = '<h2>Seasons</h2><div class="season-selector" id="season-selector"></div><h2>Episodes</h2><div class="episode-list" id="episode-list"></div>';
      }

      var hero = el('section', 'detail-hero');
      hero.innerHTML = '<div class="detail-bg" style="background-image:url(' + bgUrl + ')"></div>' + trailerHtml + posterOverlayHtml + '<div class="detail-fade"></div>' + muteHtml + '<div class="back-btn" data-focusable="true" data-action="back">&lt;</div><div class="detail-hero-content"><div class="badge-row">' + badgeHtml + '</div><h1>' + esc(item.title) + '</h1><div class="genre-row">' + genreHtml + '</div><div class="button-row netflix-row"><div class="btn-play" data-focusable="true" data-action="play">▶ Play</div><div class="btn-circle" data-focusable="true" data-action="like">♥<span class="like-count">' + likeCount + '</span></div><div class="btn-circle" data-focusable="true" data-action="favorite">' + (isFavorite(item.id) ? '✓' : '+') + '</div></div></div>';
      screen.appendChild(hero);

      var body = el('div', 'detail-body');
      body.innerHTML = '<h2>Overview</h2><p class="overview">' + esc(item.overview) + '</p><h2>Cast</h2><div class="cast-row">' + (item.cast || []).map(function (c) { return '<div class="cast-chip"><span style="background-image:url(' + esc(wsrv(c.photo || '')) + ')"></span>' + esc(c.name) + '</div>'; }).join('') + '</div><h2>Recommended</h2><div class="recommended-wrap"><div class="card-row recommended"></div></div><h2>Similar</h2><div class="similar-wrap"><div class="card-row similar"></div></div>' + seasonHtml + '<h2>Sources</h2><div class="source-list"></div>';
      screen.appendChild(body);

      if (hasTrailer) {
        setTimeout(function () {
          var tw = document.getElementById('trailer-wrap');
          var tp = document.getElementById('trailer-poster');
          if (tw) tw.classList.add('active');
          if (tp) tp.classList.add('hidden');
        }, 3000);
      }

      var recommended = body.querySelector('.recommended'); if (state.home) { allItems().filter(function (i) { return i.id !== item.id; }).concat(allItems()).slice(0, 8).forEach(function (rec) { recommended.appendChild(renderCard(rec)); }); }
      var similar = body.querySelector('.similar'); state.similar.slice(0, 8).forEach(function (s) { similar.appendChild(renderCard(s)); });
      var sources = body.querySelector('.source-list'); state.sources.forEach(function (source) { var s = el('div', 'provider-option', '○ ' + source.provider + ' · ' + source.quality + ' · ' + source.format); s.setAttribute('data-focusable', 'true'); s.dataset.action = 'play'; s.dataset.source = source.id; sources.appendChild(s); });
      if (!state.sources.length) { sources.innerHTML = '<div class="empty-source">No sources available for this item.</div>'; }

      if (isShow && item.tmdbId) {
        loadTvSeasons(item.tmdbId);
      }

      registerFocusables(screen, 0);
      var playBtn = state.focusables.find(function (el) { return el.dataset.action === 'play'; });
      if (playBtn) setFocus(state.focusables.indexOf(playBtn));
    }).catch(renderError);
  }

  function loadTvSeasons(tmdbId) {
    api('/api/tv/' + tmdbId + '/seasons').then(function (data) {
      state.tvSeasons = data.seasons || [];
      var selector = document.getElementById('season-selector');
      var episodeList = document.getElementById('episode-list');
      if (!selector || !episodeList) return;
      state.tvSeasons.forEach(function (s, i) {
        var pill = el('div', 'season-pill' + (i === 0 ? ' selected' : ''), s.name);
        pill.setAttribute('data-focusable', 'true');
        pill.dataset.action = 'season-select';
        pill.dataset.season = s.seasonNumber;
        pill.dataset.tmdbId = tmdbId;
        selector.appendChild(pill);
      });
      if (state.tvSeasons.length) {
        loadTvEpisodes(tmdbId, state.tvSeasons[0].seasonNumber);
      }
      var newFocusables = Array.prototype.slice.call(document.querySelector('.detail-hero').querySelectorAll('[data-focusable="true"]'));
      state.focusables = newFocusables;
    }).catch(function () {});
  }

  function loadTvEpisodes(tmdbId, seasonNum) {
    var episodeList = document.getElementById('episode-list');
    if (!episodeList) return;
    episodeList.innerHTML = '<div style="color:var(--text-muted);padding:12px;">Loading episodes...</div>';
    api('/api/tv/' + tmdbId + '/season/' + seasonNum).then(function (data) {
      state.tvEpisodes = data.episodes || [];
      episodeList.innerHTML = '';
      state.tvEpisodes.forEach(function (e) {
        var epCard = el('div', 'episode-card');
        epCard.setAttribute('data-focusable', 'true');
        epCard.dataset.action = 'play';
        var stillUrl = e.still ? wsrv(e.still) : '';
        epCard.innerHTML = (stillUrl ? '<img src="' + esc(stillUrl) + '" alt="" loading="lazy">' : '<div style="width:120px;height:68px;border-radius:8px;background:linear-gradient(135deg,#1a1a2e,#16213e);"></div>') + '<div class="ep-info"><div class="ep-title">' + esc(e.name) + '</div><div class="ep-num">Episode ' + esc(e.episodeNumber) + '</div></div>';
        episodeList.appendChild(epCard);
      });
      var newFocusables = Array.prototype.slice.call(document.querySelector('.detail-hero').querySelectorAll('[data-focusable="true"]'));
      state.focusables = newFocusables;
    }).catch(function () {
      episodeList.innerHTML = '<div style="color:var(--text-muted);padding:12px;">Could not load episodes.</div>';
    });
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
  function renderMovies() { return renderMediaList('movies', 'Movies', function () { return api('/api/movies').then(function (data) { return data.results || []; }); }); }
  function renderShows() { return renderMediaList('shows', 'TV Shows', function () { return api('/api/shows').then(function (data) { return data.results || []; }); }); }

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
    if (action === 'details') { state.focusMemory.details = undefined; renderDetails(node.dataset.id); }
    if (action === 'play-featured') return Promise.all([api('/api/media/' + node.dataset.id), api('/api/playback/' + node.dataset.id)]).then(function (results) { state.current = results[0]; state.sources = results[1].sources; renderPlayer(); });
    if (action === 'play') renderPlayer(node.dataset.source);
    if (action === 'favorite') toggleFavorite(state.current.id);
    if (action === 'like') {
      var isLiked = !!state.likes[state.current.id];
      state.likes[state.current.id] = !isLiked;
      apiPost('/api/likes', { id: state.current.id, like: !isLiked ? 1 : -1 }).then(function (likes) { state.likeCounts = likes; renderDetails(state.current.id); });
    }
    if (action === 'mute-toggle') {
      var iframe = document.getElementById('trailer-iframe');
      var muteBtn = document.getElementById('mute-btn');
      if (iframe && muteBtn) {
        var src = iframe.src;
        var isMuted = src.indexOf('mute=1') !== -1;
        iframe.src = src.replace('mute=' + (isMuted ? '1' : '0'), 'mute=' + (isMuted ? '0' : '1'));
        muteBtn.textContent = isMuted ? '🔊' : '🔇';
      }
    }
    if (action === 'season-select') {
      var tmdbId = parseInt(node.dataset.tmdbId, 10);
      var seasonNum = parseInt(node.dataset.season, 10);
      document.querySelectorAll('.season-pill').forEach(function (p) { p.classList.remove('selected'); });
      node.classList.add('selected');
      loadTvEpisodes(tmdbId, seasonNum);
    }
    if (action === 'back') { back(); }
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
    if (action === 'hero-dot') {
      state.heroIndex = parseInt(node.dataset.index, 10);
      if (state.heroTimer) clearInterval(state.heroTimer);
      renderHome();
    }
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

  window.addEventListener('keydown', function (event) {
    var key = event.key; var code = event.keyCode; var which = event.which;
    if (key === 'PageUp' || code === 33 || which === 33 || key === 'ChannelUp' || code === 427 || which === 427 || key === 'MediaTrackPrevious' || code === 403 || which === 403) { event.preventDefault(); window.scrollBy({ top: -window.innerHeight * 0.8, behavior: 'smooth' }); return; }
    if (key === 'PageDown' || code === 34 || which === 34 || key === 'ChannelDown' || code === 428 || which === 428 || key === 'MediaTrackNext' || code === 402 || which === 402) { event.preventDefault(); window.scrollBy({ top: window.innerHeight * 0.8, behavior: 'smooth' }); return; }
    if (state.route === 'player') {
      if (key === 'Backspace' || key === 'Escape' || code === 461 || code === 10009 || which === 461 || which === 10009) { event.preventDefault(); return back(); }
      if (key === 'Enter' || code === 13 || which === 13 || key === 'MediaPlayPause') { event.preventDefault(); state.controlsVisible = true; state.player.paused ? state.player.play() : state.player.pause(); return updatePlayerOverlay(state.player.paused ? 'Paused' : 'Playing'); }
      if (key === 'ArrowRight') { state.player.currentTime += 15; state.controlsVisible = true; updatePlayerOverlay('Seeking forward'); }
      if (key === 'ArrowLeft') { state.player.currentTime -= 15; state.controlsVisible = true; updatePlayerOverlay('Seeking back'); }
      if (key === 'ArrowUp') { state.controlsVisible = true; updatePlayerOverlay('Menu'); }
      if (key === 'ArrowDown') { state.controlsVisible = false; updatePlayerOverlay('Hidden'); }
      return;
    }
    if (state.route === 'search' && key.length === 1 && !event.ctrlKey && !event.metaKey) { state.searchQuery += key; renderSearch(); return; }
    if (state.route === 'search' && key === 'Backspace' && state.searchQuery) { event.preventDefault(); state.searchQuery = state.searchQuery.slice(0, -1); renderSearch(); return; }
    if (key === 'ArrowRight' || key === 'ArrowLeft' || key === 'ArrowDown' || key === 'ArrowUp') {
      event.preventDefault();
      moveFocus(key === 'ArrowRight' || key === 'ArrowLeft' ? (key === 'ArrowRight' ? 'right' : 'left') : (key === 'ArrowDown' ? 'down' : 'up'));
    }
    if (key === 'Enter' || code === 13 || which === 13) { event.preventDefault(); activate(state.focusables[state.focus]); }
    if (key === 'Backspace' || key === 'Escape' || code === 461 || code === 10009 || which === 461 || which === 10009) { event.preventDefault(); back(); }
  });

  detectCapabilities(); loadAuth(); renderBoot();
})();
