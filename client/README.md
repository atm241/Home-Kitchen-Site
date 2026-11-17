# Simmer client

The React front end (Create React App, TypeScript, CSS Modules). In Docker
it's built and served by nginx, which also proxies `/api` and `/uploads` to
the server (`nginx.conf`).

- `npm start`: dev server on http://localhost:3000. Set
  `REACT_APP_API_URL=http://localhost:5001/api` in `client/.env` (copy
  `.env.example`).
- `npm run build`: production build into `build/`.
- `npx tsc --noEmit -p .`: typecheck.

Layout: `src/pages/` (one folder per screen), `src/components/`,
`src/services/api.ts` (every API call), `src/index.css` (design tokens),
`src/service-worker.ts` (offline caching).

See [DEVELOPMENT.md](../DEVELOPMENT.md) for the full dev setup.
