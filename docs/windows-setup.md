# Windows Laptop Setup Guide

This guide walks you through setting up Aether Stream on your **Windows laptop** so you can test before deploying to your VIDAA TV.

---

## 1. Clone the Repo (You Already Did This)

```powershell
git clone https://github.com/Bobby-Q/vidaamovieshub.git
cd vidaamovieshub
git checkout codex/complete-the-ui-interface
```

---

## 2. Create `data/providers.json` (This Is Why You See Empty Data)

**The problem:** `data/providers.json` is in `.gitignore`, so it doesn't exist after cloning. The server falls back to `data/providers.example.json` which has placeholder data. That's why you see **empty rows** — the server has no real API keys or M3U URLs.

### Step A: Create the file

In the repo folder, create a new file at this exact path:

```
vidaamovieshub\data\providers.json
```

**Example full path:** `C:\Users\YourName\Documents\vidaamovieshub\data\providers.json`

### Step B: Paste this content (your real credentials)

```json
{
  "metadata": {
    "tmdbApiKey": "f99d8d1941f1331b79865efeb89ee2a5"
  },
  "providers": [
    {
      "id": "goldclub-xtream",
      "type": "xtream",
      "name": "GoldClub IPTV",
      "enabled": true,
      "priority": 1,
      "serverUrl": "http://goldclub.tv",
      "username": "6195841658",
      "password": "2878808147"
    },
    {
      "id": "goldclub-m3u-plus",
      "type": "m3u",
      "name": "GoldClub M3U Plus",
      "enabled": true,
      "priority": 2,
      "playlistUrl": "http://goldclub.tv/get.php?username=6195841658&password=2878808147&output=ts&type=m3u_plus"
    },
    {
      "id": "goldclub-m3u",
      "type": "m3u",
      "name": "GoldClub M3U",
      "enabled": true,
      "priority": 3,
      "playlistUrl": "http://goldclub.tv/get.php?username=6195841658&password=2878808147&output=ts&type=m3u"
    }
  ]
}
```

> ⚠️ **Security:** This file is `.gitignore`d, so it will NEVER be committed to GitHub. Your credentials stay safe on your laptop.

---

## 3. Run the Diagnostic Check

Before starting the server, run this to verify everything is configured:

```powershell
node scripts/setup-check.js
```

You should see something like:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Aether Stream — Setup Check
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. TMDb API Key
   ✅ TMDb API key configured (f99d****...)
   ✅ TMDb API responds OK (20 movies fetched)

2. IPTV Providers
   ✅ [enabled] Xtream: GoldClub IPTV (http://goldclub.tv)
   ✅ [enabled] M3U: GoldClub M3U Plus (...)
   ✅ [enabled] M3U: GoldClub M3U (...)

3. Summary
   ✅ Configuration looks good! Run: npm start

4. Quick Fix
   ...
```

If you see ❌, check the error message and fix `data/providers.json`.

---

## 4. Start the Server

```powershell
npm start
```

Or directly:

```powershell
node apps/server/src/server.js
```

You should see:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Aether Stream v1.0.0
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Config file: data/providers.json
TMDb API: Configured (f99d****...)
Providers: 3 enabled
  - [xtream] GoldClub IPTV ✓
  - [m3u] GoldClub M3U Plus ✓
  - [m3u] GoldClub M3U ✓
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Server running at http://localhost:4173
Open your browser and go to the URL above
TMDb genres loaded
M3U loaded: 2000 channels, 500 VOD
```

> **Note:** The first M3U fetch might take 10–20 seconds depending on your internet speed. Be patient.

---

## 5. Open in Your Browser

```
http://localhost:4173
```

Use **Chrome, Edge, or Firefox** for best results. The app works with:
- **Mouse/keyboard:** Arrow keys, Enter, Backspace
- **Remote control:** If you have a TV remote simulator

---

## 6. Troubleshooting Empty Data

| Symptom | Cause | Fix |
|---------|-------|-----|
| "Config file: data/providers.example.json (FALLBACK)" | `data/providers.json` missing | Create the file with your credentials |
| "TMDb API: NOT configured" | API key missing or has "PUT_" placeholder | Replace with real TMDb key |
| "Providers: 0 enabled" | All providers have `enabled: false` | Set `enabled: true` in JSON |
| "M3U preload failed" | Slow internet or blocked URL | Check your connection, try VPN |
| "No sources available" | TMDb items don't match M3U content | This is expected — TMDb metadata + M3U playback are separate |

### Still empty? Try this debug command:

```powershell
node -e "
const https = require('https');
https.get('https://api.themoviedb.org/3/movie/popular?api_key=f99d8d1941f1331b79865efeb89ee2a5', (res) => {
  let d = ''; res.on('data', c => d += c); res.on('end', () => console.log(JSON.parse(d).results.length, 'movies'));
});
"
```

If this returns a number > 0, TMDb is working. If it errors, your internet might be blocking TMDb.

---

## 7. Quick Test Checklist

After starting the server, verify these load:

- [ ] **Home page** shows trending movies with real posters
- [ ] **Movies tab** shows popular movies
- [ ] **TV Shows tab** shows popular TV shows
- [ ] **Live TV tab** shows channel categories and channels
- [ ] **Categories** shows genre tiles (Action, Comedy, etc.)
- [ ] **Search** finds real movies when you type
- [ ] **Details** shows cast, overview, and source list
- [ ] **Player** plays the demo Big Buck Bunny video

---

## 8. File Structure Reminder

```
vidaamovieshub/
├── apps/
│   ├── server/src/server.js     ← Backend
│   └── tv-client/src/           ← Frontend
├── data/
│   ├── providers.json           ← YOUR SECRET CONFIG (not in git)
│   ├── providers.example.json   ← Template (in git)
│   └── catalog.json             ← Demo catalog (in git)
├── scripts/
│   └── setup-check.js          ← Diagnostic tool
├── docs/
│   └── windows-setup.md         ← This file
└── package.json
```

---

## 9. If You Want to Contribute Back to Git

Since `data/providers.json` is `.gitignore`d, you can safely commit other changes without exposing your credentials:

```powershell
git add -A
git commit -m "your changes"
git push origin codex/complete-the-ui-interface
```

Your `providers.json` will stay safely on your laptop only.

---

**Need more help?** Run `node scripts/setup-check.js` and copy the output to share.
