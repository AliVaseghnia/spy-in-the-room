# Spy Game Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone Vercel-deployable Spy app with Postgres-backed persistent shared-device games, resumable handoffs, authoritative deadlines, results history, replay, and deletion.

**Architecture:** Keep the existing vanilla HTML/CSS frontend and pure `game-logic.js` rules. Add a server-side service layer, a Postgres repository, session ownership, and thin Vercel Function route adapters. The browser talks to same-origin `/api` routes; Mission Control only links to the resulting standalone production URL.

**Tech Stack:** Vanilla JavaScript, Node.js 20+, Vercel Node.js Functions, external Postgres through `@neondatabase/serverless`, SQL migrations, and Node's built-in `node:test`/`node:assert`. No frontend framework or build step.

**Spec:** `1 Projects/Spy game/docs/superpowers/specs/2026-09-07-spy-game-phase-2-design.md`

## Global Constraints

- The project is standalone and Vercel-ready; Mission Control does not import Spy code or share Spy tables.
- Persistent storage is external Postgres. Never write SQLite, secrets, or game state into the Vercel filesystem, Git, iCloud, or browser storage.
- Keep the existing five game phases and Phase 1 rules: 4 to 8 players have one spy; 9 to 12 have two; wrong accusation immediately gives spies the win; a correct accusation opens one spy guess.
- All game transitions validate the owning session, phase, input, `expectedRevision`, and `idempotencyKey` in one transaction before committing. Creation uses a session-scoped `Idempotency-Key` and no revision; deletion uses an ownership-checked tombstone and is repeatable without a revision.
- `GameSnapshot` contains only game ID, round number, phase, timer, player identity/seat data, current player, reveal index, deadline, accused player, result-only outcome, and revision. It never includes active location, category, spy flags, assignments, or card content. Card responses are `Cache-Control: no-store` and contain only the current handoff card.
- Derive timer display from an absolute server deadline; do not persist decrementing seconds or rely on a long-running timer process.
- Use a cryptographically random HttpOnly SameSite cookie and store only its hash in Postgres.
- Use `Max-Age=2592000` plus aligned `Expires` on session cookies, enforce `APP_ORIGIN` on mutations, reject non-JSON/oversize bodies, and mark all session-specific responses `Cache-Control: no-store`.
- Keep visible copy free of em-dashes, preserve accessible focus and announcements, and keep tap targets at least 44px high.
- Serialize browser mutations per game, reuse keys for retries, discard stale responses, and fetch authoritative state when a focused timer reaches zero. The secret card container is not an `aria-live` region.
- Every new behavior gets a test. Run the existing Phase 1 tests after every server or frontend slice.
- Do not add accounts, public matchmaking, individual-phone authentication, WebSockets, payments, analytics, or user-generated decks in this phase.

## File Map

Create the following server/deployment files:

- `1 Projects/Spy game/package.json` — Node runtime metadata, scripts, and the Postgres driver dependency.
- `1 Projects/Spy game/vercel.json` — explicit Vercel project configuration for static assets and API functions.
- `1 Projects/Spy game/.env.example` — non-secret environment variable names and local setup notes.
- `1 Projects/Spy game/.gitignore` — exclude `node_modules`, `.env` files, and local database/test artifacts.
- `1 Projects/Spy game/.vercelignore` — exclude tests, fixtures, docs, migrations, scripts, and environment files from the deployment asset set.
- `1 Projects/Spy game/package-lock.json` — pin the exact Node/Postgres dependency graph used by local and Vercel builds.
- `1 Projects/Spy game/database/migrations/001_initial.sql` — ordered Postgres schema.
- `1 Projects/Spy game/database/migrations/002_tombstone_retention.sql` — forward migration removing the historical owner cascade from databases that already applied migration 001.
- `1 Projects/Spy game/scripts/migrate.js` — local/CI migration runner using `DATABASE_URL`.
- `1 Projects/Spy game/api/health.js` — deployment health endpoint.
- `1 Projects/Spy game/server/config.js` — environment parsing and production safety checks.
- `1 Projects/Spy game/server/http.js` — JSON parsing, response helpers, cookie/header handling, and common errors.
- `1 Projects/Spy game/server/session.js` — secure session token creation, hashing, cookie parsing, and session persistence calls.
- `1 Projects/Spy game/server/game-service.js` — server-authoritative game transitions against a repository contract.
- `1 Projects/Spy game/server/postgres-store.js` — Postgres repository implementation.
- `1 Projects/Spy game/server/memory-store.js` — deterministic test repository implementing the same contract.
- `1 Projects/Spy game/server/validation.js` — request and action validation at the API boundary.
- `1 Projects/Spy game/api/games/index.js` — create and list routes.
- `1 Projects/Spy game/api/games/[gameId].js` — snapshot and delete routes.
- `1 Projects/Spy game/api/games/[gameId]/card.js` — reveal and hide handoff route.
- `1 Projects/Spy game/api/games/[gameId]/actions.js` — end-round, accuse, guess, and replay route.
- `1 Projects/Spy game/api/games/[gameId]/rounds.js` — completed-round history route.
- `1 Projects/Spy game/api/_test/` — only if route adapters need isolated test fixtures; files under `_` must never become Vercel Functions.

Modify the frontend and docs:

- `1 Projects/Spy game/index.html` — add resume/history/error surfaces and load the API client.
- `1 Projects/Spy game/styles.css` — style the new surfaces without changing the established dark amber system.
- `1 Projects/Spy game/api-client.js` — browser fetch wrapper with consistent error parsing and idempotency keys.
- `1 Projects/Spy game/game.js` — render server snapshots and call the API instead of owning assignments/outcomes locally.
- `1 Projects/Spy game/README.md` — replace the offline-only instructions with local and Vercel deployment instructions.
- `1 Projects/Spy game/docs/deployment.md` — Postgres, Vercel, backups, health checks, and Mission Control link instructions.
- `1 Projects/Spy game/test/phase2.test.js` — service, repository-contract, privacy, conflict, and transition tests.
- `1 Projects/Spy game/test/phase2-static.test.js` — static HTML/API contract checks that do not need a database.
- `1 Projects/Spy game/test/phase2-postgres.test.js` — disposable-Postgres integration tests, skipped only when the explicitly configured integration URL is absent.
- `1 Projects/Spy game/test/fixtures/` — disposable database fixtures and fresh-process helpers only; never published to Vercel.

---

### Task 1: Vercel/Postgres foundation and migration contract

**Files:**
- Create: `package.json`, `vercel.json`, `.env.example`, `.gitignore`
- Create: `database/migrations/001_initial.sql`, `scripts/migrate.js`, `api/health.js`
- Create: `server/config.js`, `server/http.js`
- Test: `test/phase2-static.test.js`

**Interfaces:**
- `readConfig(env)` returns `{ databaseUrl, sessionSecret, appOrigin, isProduction }` and throws a named configuration error when production secrets are missing.
- `sendJson(response, status, body, headers = {})` always sets `Content-Type: application/json; charset=utf-8` and never emits an HTML error body.
- `parseJsonBody(request, maxBytes = 65536)` returns a parsed object or a structured `VALIDATION_ERROR`.
- `api/health.js` responds `GET /api/health` with `{ data: { ok: true } }` and no database secret.
- Migrations `001_initial.sql` and `002_tombstone_retention.sql` create and evolve `schema_migrations`, `sessions`, `games`, `players`, `rounds`, `assignments`, `command_receipts`, `creation_receipts`, and `game_tombstones`, with foreign keys, unique constraints, tombstone retention, and indexes needed by session/game lookup. Fixes are forward migrations; an already-applied migration is never edited as the sole repair path.

- [ ] **Step 1: Add failing static tests for project metadata, packaging, and schema invariants.** Assert that `package.json` declares Node 20+, an exact Postgres driver version, `test` and `migrate` scripts; the lockfile is present; `vercel.json` does not route `/api` to the static shell; `.gitignore` and `.vercelignore` exclude secrets/non-runtime assets; and the ordered migrations contain every table, the uniqueness constraints from the spec, and the forward tombstone-retention repair.
- [ ] **Step 2: Run the focused static test and confirm it fails because the Phase 2 files do not exist.**

Run: `node --test '1 Projects/Spy game/test/phase2-static.test.js'`

Expected: FAIL with missing-file or missing-contract assertions.
- [ ] **Step 3: Implement the project metadata, migration, config, JSON helpers, health route, and migration runner.** Use CommonJS so the existing Node test runner and Vercel Node Functions share one module format. The migration runner must split only on the explicit migration boundary or execute the migration as one Postgres script; it must not silently ignore SQL errors. Pin the Node and driver versions, and add a packaging shape check that preserves nested API paths without rewriting `/api/**` to the static shell.
- [ ] **Step 4: Run the focused static tests, syntax checks, and the existing Phase 1 test file.**

Run: `node --test '1 Projects/Spy game/test/phase2-static.test.js' && node --check '1 Projects/Spy game/api/health.js' && node --check '1 Projects/Spy game/scripts/migrate.js' && node --test '1 Projects/Spy game/test/game-logic.test.js'`

Expected: all tests pass and both syntax checks exit 0.
- [ ] **Step 5: Commit the foundation.**

Run: `git add '1 Projects/Spy game/package.json' '1 Projects/Spy game/vercel.json' '1 Projects/Spy game/.env.example' '1 Projects/Spy game/.gitignore' '1 Projects/Spy game/database' '1 Projects/Spy game/scripts' '1 Projects/Spy game/api/health.js' '1 Projects/Spy game/server/config.js' '1 Projects/Spy game/server/http.js' '1 Projects/Spy game/test/phase2-static.test.js' && git commit -m "feat: add Vercel and Postgres foundation"`

### Task 2: Session ownership, repository contract, and create/resume API

**Files:**
- Create: `server/session.js`, `server/validation.js`, `server/memory-store.js`, `server/postgres-store.js`, `server/game-service.js`
- Create: `api/games/index.js`, `api/games/[gameId].js`
- Test: `test/phase2.test.js`

**Interfaces:**
- `createSession({ store, env, now })` returns `{ rawToken, session }`; only `hashToken(rawToken)` is stored. The cookie uses `Max-Age=2592000` and aligned `Expires`.
- `getSessionFromRequest(request, store, env, now)` returns an owned session or `null` without disclosing whether a token existed.
- `createGame({ store, sessionId, players, timerSeconds, random, now })` returns a sanitized `GameSnapshot` beginning in `reveal`.
- `getGameSnapshot({ store, sessionId, gameId, now })` returns the pre-deadline sanitized snapshot or a not-found result. Deadline reconciliation belongs to Task 3 and is not duplicated here.
- `listGames({ store, sessionId, limit, cursor })` returns `{ items, nextCursor }` and never includes active secrets.
- `deleteGame({ store, sessionId, gameId })` deletes dependent data and inserts a minimal tombstone atomically; owner repeats return success, foreign/unknown IDs return `404`.
- `postgres-store.js` exposes an explicit checked-out-client transaction helper that guarantees `BEGIN`/`COMMIT`/`ROLLBACK`, row locking, receipt lookup before revision checks, and rollback of both state and receipts.
- `POST /api/games` requires a session-scoped `Idempotency-Key`, uses the bootstrap session from `GET /api/games`, and returns status `201`; `GET /api/games` always bootstraps a session cookie when absent and returns status `200`.
- `GET /api/games/:gameId` returns status `200` for the owner and `404` for another session or unknown ID; `DELETE` returns status `204` for an owned game.

- [ ] **Step 1: Write failing service tests for session hashing/cookie expiry, creation receipts, create, sanitized snapshots, list ownership, tombstone deletion, and delete ownership.** Include 4/8/9/12-player boundaries, invalid names/timers, a second session denial, same-key replay and hash mismatch, and assertions that snapshots contain neither active `location`, `category`, `isSpy`, `spyPlayers`, `assignments`, nor card content.
- [ ] **Step 2: Run the focused service tests and confirm they fail before the service/store modules exist.**

Run: `node --test '1 Projects/Spy game/test/phase2.test.js'`

Expected: FAIL with missing-module or missing-function errors.
- [ ] **Step 3: Implement the validation, session, memory-store, and service contracts.** Enforce JSON content type, the 64 KiB limit, mutation `Origin` checks, stable request hashing, and the exact `GameSnapshot`/creation receipt/tombstone contracts. The memory store must model transaction boundaries deterministically so later action tests can use the same service code as production.
- [ ] **Step 4: Implement the Postgres store with parameterized queries and an explicit checked-out-client transaction.** It may lazily require `@neondatabase/serverless` so pure tests do not need a live database, but production requests must fail clearly when `DATABASE_URL` is missing. Lock the game row, check matching receipts before stale revisions, use canonical request hashes, and map foreign-key/unique violations to structured application errors.
- [ ] **Step 5: Implement the create/list/snapshot/delete Vercel route adapters.** Route handlers must use the same session and service functions as tests, set cookie attributes based on production mode, and never serialize store rows directly.
- [ ] **Step 6: Run the focused service/API tests and the Phase 1 suite.** Session-specific route responses must be `no-store`, and mutations must reject a bad `Origin` or content type.

Run: `node --test '1 Projects/Spy game/test/phase2.test.js' && node --test '1 Projects/Spy game/test/game-logic.test.js' && node --check '1 Projects/Spy game/server/game-service.js' && node --check '1 Projects/Spy game/api/games/index.js' && node --check '1 Projects/Spy game/api/games/[gameId].js'`
- [ ] **Step 7: Commit the create/resume slice.**

Run: `git add '1 Projects/Spy game/server' '1 Projects/Spy game/api/games/index.js' '1 Projects/Spy game/api/games/[gameId].js' '1 Projects/Spy game/test/phase2.test.js' && git commit -m "feat: persist owned Spy games"`

### Task 3: Server-authoritative handoff, deadline, and outcome actions

**Files:**
- Modify: `server/game-service.js`, `server/memory-store.js`, `server/postgres-store.js`, `server/validation.js`
- Create: `api/games/[gameId]/card.js`, `api/games/[gameId]/actions.js`
- Modify: `test/phase2.test.js`

**Interfaces:**
- `applyCardAction({ store, sessionId, gameId, action, expectedRevision, idempotencyKey, requestHash, now })` supports `reveal` and `hide`; reveal returns a one-card response without a revision increment, while hide returns a snapshot and increments once.
- `applyGameAction({ store, sessionId, gameId, command, expectedRevision, idempotencyKey, requestHash, now })` supports `end-round`, `accuse`, and `guess`; replay is added in Task 4 so its implementation is not duplicated.
- Card responses contain `{ data: { player, isSpy, location, category } }` for exactly one current handoff; spy cards use `location: null` and `category: null`; card responses set `Cache-Control: no-store`.
- Action responses return `{ data: GameSnapshot }` and `meta.revision`; duplicate idempotency keys replay the original acknowledgement before checking `expectedRevision`.
- A stale revision returns HTTP `409` with code `REVISION_CONFLICT` and a safe current snapshot in `details` or via the next GET.

- [ ] **Step 1: Add failing tests for reveal privacy, hide advancement, final-card deadline, expiry reconciliation, duplicate commands, stale revisions, all three outcome paths, replay, and illegal phase transitions.** Assert that a general snapshot never contains secret fields, that the final hide starts the timer with an absolute deadline, and that replay chooses a different location when possible.
- [ ] **Step 2: Run the focused tests to confirm the new behaviors fail.**
- [ ] **Step 3: Implement one transactional mutation path in the service/store.** Use a checked-out Postgres client with explicit `BEGIN`/`COMMIT`/`ROLLBACK`; lock ownership and the game row, look up a matching receipt before comparing revisions, claim idempotency keys with a unique constraint, update the game and round, then store the acknowledgement. Do not check revision in one query and update in a later unguarded query. The memory implementation must preserve the same ordering.
- [ ] **Step 4: Implement deadline reconciliation.** On reads and mutations, if `current_deadline_at <= now` while phase is `round`, atomically transition to `accuse`, clear the deadline, and increment the revision once. If the caller's revision is now stale, commit reconciliation and return `409`; do not roll it back merely because the command is rejected.
- [ ] **Step 5: Implement the card and action route adapters with consistent error bodies, mutation-origin/content-type checks, and no-store card/session headers.**
- [ ] **Step 6: Run the transition tests, Phase 1 tests, and syntax checks.**

Run: `node --test '1 Projects/Spy game/test/phase2.test.js' && node --test '1 Projects/Spy game/test/game-logic.test.js' && node --check '1 Projects/Spy game/api/games/[gameId]/card.js' && node --check '1 Projects/Spy game/api/games/[gameId]/actions.js'`
- [ ] **Step 7: Commit the authoritative game state slice.**

Run: `git add '1 Projects/Spy game/server' '1 Projects/Spy game/api/games/[gameId]/card.js' '1 Projects/Spy game/api/games/[gameId]/actions.js' '1 Projects/Spy game/test/phase2.test.js' && git commit -m "feat: make Spy rounds server authoritative"`

### Task 4: Results history, replay, and deletion API

**Files:**
- Modify: `server/game-service.js`, `server/postgres-store.js`, `server/memory-store.js`
- Create: `api/games/[gameId]/rounds.js`
- Modify: `test/phase2.test.js`

**Interfaces:**
- `listRoundHistory({ store, sessionId, gameId, limit, cursor })` returns completed results in descending round order, with bounded pagination and no active secrets.
- `replay` extends the action service with the same transaction/idempotency contract, creates the next round with the same players/timer and a fresh location while preserving earlier results.
- `DELETE /api/games/:gameId` removes all dependent rows and inserts the owner tombstone within one transaction. It has no expected revision or command receipt: repeated owner deletes return `204`, foreign/unknown IDs return `404`.

- [ ] **Step 1: Add failing history, replay, delete-cascade, and pagination tests.** Verify 4/8/9/12-player round boundaries and that another session cannot see history or delete the game.
- [ ] **Step 2: Implement the history query and replay/delete service operations.** Keep completed location and spies available only through completed history/result responses. Add the `replay` branch here, not in Task 3, and preserve the tombstone delete semantics from Task 2.
- [ ] **Step 3: Implement `GET /api/games/:gameId/rounds` and update the existing game route's delete path.**
- [ ] **Step 4: Run all server tests and confirm the migration's foreign keys support the delete behavior and tombstone retention.**

Run: `node --test '1 Projects/Spy game/test/phase2.test.js' && node --test '1 Projects/Spy game/test/game-logic.test.js'`
- [ ] **Step 5: Commit the history slice.**

Run: `git add '1 Projects/Spy game/server' '1 Projects/Spy game/api/games/[gameId].js' '1 Projects/Spy game/api/games/[gameId]/rounds.js' '1 Projects/Spy game/test/phase2.test.js' && git commit -m "feat: retain Spy round history and replay"`

### Checkpoint: Server core

- [ ] The migration parses and applies cleanly against a disposable Postgres database, and a fresh process can resume from the same database.
- [ ] Pure rules and server service tests pass.
- [ ] All API routes have structured error responses and ownership checks.
- [ ] No active location or assignment appears in a general snapshot.
- [ ] The server can resume a game after a new process invocation because all required state is in Postgres. Disposable-Postgres tests cover concurrency, unique receipt claims, rollback, expiry, cross-session denial, replay/history, and deletion.

### Task 5: Connect the browser controller to the server

**Files:**
- Create: `api-client.js`
- Modify: `index.html`, `styles.css`, `game.js`
- Test: `test/phase2-static.test.js`, plus real-browser verification

**Interfaces:**
- `window.SpyGameApi.createGame(input)`, `.listGames()`, `.getGame(gameId)`, `.getCard(gameId, action, revision)`, `.act(gameId, command, revision)`, `.listRounds(gameId)`, and `.deleteGame(gameId)` return parsed `{ data, meta }` values or throw an error with `{ code, status, message }`.
- Every mutating client request generates one idempotency key and reuses it for a retry of the same user intent.
- `game.js` owns only the sanitized client snapshot, visible current card, connection state, an async generation, a per-game mutation queue, and a display interval. It never stores assignments, locations, or an active card in browser storage.

- [ ] **Step 1: Add static tests for the API client load order, required resume/error/history IDs, no external asset URLs, and absence of `localStorage`/`sessionStorage` game-state writes.**
- [ ] **Step 2: Add the API client wrapper with JSON/error parsing, revision forwarding, credentials included, and no-store card handling.**
- [ ] **Step 3: Add the resume panel and connection error region to the semantic HTML.** It must offer `Resume` for owned active games, `New game`, and a visible retry message without exposing any secret.
- [ ] **Step 4: Replace local start/reveal/hide/end/accuse/guess/replay transitions with API calls.** Serialize mutations per game and reuse the same idempotency key for one retry. After every acknowledged mutation, render the returned snapshot and move focus to the next primary action. On `409`, reload the snapshot and announce that another tab changed the game; discard any response from an older UI generation.
- [ ] **Step 5: Derive the round timer from `deadlineAt - meta.serverNow` and refresh the snapshot on `visibilitychange`/window focus.** The display interval may update once per second, but it must never decide the outcome locally. When a focused display reaches zero, perform a GET and render the authoritative phase. Clear the secret card before hide/retry and keep its container out of `aria-live`.
- [ ] **Step 6: Render completed history in the result/debrief area and wire deletion to an explicit confirmation path.** Keep the same dark amber visual language and reduced-motion behavior.
- [ ] **Step 7: Run static checks, Node syntax checks, and the Phase 1 suite.**

Run: `node --test '1 Projects/Spy game/test/phase2-static.test.js' && node --test '1 Projects/Spy game/test/game-logic.test.js' && node --check '1 Projects/Spy game/api-client.js' && node --check '1 Projects/Spy game/game.js'`
- [ ] **Step 8: Commit the server-connected frontend.**

Run: `git add '1 Projects/Spy game/index.html' '1 Projects/Spy game/styles.css' '1 Projects/Spy game/api-client.js' '1 Projects/Spy game/game.js' '1 Projects/Spy game/test/phase2-static.test.js' && git commit -m "feat: connect Spy browser to persistent API"`

### Task 6: Deployment documentation and browser verification

**Files:**
- Modify: `README.md`
- Create: `docs/deployment.md`
- Modify: `test/phase2-static.test.js` if documentation contracts need coverage

- [ ] **Step 1: Document local setup.** Include Node 20+, `npm install`, `DATABASE_URL`, `SESSION_SECRET`, `APP_ORIGIN`, `node scripts/migrate.js`, and the local Vercel development command. State explicitly that a disposable Postgres database is required for API execution, and document the required session bootstrap and cookie origin behavior.
- [ ] **Step 2: Document Vercel deployment.** Include setting the project root to `1 Projects/Spy game`, adding Preview and Production environment variables separately, applying migrations before switching traffic, checking `/api/health`, and recording the production URL as the Mission Control link target.
- [ ] **Step 3: Document operational safety.** Include database backups, migration ordering, secret rotation, cookie origin requirements, and the fact that Vercel deployment history is not a database backup.
- [ ] **Step 4: Run the full local verification suite from the Spy project directory.**

Run from `1 Projects/Spy game`: `npm test && node --check game-logic.js && node --check game.js && node --check api-client.js && git diff --check`
- [ ] **Step 5: Run the disposable-Postgres integration suite and a real-browser smoke test against the local Vercel-compatible app or a preview deployment.** Verify create, refresh during reveal, secret clearing, deadline expiry, wrong accusation, correct and incorrect spy guesses, replay, history, deletion, retry after a failed request, mobile layout, keyboard focus, and zero console errors. Capture network evidence that active snapshots omit secrets, card responses are no-store, nested API routes resolve, and a focused timer expiry is reconciled server-side.
- [ ] **Step 6: Commit the deployment docs and final verification fixes.**

Run: `git add '1 Projects/Spy game/README.md' '1 Projects/Spy game/docs/deployment.md' '1 Projects/Spy game/test/phase2-static.test.js' && git commit -m "docs: document Spy Vercel deployment"`

### Checkpoint: Phase 2A complete

- [ ] The full test suite passes from a clean checkout with no secrets committed.
- [ ] A disposable Postgres migration, concurrency/rollback/restore check, and fresh-process resume pass.
- [ ] Real-browser verification covers the complete persistent shared-device flow.
- [ ] Vercel project files are ready for a user-owned deployment.
- [ ] Mission Control only needs the standalone production URL to link to the app.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Vercel Functions are stateless | High | Store every required state transition in Postgres; derive time from absolute deadlines. |
| Secret card leaks through a snapshot or cache | Critical | Separate card route, sanitized serializers, no-store headers, privacy tests, and no browser storage. |
| Duplicate taps/retries create duplicate outcomes | High | Unique idempotency keys and revision checks in the same database transaction. |
| Provider/database connection behavior differs locally | Medium | Keep a repository contract and deterministic memory store; run migration against disposable Postgres before deployment. |
| A Vercel Hobby deployment is paused or limits are reached | Medium | Keep the app personal/non-commercial, monitor usage, and document migration to a paid plan or the home server. |
| Existing Phase 1 controller assumptions conflict with server state | High | Replace transitions incrementally, keep pure rules unchanged, and verify each browser phase after integration. |

## Open Questions Resolved for This Plan

- **Standalone or Mission Control subsystem?** Standalone Vercel project. Mission Control links to the production URL.
- **SQLite or Postgres?** External Postgres. Vercel filesystem is not durable.
- **Shared-device or individual devices?** Shared-device persistence first. Individual-device capabilities are a later phase.
- **Realtime transport?** REST plus focus/reconnect refresh first. Realtime transport is deferred.
