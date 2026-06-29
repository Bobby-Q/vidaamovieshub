# Testing

Run all local checks before moving to the next implementation task:

```bash
npm run check
npm test
```

`npm run check` performs syntax validation for the server, TV client, and test runner. `npm test` starts the server on a test port and validates catalog shape, API routes, source privacy on details responses, playback source ordering, static index serving, and 404 behavior.


Current API coverage includes `/api/config`, `/api/home`, `/api/search`, `/api/live/categories`, `/api/live/channels`, `/api/media/:id`, `/api/playback/:id`, static index serving, and missing-media 404 behavior.
