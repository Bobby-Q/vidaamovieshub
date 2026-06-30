const fs = require('fs');
const path = require('path');
const https = require('https');

const root = path.resolve(__dirname, '..');
const providerPath = path.join(root, 'data/providers.json');
const examplePath = path.join(root, 'data/providers.example.json');

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('  Aether Stream — Setup Check');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

// Check if providers.json exists
if (!fs.existsSync(providerPath)) {
  console.log('❌ data/providers.json NOT FOUND');
  console.log('   → You need to create this file with your credentials.');
  console.log('   → Copy data/providers.example.json to data/providers.json');
  console.log('   → Replace the placeholder values with your real credentials.\n');
  process.exit(1);
}

const config = JSON.parse(fs.readFileSync(providerPath, 'utf8'));

// Check TMDb
console.log('1. TMDb API Key');
const tmdbKey = config.metadata && config.metadata.tmdbApiKey;
if (!tmdbKey || tmdbKey.includes('PUT_') || tmdbKey.length < 10) {
  console.log('   ❌ No valid TMDb API key found');
  console.log('   → Get one free at: https://www.themoviedb.org/settings/api');
} else {
  console.log('   ✅ TMDb API key configured (' + tmdbKey.slice(0, 4) + '****...)');
  
  // Test TMDb connectivity
  https.get('https://api.themoviedb.org/3/movie/popular?api_key=' + tmdbKey, (res) => {
    let data = '';
    res.on('data', (chunk) => data += chunk);
    res.on('end', () => {
      try {
        const json = JSON.parse(data);
        if (json.results && json.results.length) {
          console.log('   ✅ TMDb API responds OK (' + json.results.length + ' movies fetched)');
        } else if (json.status_code) {
          console.log('   ❌ TMDb API error: ' + json.status_message);
        } else {
          console.log('   ⚠️  TMDb API returned unexpected response');
        }
      } catch (e) {
        console.log('   ❌ TMDb API returned invalid JSON');
      }
      checkProviders();
    });
  }).on('error', (e) => {
    console.log('   ❌ TMDb connection failed: ' + e.message);
    checkProviders();
  }).setTimeout(10000, function() { this.destroy(); console.log('   ❌ TMDb connection timeout'); checkProviders(); });
  return; // async, will call checkProviders()
}

checkProviders();

function checkProviders() {
  console.log('\n2. IPTV Providers');
  const providers = config.providers || [];
  if (!providers.length) {
    console.log('   ❌ No providers configured');
    console.log('   → Add providers to data/providers.json');
    return;
  }
  
  providers.forEach((p) => {
    const status = p.enabled ? 'enabled' : 'disabled';
    if (p.type === 'xtream') {
      const configured = p.serverUrl && p.username && p.password && !p.username.includes('PUT_');
      console.log('   ' + (configured ? '✅' : '❌') + ' [' + status + '] Xtream: ' + p.name + ' (' + p.serverUrl + ')');
    } else if (p.type === 'm3u') {
      const configured = p.playlistUrl && !p.playlistUrl.includes('example.com');
      console.log('   ' + (configured ? '✅' : '❌') + ' [' + status + '] M3U: ' + p.name + ' (' + p.playlistUrl + ')');
    } else if (p.type === 'local-json') {
      const exists = p.catalogPath && fs.existsSync(path.join(root, p.catalogPath));
      console.log('   ' + (exists ? '✅' : '❌') + ' [' + status + '] Local JSON: ' + p.name + ' (' + p.catalogPath + ')');
    }
  });

  console.log('\n3. Summary');
  const hasTmdb = tmdbKey && !tmdbKey.includes('PUT_');
  const hasProvider = providers.some((p) => p.enabled && (
    (p.type === 'xtream' && p.username && !p.username.includes('PUT_')) ||
    (p.type === 'm3u' && p.playlistUrl && !p.playlistUrl.includes('example.com'))
  ));
  
  if (hasTmdb && hasProvider) {
    console.log('   ✅ Configuration looks good! Run: npm start');
  } else if (hasTmdb) {
    console.log('   ⚠️  TMDb is set up but no IPTV providers are configured');
    console.log('   → You will see movies/TV from TMDb but no live channels');
  } else if (hasProvider) {
    console.log('   ⚠️  IPTV is set up but no TMDb API key');
    console.log('   → You will see live channels but no movie/TV metadata');
  } else {
    console.log('   ❌ Nothing is configured. Check data/providers.json');
  }
  
  console.log('\n4. Quick Fix');
  console.log('   If you see empty data, check:');
  console.log('   a) Is data/providers.json present?');
  console.log('   b) Are the API key and URLs correct?');
  console.log('   c) Is your internet connection working?');
  console.log('   d) Are the providers enabled in the JSON?');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}
