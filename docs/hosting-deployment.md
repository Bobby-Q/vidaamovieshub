# Hosting Deployment Prerequisites

## Option A: Node-capable hosting

Use this if your hosting provider supports long-running Node.js apps.

Prerequisites:

- Node.js 18 or newer.
- Ability to run `node apps/server/src/server.js`.
- HTTPS domain for real TV usage.
- Environment/firewall allowing inbound web traffic.

Deployment shape:

```bash
npm run check
npm test
PORT=4173 npm start
```

Point your domain or reverse proxy to the Node server.

## Option B: Static hosting plus separate API

Use this if your hosting provider only serves static files.

Prerequisites:

- Static hosting for `apps/tv-client`.
- Separate Node/API host for `apps/server`.
- CORS configuration if frontend and API are on different domains.
- Update the client API base URL before deployment. The current MVP assumes same-origin `/api`.

## VIDAA / vidaa-edge preparation

For VIDAA testing, prefer HTTPS hosting and verify:

- App URL opens directly in the VIDAA browser.
- Remote buttons work.
- Video formats play.
- Settings screen reports useful HLS/MediaSource capability.
- Manifest is reachable at `/manifest.json`.

For `vidaa-edge`, use your final hosted app URL as the PWA/start URL.
