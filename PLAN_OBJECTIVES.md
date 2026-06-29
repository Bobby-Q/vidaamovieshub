# VIDAA MoviesHub — Plan, Objectives, and MVP Scope

## Product Goal

Build a fast, lightweight, remote-control-first movie, TV show, and live TV web app for VIDAA-based TVs. The first version is for personal/internal use, hosted as a web app, and prepared for launch or installation through a VIDAA web/PWA workflow such as `vidaa-edge`.

## Core Principles

- VIDAA-first: small bundles, conservative browser features, no required mouse/touch input.
- Remote-first: every screen must work with arrows, OK/Enter, Back, playback keys, and channel keys where useful.
- Fast loading: show skeleton/loading states, cache catalog data later, lazy-load imagery, and avoid blank screens.
- Backend-assisted: provider aggregation, metadata matching, source ranking, and heavy processing belong on the server.
- Adapter-based playback: use native HTML5 video first, then add HLS/DASH helpers only where needed.

## MVP Objective

The MVP proves the app can launch, navigate, open details, and play a source on a VIDAA TV browser before adding TMDb, Xtream, M3U, and richer provider support.

## MVP Features

1. TV-ready home screen.
2. Remote navigation and visible focus states.
3. Details screen with metadata, favorite toggle, and source list.
4. Search, Favorites, and Live TV list screens.
5. Player screen with HTML5 video playback.
6. Basic source fallback structure.
7. Local JSON demo catalog.
8. Lightweight Node backend exposing config, home, media, search, live, and playback APIs.
9. VIDAA-safe styling and hosted static assets.
10. PWA manifest starter for `vidaa-edge` workflows.

## Initial Execution Order

1. Create project structure.
2. Add shared data shape through JSON catalog conventions.
3. Build static TV client shell.
4. Build Home, Details, Player, and Settings screens.
5. Implement focus navigation and key handling.
6. Add backend APIs.
7. Wire client to backend.
8. Add demo playback sources.
9. Run syntax checks.
10. Test hosted build on target VIDAA TV.
11. Add TMDb metadata matching.
12. Add Xtream and M3U providers.
13. Add Live TV categories, channels, and EPG.
14. Optimize image loading, row virtualization, cache, and playback fallback.

## Post-MVP Roadmap

### Metadata

- TMDb search and matching.
- Poster/backdrop fetching.
- Metadata cache.
- Image proxy and optimization.

### Providers

- Xtream Codes account support.
- M3U playlist support.
- Manual source editor.
- Provider priority and source health checks.

### Live TV

- Categories.
- Channel list.
- EPG.
- Favorites.
- Channel up/down.
- Number-key channel entry.

### TV Shows

- Seasons.
- Episodes.
- Resume episode.
- Auto-next overlay.

### Polish

- Continue watching persistence.
- Favorites.
- Search.
- Apple TV-inspired hero refinements.
- Lightweight glass-like panels without heavy blur.
- Performance profiling on VIDAA hardware.

## MVP Acceptance Criteria

- App launches from the Node server.
- Home screen renders catalog rows.
- Keyboard/remote navigation moves focus.
- OK opens details or activates buttons.
- Back returns to the previous screen.
- Details screen fetches metadata and playback sources from the backend.
- Player screen attempts playback from a configured source.
- No screen requires mouse input.
- App uses conservative browser features suitable for VIDAA testing.
- Search, Live TV, and Favorites entry points are available from Home.
