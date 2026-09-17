# Spy in the Room deployment runbook

Spy in the Room is a standalone Vercel project with a static frontend, Vercel Node.js Functions under `/api`, and an external Postgres database. The Vercel filesystem is not a database. Mission Control only links to the standalone production URL; it does not proxy Spy in the Room requests or share its tables.

## Configuration

The project pins Node 24.x and the Postgres driver in `package.json` and `package-lock.json`. Vercel detects the Node.js Functions automatically; the `functions` block in `vercel.json` only sets their maximum duration. Configure these variables in the environment that will serve the app:

| Variable | Value and rule |
| --- | --- |
| `DATABASE_URL` | Postgres connection string for the target environment. Required for migrations and API game execution. Use a disposable database for local development and a separate database for Preview when possible. |
| `SESSION_SECRET` | Long random secret used to hash anonymous session tokens. Keep it out of Git and use different values for Preview and Production. |
| `APP_ORIGIN` | Exact browser origin, including scheme and host and, when needed, port. Examples: `http://localhost:3000`, `https://spy-preview.example.vercel.app`, or `https://spy.example.com`. Do not add a path or trailing slash. |
| `CRON_SECRET` | Long random secret sent as the Vercel Cron `Authorization: Bearer` value. Required in Preview/Production so the cleanup endpoint fails closed. |

In production, the game API configuration path rejects missing values, including `CRON_SECRET`. For local development, set all four explicitly even though the code has a localhost fallback for `APP_ORIGIN`; local cleanup may omit the cron secret for convenience.

`APP_ORIGIN` is singular. Each environment accepts one exact origin value, not a list of local, Preview, and Production origins. Use the origin that actually serves that environment.

Migration `003_spyfall_refinements.sql` adds the five-round limit and persisted ordered guesses and points. Migration `004_custom_secret_mode.sql` adds the explicit secret-mode marker and custom-secret round storage used by the current release. Apply both before deploying the corresponding code to a database that already has migrations 001 and 002.

## Database provisioning

Postgres is external to Vercel. Vercel does not provision, persist, back up, or restore the game's database, and this repository does not contain a database instance. Before running migrations or the API, the operator must provision three separate database targets:

- a disposable/local Postgres database for local development and migration experiments;
- a separate Preview Postgres database for Vercel Preview deployments; and
- a separate Production Postgres database for live traffic.

Obtain each connection string through a protected secret store, shell environment, CI secret, or Vercel environment variable. Never commit a connection string, paste a real credential into `.env.example`, or point local testing at the Production database. The three targets may use the same provider, but they must remain separate so local and Preview migrations or test data cannot change live games.

## Local development

There are two local paths. The in-memory path is the fastest way to try or
review the game; the Postgres path is the only one that exercises migrations,
sessions, and persistence end to end.

### In-memory development server

```bash
cd "1 Projects/Spy game"
npm install
npm run dev
```

`scripts/dev-server.js` serves the static shell and calls the real API route
handlers against an in-memory store on <http://localhost:3000>. Games reset
when the process exits, and the script refuses to start when `NODE_ENV` or
`VERCEL_ENV` is `production`. Use it for UI work, screenshots, and manual
play-throughs; use the Postgres path below before trusting persistence or
migration behavior.

### Postgres-backed Vercel development

Use a disposable Postgres database. Do not point local testing at the production database.

```bash
cd "1 Projects/Spy game"
npm install

export DATABASE_URL='postgres://user:password@host/database'
export SESSION_SECRET="$(openssl rand -base64 32)"
export APP_ORIGIN='http://localhost:3000'

node scripts/migrate.js
npx vercel dev
```

`node scripts/migrate.js` reads the migration directory, applies pending files in numeric order, and records applied versions in `schema_migrations`. It runs the migration batch in a transaction and rolls it back if a migration fails. It must be run against the same database named by `DATABASE_URL` before exercising the game API.

`npx vercel dev` is the local Vercel-compatible server. A Python static server can display the files, but it cannot execute the `/api` Functions and therefore cannot create, resume, or mutate a Phase 2 game.

### Session bootstrap and cookie behavior

The browser starts with `GET /api/games`. If no valid session cookie is present, the route creates an anonymous session and responds with `Set-Cookie` for `spy_session`. The cookie is `HttpOnly`, `Path=/`, `SameSite=Lax`, has `Max-Age=2592000` and a matching `Expires`, and is marked `Secure` in production. The browser API client uses credentials on every request; application JavaScript cannot read the cookie.

`POST /api/games` can also emit the cookie if a client skipped the bootstrap request, but the supported browser flow is to bootstrap with `GET /api/games` first. Card, action, snapshot, history, and delete routes use the existing cookie to authorize the owning anonymous session. A missing or foreign session is not allowed to read or mutate a game.

POST mutations send JSON and an idempotency key. `DELETE /api/games/:gameId` sends an empty body and does not use a revision or command receipt. When an `Origin` header is present, the server requires an exact string match with `APP_ORIGIN`; a different origin receives `ORIGIN_MISMATCH`. This is an exact comparison, so a wrong scheme, port, hostname, path, or trailing slash can break mutations. Same-origin requests do not need CORS configuration. Session-specific and card responses are `Cache-Control: no-store`.

## Vercel deployment

1. Create or open the standalone Vercel project for this app. Set its Root Directory to exactly `1 Projects/Spy game`. The repository root is the Second Brain vault, not the Vercel project root.
2. Provision or select the separate Preview and Production Postgres databases, then configure the environment variables separately for Preview and Production. Use the Preview origin and Preview database for Preview, and the final production origin and Production database for Production. Do not copy a production connection string into Preview by accident.
3. Install dependencies and run the migrations against the database for the target environment before routing traffic there:

   ```bash
   cd "1 Projects/Spy game"
   npm install
   DATABASE_URL='postgres://target-connection' node scripts/migrate.js
   ```

   Keep the connection string in the shell, CI secret store, or another protected mechanism. Do not write it into a committed file. The migration files are source-controlled, but the Vercel packaging ignore rules exclude migrations and scripts from the runtime asset bundle, so migrations are an explicit release step.
4. Deploy a Preview first. Check `https://<preview-domain>/api/health` and expect JSON `{ "data": { "ok": true } }`, not the frontend shell. With the Preview database migrated, exercise `GET /api/games`, create/resume, a private card handoff, and one mutation. Confirm the nested `/api/games/:gameId/card`, `/actions`, and `/rounds` routes resolve as Functions rather than being rewritten to `index.html`.
5. Before the first Production request, apply all pending migrations to the Production database, set `CRON_SECRET`, and verify that Production `APP_ORIGIN` is the final HTTPS origin. Deploy, check both `https://<production-domain>/api/health` and `https://<production-domain>/api/ready`, and run the same smoke path. A missing or failing readiness check must block traffic.
6. Confirm the Vercel Cron job invokes `/api/maintenance/cleanup` daily at 03:00 UTC and returns `200` in platform logs. Do not call it from the public browser; it is an operational endpoint protected by `CRON_SECRET`.
7. Record the standalone Production URL as the Mission Control link target. Mission Control should link directly to `https://<production-domain>/`; it should not link to an internal file route, a local address, or a Mission Control API path.

No custom frontend build is required. `package.json` selects the Node 24 Function runtime, and the frontend assets remain same-origin with the API. The root page registers `service-worker.js` when supported; its versioned cache contains only the public shell and `offline.html`. Do not add API routes or private response URLs to that precache list.

The manifest and service worker make installation a convenience, not a requirement. Test both installed and normal-tab modes. The offline fallback is deliberately not a local game mode: it explains that saved-game state must be reconciled with the server before play continues. If a future local-only Quick Play mode is added, keep it as a separate, explicitly labelled threat-modelled product surface.

## Migration safety

Migrations are append-only. The runner sorts numbered `.sql` files and skips versions recorded in `schema_migrations`. Never edit an already-applied migration as the sole repair path. Add a higher-numbered forward migration, test it against a restored disposable database, and apply it to Preview before Production.

Before a production migration, take a provider-supported Postgres backup or snapshot and confirm that it can be restored to a disposable database. Review destructive statements and foreign-key effects. A successful Vercel deployment only proves that a new code bundle was published. Vercel deployment history is not a database backup and cannot restore games, sessions, round history, or tombstones.

## Backups and recovery

Use the Postgres provider's backups, point-in-time recovery, or scheduled logical exports. Define a retention period, restrict who can restore or download them, and periodically perform a restore drill into a disposable database. Keep backups independent of Vercel and Git. Do not treat `schema_migrations`, game tombstones, or deployment history as backups.

If a release fails after a migration, first stop traffic or roll back application code only when the schema remains compatible. Do not edit or delete migration history to make the deployment appear healthy. Fix forward with a new migration, or restore the database only through the provider's documented recovery process.

## Secret and origin rotation

Rotate `SESSION_SECRET` deliberately and coordinate it with a deployment. Existing anonymous session cookies are HMAC-checked with the configured secret, so changing the secret invalidates those cookies. Existing rows and games remain in Postgres, but browsers with old cookies will need a new session bootstrap and will not automatically regain ownership of the old session's games. Plan this as a reset of anonymous access, not as a harmless config refresh.

Rotate `DATABASE_URL` by updating the protected environment value, verifying migrations against the new database, and deploying only after the new target is ready. Rotate Preview and Production independently. Never print or commit either the connection string or `SESSION_SECRET`.

When changing domains, update `APP_ORIGIN` to the exact new origin before traffic moves. Keep the old origin only as long as the cutover requires it, then remove it. A stale or slash-terminated value causes mutation origin checks to fail even when GET requests appear healthy.

## What each verification level proves

| Check | What it proves | What it does not prove |
| --- | --- | --- |
| `npm test` | Phase 1 rules, static packaging contracts, memory-store behavior, route contracts, validation, and fake-client transaction tests. | A real Postgres connection, real migration, or deployed Vercel Function. |
| `node --check ...` and `git diff --check` | JavaScript syntax and whitespace hygiene for the local checkout. | Database connectivity, environment wiring, cookies in a browser, or Vercel routing. |
| Local `npx vercel dev` with a disposable `DATABASE_URL` and applied migrations | Local Function routing, Postgres migrations, session bootstrap, cookie flow, persistence, origin checks, and server-authoritative transitions. | Vercel's deployed packaging, production `Secure` cookie behavior, or the final domain. |
| Preview deployment with Preview env vars and database | Vercel packaging, nested API routing, external Postgres connectivity, Preview cookies, and a real browser smoke path. | Production domain cutover and production database readiness. |
| Production smoke check | Final origin, database, health route, and Mission Control link target. | Ongoing backup/restore capability unless a restore drill was performed separately. |

Without `DATABASE_URL`, local tests can still pass, and `/api/health` can still return `200`, but game API execution and migrations cannot be verified. Do not call the Phase 2 deployment ready until a disposable or environment-specific Postgres check has passed.

## Troubleshooting

- `GET /api/health` works but `GET /api/games` fails: check `DATABASE_URL`, dependency installation, migrations, and the Function environment. Health is intentionally a lightweight route and does not prove database readiness.
- `GET /api/ready` returns `503`: check all production environment variables, especially `CRON_SECRET`, and confirm the database accepts a `SELECT 1` connectivity check.
- The cleanup cron returns `401` or `503`: verify that Vercel has `CRON_SECRET` in the same environment and that the platform sends its `Authorization: Bearer` header. The endpoint intentionally fails closed when the secret is missing.
- Mutations return `ORIGIN_MISMATCH`: compare the request origin and `APP_ORIGIN` character-for-character, including `http` versus `https`, port, and trailing slash.
- A game returns `404` after refresh: bootstrap with `GET /api/games` and confirm the browser still has the owning session cookie. A foreign session is intentionally indistinguishable from an unknown game.
- A nested API URL returns HTML: verify the Vercel Root Directory is `1 Projects/Spy game` and that the request is going to `/api/...`; `/api` routes must not be rewritten to the static shell.
