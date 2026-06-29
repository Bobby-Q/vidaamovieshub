# VIDAA MoviesHub

VIDAA MoviesHub is a lightweight, remote-first TV web app MVP for personal VIDAA TV testing. It includes a small static TV client, a dependency-free Node backend, a demo catalog, and HTML5 playback.

## Run

```bash
npm start
```

Open:

```text
http://localhost:4173
```

## Check

```bash
npm run check
npm test
```

## Current MVP

- Home screen with demo rows.
- Details screen.
- Player screen.
- Remote/keyboard focus navigation.
- Basic settings screen.
- Local JSON catalog.
- Backend API for config, home, media details, and playback sources.
- Search screen backed by `/api/search`.
- Live TV screen backed by `/api/live/channels`.
- Local favorites toggle and Favorites screen.
- Playback resume tracking and next-source fallback controls.
- Capability display for VIDAA/browser testing.
- PWA manifest starter for VIDAA/`vidaa-edge` workflows.

## API

```text
GET /api/config
GET /api/home
GET /api/media/:id
GET /api/playback/:id
GET /api/search?q=term
GET /api/live/categories
GET /api/live/channels?category=name
```

## Next Steps

See [`PLAN_OBJECTIVES.md`](./PLAN_OBJECTIVES.md) for the implementation roadmap and [`docs/testing.md`](./docs/testing.md) for the local test workflow.
