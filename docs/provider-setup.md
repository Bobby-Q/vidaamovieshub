# Provider Setup

## Current MVP provider choices

The MVP intentionally uses safe, user-controlled sources only:

1. `local-json` — the included `data/catalog.json` demo catalog.
2. `xtream` — your personal Xtream Codes/IPTV provider credentials.
3. `m3u` — your personal M3U playlist URL.
4. `tmdb` metadata — optional future metadata enrichment for posters, backdrops, and descriptions.

No third-party scraping site is hardcoded. Add only sources that you are allowed to access.

## Where to input provider details

Copy the example provider file:

```bash
cp data/providers.example.json data/providers.json
```

On Windows PowerShell:

```powershell
Copy-Item data/providers.example.json data/providers.json
```

Then edit:

```text
data/providers.json
```

## Xtream Codes fields needed

For an Xtream provider, you need:

```json
{
  "id": "home-xtream",
  "type": "xtream",
  "enabled": true,
  "name": "Home Xtream Provider",
  "serverUrl": "https://your-xtream-server.example.com",
  "username": "your_username",
  "password": "your_password",
  "priority": 1
}
```

Typical Xtream APIs are based on:

```text
SERVER_URL/player_api.php?username=USERNAME&password=PASSWORD
SERVER_URL/player_api.php?username=USERNAME&password=PASSWORD&action=get_live_categories
SERVER_URL/player_api.php?username=USERNAME&password=PASSWORD&action=get_live_streams
SERVER_URL/player_api.php?username=USERNAME&password=PASSWORD&action=get_vod_streams
SERVER_URL/player_api.php?username=USERNAME&password=PASSWORD&action=get_series
SERVER_URL/xmltv.php?username=USERNAME&password=PASSWORD
```

The current MVP stores the configuration shape only. The next backend step is to add an `XtreamProvider` that reads this config and imports live, VOD, and series entries into the normalized catalog.

## M3U fields needed

For M3U, you need:

```json
{
  "id": "m3u-playlist",
  "type": "m3u",
  "enabled": true,
  "name": "Personal M3U Playlist",
  "playlistUrl": "https://example.com/playlist.m3u",
  "priority": 3
}
```

## Manual/local catalog input

For now, manually add playable items in:

```text
data/catalog.json
```

Each item needs at least:

```json
{
  "id": "unique-id",
  "type": "movie",
  "title": "Title",
  "poster": "/public/poster-demo.svg",
  "backdrop": "/public/backdrop-demo.svg",
  "sources": [
    {
      "id": "source-1",
      "provider": "manual",
      "url": "https://example.com/video.m3u8",
      "format": "hls",
      "quality": "1080p",
      "priority": 1
    }
  ]
}
```

Then add the item id to a row in `data/catalog.json`.

## Provider status endpoint

The backend exposes a sanitized provider-status endpoint:

```text
GET /api/providers
```

It reports whether provider entries are configured without returning passwords or raw secrets.
