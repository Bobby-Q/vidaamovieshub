(function () {
  var app = document.getElementById('app');
  var state = { route: 'home', home: null, current: null, sources: [], activeSourceIndex: 0, focus: 0, focusables: [], lastHomeFocus: 0, player: null, overlay: null, capabilities: {} };

  function api(path) { return fetch(path).then(function (res) { if (!res.ok) throw new Error('API failed'); return res.json(); }); }
  function el(tag, className, text) { var node = document.createElement(tag); if (className) node.className = className; if (text) node.textContent = text; return node; }
  function setScreen(className) { app.innerHTML = ''; var screen = el('main', 'screen ' + (className || '')); app.appendChild(screen); return screen; }
  function poster(item) { return item.poster || '/public/poster-demo.svg'; }
  function backdrop(item) { return item.backdrop || '/public/backdrop-demo.svg'; }

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

  function progressKey(id) { return 'vidaamovieshub:progress:' + id; }
  function saveProgress() {
    if (!state.capabilities.localStorage || !state.current || !state.player || !state.player.duration) return;
    localStorage.setItem(progressKey(state.current.id), JSON.stringify({ positionSeconds: Math.floor(state.player.currentTime), durationSeconds: Math.floor(state.player.duration) }));
  }
  function readProgress(id) {
    if (!state.capabilities.localStorage) return null;
    try { return JSON.parse(localStorage.getItem(progressKey(id)) || 'null'); } catch (error) { return null; }
  }

  function renderTopbar(screen) {
    var topbar = el('div', 'topbar');
    topbar.appendChild(el('div', 'brand', 'VIDAA MoviesHub'));
    topbar.appendChild(el('div', 'nav-hint', 'Remote: arrows • OK • Back • Play/Pause'));
    screen.appendChild(topbar);
  }

  function renderHome() {
    state.route = 'home';
    var screen = setScreen('home-screen');
    renderTopbar(screen);
    if (!state.home) {
      screen.appendChild(el('div', 'skeleton', ''));
      return api('/api/home').then(function (home) { state.home = home; renderHome(); }).catch(renderError);
    }
    var featured = state.home.featured[0] || state.home.rows[0].items[0];
    var hero = el('section', 'hero');
    hero.style.setProperty('--hero-bg', 'url(' + backdrop(featured) + ')');
    hero.setAttribute('data-focusable', 'true');
    hero.dataset.action = 'details';
    hero.dataset.id = featured.id;
    hero.innerHTML = '<h1>' + featured.title + '</h1><p>' + featured.overview + '</p><div><span class="button primary">Play / Details</span><span class="button">Source Ready</span></div>';
    screen.appendChild(hero);

    state.home.rows.forEach(function (row) {
      var section = el('section', 'row');
      section.appendChild(el('h2', '', row.title));
      var cardRow = el('div', 'card-row');
      row.items.forEach(function (item) {
        var card = el('article', 'card');
        card.setAttribute('data-focusable', 'true');
        card.dataset.action = 'details';
        card.dataset.id = item.id;
        card.innerHTML = '<img class="poster" src="' + poster(item) + '" alt=""><div class="card-title">' + item.title + '</div>';
        cardRow.appendChild(card);
      });
      section.appendChild(cardRow);
      screen.appendChild(section);
    });

    var settings = el('div', 'button');
    settings.textContent = 'Settings';
    settings.setAttribute('data-focusable', 'true');
    settings.dataset.action = 'settings';
    screen.appendChild(settings);
    registerFocusables(screen, state.lastHomeFocus);
  }

  function renderDetails(id) {
    state.route = 'details';
    state.lastHomeFocus = state.focus;
    var screen = setScreen('details-screen');
    renderTopbar(screen);
    return Promise.all([api('/api/media/' + id), api('/api/playback/' + id)]).then(function (results) {
      state.current = results[0]; state.sources = results[1].sources;
      screen.innerHTML = ''; renderTopbar(screen);
      var wrap = el('section', 'details');
      wrap.innerHTML = '<img class="details-poster" src="' + poster(state.current) + '" alt=""><div><h1>' + state.current.title + '</h1><div class="meta">' + (state.current.year || '') + ' • ' + (state.current.type || '') + ' • ' + (state.current.genres || []).join(', ') + '</div><p class="overview">' + state.current.overview + '</p></div>';
      var body = wrap.children[1];
      var saved = readProgress(state.current.id);
      var playLabel = saved && saved.positionSeconds > 15 ? 'Resume from ' + Math.floor(saved.positionSeconds / 60) + 'm' : 'Play';
      var play = el('div', 'button primary', playLabel); play.setAttribute('data-focusable', 'true'); play.dataset.action = 'play'; body.appendChild(play);
      var back = el('div', 'button', 'Back'); back.setAttribute('data-focusable', 'true'); back.dataset.action = 'back'; body.appendChild(back);
      body.appendChild(el('h2', '', 'Sources'));
      state.sources.forEach(function (source) { var s = el('div', 'source-card', source.provider + ' • ' + source.format + ' • ' + source.quality); s.setAttribute('data-focusable', 'true'); s.dataset.action = 'play'; s.dataset.source = source.id; body.appendChild(s); });
      screen.appendChild(wrap);
      registerFocusables(screen, 0);
    }).catch(renderError);
  }

  function renderPlayer(sourceId) {
    state.route = 'player';
    state.activeSourceIndex = Math.max(0, state.sources.findIndex(function (s) { return sourceId && s.id === sourceId; }));
    if (state.activeSourceIndex < 0) state.activeSourceIndex = 0;
    var screen = setScreen('player-screen');
    var video = el('video'); video.controls = false; video.autoplay = true; video.playsInline = true;
    var overlay = el('div', 'player-overlay');
    screen.appendChild(video); screen.appendChild(overlay); state.player = video; state.overlay = overlay;
    video.addEventListener('error', tryNextSource);
    video.addEventListener('waiting', function () { updatePlayerOverlay('Buffering…'); });
    video.addEventListener('playing', function () { updatePlayerOverlay('Playing'); });
    video.addEventListener('timeupdate', function () { saveProgress(); updateProgressBar(); });
    loadActiveSource();
  }

  function loadActiveSource() {
    var source = state.sources[state.activeSourceIndex];
    if (!source) { updatePlayerOverlay('No playable source available.'); return; }
    state.player.src = source.url;
    updatePlayerOverlay('Loading ' + source.provider + ' • ' + source.format + ' • ' + source.quality);
    var saved = readProgress(state.current.id);
    state.player.onloadedmetadata = function () { if (saved && saved.positionSeconds > 15 && state.current.type !== 'live') state.player.currentTime = saved.positionSeconds; };
    state.player.play().catch(function () { updatePlayerOverlay('Press OK to start playback.'); });
  }

  function tryNextSource() {
    if (state.activeSourceIndex + 1 >= state.sources.length) { updatePlayerOverlay('All sources failed. Press Back and choose another item.'); return; }
    state.activeSourceIndex += 1;
    loadActiveSource();
  }

  function updatePlayerOverlay(status) {
    var source = state.sources[state.activeSourceIndex];
    state.overlay.innerHTML = '<strong>' + state.current.title + '</strong><div class="nav-hint">' + status + ' • Source ' + (state.activeSourceIndex + 1) + '/' + state.sources.length + (source ? ' • ' + source.quality : '') + '</div><div class="nav-hint">OK Play/Pause • Left/Right Seek • Up Next Source • Back Return</div><div class="progress"><span></span></div>';
    updateProgressBar();
  }

  function updateProgressBar() {
    if (!state.overlay || !state.player) return;
    var bar = state.overlay.querySelector('span');
    if (!bar) return;
    var pct = state.player.duration ? (state.player.currentTime / state.player.duration) * 100 : 0;
    bar.style.width = pct + '%';
  }

  function renderSettings() {
    state.route = 'settings';
    var screen = setScreen('settings-screen'); renderTopbar(screen);
    screen.innerHTML += '<h1>Settings</h1><p class="overview">Backend: same-origin /api. Add Xtream, M3U, TMDb, and provider settings after the playable MVP is validated on VIDAA.</p><div class="source-card">Resolution: ' + state.capabilities.resolution + '</div><div class="source-card">Native HLS: ' + (state.capabilities.nativeHls ? 'yes' : 'no') + '</div><div class="source-card">MediaSource: ' + (state.capabilities.mediaSource ? 'yes' : 'no') + '</div><div class="source-card">Local storage: ' + (state.capabilities.localStorage ? 'yes' : 'no') + '</div>';
    var back = el('div', 'button primary', 'Back'); back.setAttribute('data-focusable', 'true'); back.dataset.action = 'back'; screen.appendChild(back);
    registerFocusables(screen, 0);
  }

  function renderError(error) { var screen = setScreen(''); screen.appendChild(el('div', 'error', error.message || String(error))); }
  function activate(node) { if (!node) return; var action = node.dataset.action; if (action === 'details') renderDetails(node.dataset.id); if (action === 'play') renderPlayer(node.dataset.source); if (action === 'settings') renderSettings(); if (action === 'back') renderHome(); }
  function back() { if (state.route === 'home') return; if (state.route === 'player') { if (state.player) state.player.pause(); renderDetails(state.current.id); } else renderHome(); }

  document.addEventListener('keydown', function (event) {
    var key = event.key; var code = event.keyCode;
    if (state.route === 'player') {
      if (key === 'Backspace' || key === 'Escape' || code === 461 || code === 10009) { event.preventDefault(); back(); }
      if (key === 'Enter' || code === 13 || key === 'MediaPlayPause') { event.preventDefault(); state.player.paused ? state.player.play() : state.player.pause(); }
      if (key === 'ArrowRight') state.player.currentTime += 15;
      if (key === 'ArrowLeft') state.player.currentTime -= 15;
      if (key === 'ArrowUp') tryNextSource();
      return;
    }
    if (key === 'ArrowRight' || key === 'ArrowDown') { event.preventDefault(); setFocus(state.focus + 1); }
    if (key === 'ArrowLeft' || key === 'ArrowUp') { event.preventDefault(); setFocus(state.focus - 1); }
    if (key === 'Enter' || code === 13) { event.preventDefault(); activate(state.focusables[state.focus]); }
    if (key === 'Backspace' || key === 'Escape' || code === 461 || code === 10009) { event.preventDefault(); back(); }
  });

  detectCapabilities();
  renderHome();
})();
