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
```

## Current MVP

- Home screen with demo rows.
- Details screen.
- Player screen.
- Remote/keyboard focus navigation.
- Basic settings screen.
- Local JSON catalog.
- Backend API for config, home, media details, and playback sources.
- PWA manifest starter for VIDAA/`vidaa-edge` workflows.

## API

```text
GET /api/config
GET /api/home
GET /api/media/:id
GET /api/playback/:id
```

## Next Steps

See [`PLAN_OBJECTIVES.md`](./PLAN_OBJECTIVES.md) for the implementation roadmap.
