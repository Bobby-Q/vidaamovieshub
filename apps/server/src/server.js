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
