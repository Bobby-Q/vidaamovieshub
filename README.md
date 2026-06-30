# Aether Stream

Aether Stream is a cinematic TV web app for movies, TV shows, and live TV streaming. Built with a zero-dependency philosophy, it features TMDb integration for real metadata, IPTV provider support (Xtream/M3U), and a remote-control-first interface designed for smart TVs and browsers.

## Features

- **TMDb Integration** — Real movie and TV show metadata, posters, backdrops, and cast info
- **IPTV Provider Support** — Xtream Codes and M3U playlist integration for live TV and VOD
- **Aether.bar-like Design** — Cinematic dark UI with hero carousel, category browsing, and polished card layouts
- **Remote/Keyboard Navigation** — Arrow keys, Enter/OK, Back — no mouse required
- **Authentication** — Simple user accounts with token-based sessions
- **Watch History** — Tracks playback progress and viewing history
- **Source Fallback** — Automatic failover between multiple playback sources
- **PWA Ready** — Installable as a web app on supported devices

## Run

```bash
npm start
```

Open:

```text
http://localhost:4173
```

## Test

```bash
npm run check
npm test
```

## API Endpoints

```text
GET  /api/config              # App config and capabilities
GET  /api/providers           # Provider status (secrets hidden)
GET  /api/home                # Home screen with featured hero + rows
GET  /api/discover            # Same as /api/home
GET  /api/trending            # TMDb trending content
GET  /api/categories          # Genre categories
GET  /api/categories/:id      # Content by category
GET  /api/media/:id           # Media metadata (no sources)
GET  /api/playback/:id        # Playback sources
GET  /api/search?q=term       # Search across catalog + TMDb
GET  /api/live/categories     # Live TV categories
GET  /api/live/channels       # Live TV channels
POST /api/auth/register       # Create account
POST /api/auth/login          # Sign in
POST /api/auth/logout         # Sign out
GET  /api/auth/me             # Current user
GET  /api/history             # Watch history
POST /api/history             # Add to history
DELETE /api/history          # Clear history
```

## Configuration

Create `data/providers.json` with your credentials:

```json
{
  "metadata": {
    "tmdbApiKey": "YOUR_TMDB_API_KEY"
  },
  "providers": [
    {
      "id": "xtream-1",
      "type": "xtream",
      "name": "My IPTV",
      "enabled": true,
      "priority": 1,
      "serverUrl": "http://example.com",
      "username": "user",
      "password": "pass"
    },
    {
      "id": "m3u-1",
      "type": "m3u",
      "name": "My M3U",
      "enabled": true,
      "priority": 2,
      "playlistUrl": "http://example.com/playlist.m3u"
    }
  ]
}
```

## Architecture

- **Backend** — Zero-dependency Node.js server using built-in `http`, `https`, `fs`, `path`, `url`, `crypto`
- **Frontend** — Vanilla JavaScript, zero frameworks, plain DOM APIs
- **Styling** — Plain CSS with custom properties, no CSS frameworks
- **Storage** — `localStorage` for favorites, progress, auth tokens
- **Playback** — HTML5 `<video>` with source fallback

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Node.js 18+ (built-in modules only) |
| Frontend | Vanilla JavaScript (ES5-style for TV compatibility) |
| Styling | Plain CSS |
| Data | TMDb API, M3U playlists, local JSON |

## See Also

- [`PLAN_OBJECTIVES.md`](./PLAN_OBJECTIVES.md) — Implementation roadmap
- [`docs/`](./docs/) — Testing, deployment, provider setup, and VIDAA compatibility guides
