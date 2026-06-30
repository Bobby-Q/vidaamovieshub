const assert = require('assert');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const port = 4299;
const base = `http://127.0.0.1:${port}`;

function wait(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

async function fetchJson(route, options) {
  const res = await fetch(base + route, options);
  assert.strictEqual(res.status, 200, `${route} should return 200`);
  assert.match(res.headers.get('content-type') || '', /application\/json/, `${route} should return JSON`);
  return res.json();
}

async function waitForServer(child) {
  const started = Date.now();
  while (Date.now() - started < 8000) {
    try {
      const res = await fetch(base + '/api/config');
      if (res.ok) return;
    } catch (_) {}
    await wait(100);
  }
  child.kill();
  throw new Error('Server did not start within 8s');
}

async function run() {
  const catalogPath = path.join(root, 'data/catalog.json');
  const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  assert.ok(Array.isArray(catalog.items), 'catalog.items must be an array');
  assert.ok(catalog.items.length >= 2, 'catalog should include movie and live demo items');
  catalog.items.forEach((item) => {
    assert.ok(item.id, 'item.id is required');
    assert.ok(item.title, 'item.title is required');
    assert.ok(Array.isArray(item.sources), `${item.id} sources must be an array`);
    assert.ok(item.sources.length > 0, `${item.id} must have at least one source`);
    item.sources.forEach((source) => {
      assert.ok(source.url, `${item.id}/${source.id} source.url is required`);
      assert.ok(Number.isFinite(source.priority), `${item.id}/${source.id} source.priority is required`);
    });
  });

  const child = spawn(process.execPath, ['apps/server/src/server.js'], {
    cwd: root,
    env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  try {
    await waitForServer(child);

    const config = await fetchJson('/api/config');
    assert.strictEqual(config.appName, 'Aether Stream');
    assert.ok(config.capabilities.includes('remote-navigation'));
    assert.ok(config.capabilities.includes('tmdb') || !config.tmdbEnabled, 'config should include tmdb capability if enabled');

    const providers = await fetchJson('/api/providers');
    assert.strictEqual(typeof providers.usingExample, 'boolean');
    assert.ok(providers.providers.every((provider) => provider.password === undefined), 'provider status must not expose passwords');

    const home = await fetchJson('/api/home');
    assert.ok(home.featured.length >= 0, 'home.featured should be array');
    assert.ok(Array.isArray(home.rows), 'home.rows should be array');
    home.rows.forEach((row) => assert.ok(Array.isArray(row.items), `${row.id} row items should be an array`));

    const discover = await fetchJson('/api/discover');
    assert.ok(Array.isArray(discover.rows), 'discover.rows should be array');

    const categories = await fetchJson('/api/categories');
    assert.ok(Array.isArray(categories.categories), 'categories should be array');
    assert.ok(categories.categories.length > 0, 'categories should not be empty');

    const search = await fetchJson('/api/search?q=bunny');
    assert.ok(Array.isArray(search.results), 'search results should be array');

    const liveCategories = await fetchJson('/api/live/categories');
    assert.ok(Array.isArray(liveCategories.categories), 'live categories should be array');

    const liveChannels = await fetchJson('/api/live/channels');
    assert.ok(Array.isArray(liveChannels.channels), 'live channels should be array');

    const media = await fetchJson('/api/media/demo-movie');
    assert.strictEqual(media.id, 'demo-movie');
    assert.strictEqual(media.sources, undefined, 'media details should not expose source URLs');

    const playback = await fetchJson('/api/playback/demo-movie');
    assert.strictEqual(playback.mediaId, 'demo-movie');
    assert.ok(playback.sources.length > 0, 'playback should include sources');
    assert.strictEqual(playback.sources[0].priority, 1, 'sources should be priority sorted');

    // Auth tests
    const register = await fetch(base + '/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'testuser_' + Date.now(), password: 'testpass123' })
    });
    assert.strictEqual(register.status, 201, 'register should return 201');
    const regBody = await register.json();
    assert.ok(regBody.token, 'register should return token');
    assert.ok(regBody.user.username, 'register should return user');

    const me = await fetch(base + '/api/auth/me', {
      headers: { 'Authorization': 'Bearer ' + regBody.token }
    });
    assert.strictEqual(me.status, 200);
    const meBody = await me.json();
    assert.ok(meBody.username, 'me should return user');

    const logout = await fetch(base + '/api/auth/logout', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + regBody.token }
    });
    assert.strictEqual(logout.status, 200);

    const page = await fetch(base + '/');
    assert.strictEqual(page.status, 200, 'index should return 200');
    const html = await page.text();
    assert.match(html, /Aether Stream/, 'index should contain app name');

    const missing = await fetch(base + '/api/media/not-found');
    assert.strictEqual(missing.status, 404, 'missing media should return 404');
  } finally {
    child.kill();
  }

  console.log('All tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
