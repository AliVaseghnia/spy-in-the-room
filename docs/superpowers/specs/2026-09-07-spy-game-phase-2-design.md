# Spy Game Phase 2 Design

**Date:** 2026-09-07  
**Status:** Approved for implementation  
**Deployment target:** Standalone Vercel project with external Postgres storage

## Goal

Turn the Phase 1 same-device Spy game into a deployable full-stack app that can persist games, resume them after refresh or service restarts, retain completed rounds, and provide a clean URL that Mission Control can link to.

The first release remains a shared-device game. One browser owns a game session and the phone is passed between players. The server becomes authoritative for secret assignments, phase transitions, deadlines, outcomes, and replay state.

## Scope

### Included in Phase 2A

- Standalone Vercel project shape with static frontend assets and serverless API functions.
- External Postgres database accessed through a Vercel-compatible adapter.
- Anonymous browser sessions identified by a random, HttpOnly cookie whose hash is stored server-side.
- Creation of a game for 4 to 12 named players and a 3, 5, or 8 minute timer.
- Resume after refresh, browser close/reopen, cold starts, and database-backed deployment changes.
- Server-generated locations and assignments using the existing pure `game-logic.js` rules.
- Private card handoff where the server returns only the current card and never a complete assignment list to the browser.
- Absolute server-side round deadlines. Timer state is derived from the deadline rather than persisted as decrementing ticks.
- Server-authoritative accusation, spy-guess, result, replay, and deletion actions.
- Completed-round history for an owned game.
- Revision checks and idempotency keys for state-changing requests.
- Clear connection and conflict errors in the browser UI.
- Deployment documentation, environment variable examples, SQL migrations, and a Mission Control link target.

### Deferred

- Individual player devices or separate player authentication.
- Public accounts, email login, or social login.
- Public matchmaking, invite links, spectator mode, chat, or moderation.
- WebSockets and live multi-device synchronization.
- Payments, analytics, ads, or user-generated location decks.
- Keeping a server process or SQLite file on Vercel.

## Architecture

Spy is an independent application. Mission Control may link to it, but it does not import Spy code, share Spy tables, or proxy Spy state.

```text
Browser
  ├── static index.html, styles.css, game-logic.js, game.js
  └── REST requests to /api/games/...
          │
          ▼
Vercel Functions
  ├── validate request/session/action
  ├── apply one server-authoritative transition
  └── return a sanitized snapshot or one current private card
          │
          ▼
External Postgres
  ├── sessions
  ├── games and players
  ├── rounds and assignments
  ├── command receipts
  └── schema migrations
```

The Vercel project root is the Spy game folder. Relative frontend asset URLs must continue to work when the deployment is served from its own Vercel domain. The browser calls relative `/api/...` paths, so the same-origin frontend and API do not require CORS.

The frontend remains vanilla JavaScript. `game-logic.js` remains the single source of truth for pure rules and remains usable by Node tests. A new server-side service layer consumes those rules without importing DOM code. Vercel route handlers are thin adapters around the service layer.

### Canonical server contracts

The server owns the canonical state shape. The browser never reconstructs a game from the Phase 1 `round.cards`, `round.spies`, or `round.location` fields.

`GameSnapshot` is the sanitized response shape used by create, list metadata, get, hide, and action responses:

```json
{
  "gameId": "uuid",
  "roundNumber": 1,
  "phase": "reveal",
  "timerSeconds": 300,
  "players": [
    { "id": "uuid", "seat": 0, "displayName": "Ana" }
  ],
  "currentPlayer": { "id": "uuid", "seat": 0, "displayName": "Ana" },
  "revealIndex": 0,
  "deadlineAt": null,
  "accusedPlayer": null,
  "outcome": null,
  "revision": 1
}
```

`currentPlayer` is `null` outside `reveal`; `accusedPlayer` is `null` unless the accusation phase has an accused player. `outcome` is `null` until `result`. A result outcome may include `winner`, `reason`, `location`, `category`, `spyPlayers`, `accusedPlayer`, and `guess`; those fields are result/history data only. An active snapshot never contains a location, category, spy flag, spy player, assignment list, or card content. The server maps its player IDs to the pure rules' player indexes internally; display names are presentation only.

The private reveal response is a different contract and never contains a snapshot:

```json
{
  "data": {
    "card": {
      "player": { "id": "uuid", "seat": 0, "displayName": "Ana" },
      "isSpy": false,
      "location": "Airport",
      "category": "Travel"
    }
  },
  "meta": { "revision": 1, "serverNow": "2026-09-07T12:00:00.000Z" }
}
```

Spy cards use `location: null` and `category: null`. A `reveal` receipt replays this same one-card response, does not change the game revision, and is still `Cache-Control: no-store`; `hide` returns a `GameSnapshot` and increments the revision exactly once. Every committed game transition increments the revision exactly once.

## Persistence model

All timestamps are stored as UTC timestamps. IDs are random UUIDs. Foreign keys are enforced. The database is not stored in Git, iCloud, a Vercel deployment bundle, or the browser.

### `schema_migrations`

- `version` primary key
- `applied_at`

### `sessions`

- `id` UUID primary key
- `token_hash` unique, never the raw cookie value
- `created_at`
- `expires_at`

### `games`

- `id` UUID primary key
- `session_id` foreign key
- `timer_seconds`
- `current_round_number`
- `current_phase`
- `current_reveal_index`
- `current_deadline_at` nullable
- `current_accused_player_id` nullable
- `current_winner` nullable
- `current_reason` nullable
- `revision` integer, incremented for every committed mutation
- `created_at`, `updated_at`

### `players`

- `id` UUID primary key
- `game_id` foreign key
- `seat` integer
- `display_name`
- unique `(game_id, seat)`

Names are validated at the API boundary. Player IDs, not display names, are used for transitions.

### `rounds`

- `id` UUID primary key
- `game_id` foreign key
- `round_number`
- `location_name`
- `location_category`
- `phase`
- `reveal_index`
- `deadline_at` nullable
- `accused_player_id` nullable
- `guess` nullable
- `winner` nullable
- `reason` nullable
- `started_at`, `completed_at` nullable
- unique `(game_id, round_number)`

### `assignments`

- `round_id` foreign key
- `player_id` foreign key
- `is_spy`
- primary key `(round_id, player_id)`

The location and assignment rows are never included in a general game snapshot while the round is active. The card endpoint returns only the current handoff card. Completed round history may reveal the location and spy names because the game has ended.

### `command_receipts`

- `game_id` foreign key
- `session_id` foreign key
- `idempotency_key`
- `request_hash`
- `response_json`
- `created_at`
- unique `(game_id, idempotency_key)`

Reusing an idempotency key with the same request returns the stored acknowledgement. Reusing it with a different request returns a validation error. A stale `expectedRevision` returns `409 Conflict` and a fresh snapshot request is required.

### `creation_receipts` and `game_tombstones`

Creation has no game ID or expected revision, so it uses a separate session-scoped receipt table:

- `creation_receipts`: `session_id`, `idempotency_key`, `request_hash`, `game_id`, `response_json`, `created_at`
- unique `(session_id, idempotency_key)`

`GET /api/games` is the browser session bootstrap and establishes the anonymous cookie before the first create request. `POST /api/games` accepts a required `Idempotency-Key`; the same session, key, and canonical request hash replay the original creation acknowledgement, while a different request body returns a validation error. Create is the only mutation exempt from `expectedRevision`.

Deletion keeps a minimal `game_tombstones` row containing `game_id`, `session_id`, and `deleted_at` after all game data is removed. `DELETE` is intentionally exempt from `expectedRevision` and command receipts: it locks and authorizes the live row, deletes dependent data, and inserts the tombstone in one transaction. A repeat delete by the owning session returns `204`; an unknown or foreign game always returns `404`, without disclosing whether a tombstone exists. Tombstones are not listed and contain no player names or secrets.

### Transaction and concurrency contract

The Postgres adapter must use a checked-out client with explicit `BEGIN`, `COMMIT`, and `ROLLBACK`; a query-builder helper that issues independent statements is not sufficient. Each mutation transaction locks the owned game row with `SELECT ... FOR UPDATE`, checks a matching receipt before checking the expected revision, applies the transition, increments the revision, and inserts the receipt before commit. Request hashes are canonical JSON hashes with stable object-key ordering and normalized action fields.

For an expired round, reconciliation runs while holding that same row lock. It commits the `round → accuse` transition and its revision increment before a command with an obsolete `expectedRevision` returns `409 REVISION_CONFLICT`. A rollback removes both the transition and its receipt. The memory store implements the same ordering and is only a deterministic unit-test double; disposable-Postgres integration tests cover the actual locks and unique constraints.

## API contract

Every error uses:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Player names must be unique.",
    "details": {}
  }
}
```

Every successful JSON response uses a top-level `data` property. Snapshot responses include `meta.serverNow` and `meta.revision`. All session-specific JSON responses use `Cache-Control: no-store`; card responses additionally never cache in the browser or an intermediary.

### `POST /api/games`

Creates an owned game and its first round.

Request:

```json
{
  "players": ["Ana", "Bea", "Cy", "Dee"],
  "timerSeconds": 300
}
```

Response: `201` with `{ data: GameSnapshot, meta: { serverNow, revision } }`, plus a session cookie only if the browser did not complete the bootstrap request. The snapshot begins in `reveal` with the first player named but no card content. The request must include `Idempotency-Key`; creation has no `expectedRevision`.

### `GET /api/games`

Lists games owned by the current session. Supports bounded `limit` and opaque `cursor` query parameters. It returns metadata only, never active locations or assignments, and bootstraps the anonymous session cookie when absent.

### `GET /api/games/:gameId`

Returns the sanitized current snapshot. If an active deadline has passed, the server reconciles the round to `accuse` before returning. It never returns assignments or the active location. A refresh during setup is a client-only empty form; setup drafts are not persisted.

### `POST /api/games/:gameId/card`

Accepts `{ "action": "reveal" | "hide", "expectedRevision": 3, "idempotencyKey": "..." }` with a canonical request hash.

- `reveal` returns `{ data: { card }, meta: { revision, serverNow } }` for exactly one current handoff and does not increment `revision`.
- `hide` clears the visible handoff and advances the reveal index. Hiding the final card starts the round and sets an absolute deadline.
- A refresh in `reveal` returns the same player with the card hidden until a new explicit reveal request.

### `POST /api/games/:gameId/actions`

Accepts one action with `expectedRevision` and `idempotencyKey`:

```json
{ "type": "end-round", "expectedRevision": 8, "idempotencyKey": "..." }
{ "type": "accuse", "playerId": "...", "expectedRevision": 9, "idempotencyKey": "..." }
{ "type": "guess", "location": "Airport", "expectedRevision": 10, "idempotencyKey": "..." }
{ "type": "replay", "expectedRevision": 11, "idempotencyKey": "..." }
```

The server validates phase, ownership, player ID, location membership, revision, and action shape before committing a transition. `accuse` follows the Phase 1 rule: a wrong accusation immediately gives the spies the win; a correct accusation opens one spy-guess phase. `replay` preserves the roster and selects a location different from the immediately previous round when the deck permits it. Each action returns `{ data: GameSnapshot, meta: { revision, serverNow } }` and repeated requests with the same key replay the stored acknowledgement before any revision comparison.

### `GET /api/games/:gameId/rounds`

Returns completed round results for the owned game, with bounded pagination. Active round secrets are omitted.

### `DELETE /api/games/:gameId`

Deletes the owned game and dependent players, rounds, assignments, and command receipts in one transaction. Repeating deletion for a missing owned game is idempotent; another session receives `404`.

## Security and privacy

- Generate session tokens with cryptographically secure randomness. Store only a hash in Postgres.
- Use `HttpOnly`, `SameSite=Lax`, `Path=/`, `Max-Age=2592000`, and an aligned `Expires` value on the session cookie; add `Secure` in production and allow insecure cookies only in explicit local development.
- Authorize every read and mutation against the session owner.
- For mutations, require an `Origin` header equal to `APP_ORIGIN` when the header is present and reject a present non-matching origin. Validate `Content-Type: application/json`, reject unknown action types, reject bodies over 64 KiB, and reject unsupported timer values.
- Use `Cache-Control: no-store` on every session-specific response and any response containing secrets.
- Never put locations, assignments, or raw session tokens in URLs, logs, browser storage, or accessibility announcements.
- Clear secret text in the browser before advancing a handoff; the secret container is not an `aria-live` region. Announce only neutral state changes such as "Card hidden".
- Serialize browser mutations per game, reuse the same idempotency key for a retry of one intent, and discard responses belonging to an older UI generation. When a focused tab's timer reaches zero, it must fetch authoritative state; the display interval never decides the outcome locally.
- Do not claim that shared-device play provides per-player secrecy against someone inspecting the browser or server. Stronger secrecy requires separate device capabilities and is deferred.
- Keep database credentials only in Vercel environment variables. Never commit `.env` files or connection strings.

## Deployment

The app is deployed as its own Vercel project. The project’s production URL is the link Mission Control should expose. Vercel serves the static frontend and invokes the API functions; Postgres is an external managed resource.

Required environment variables:

- `DATABASE_URL`
- `SESSION_SECRET`
- `APP_ORIGIN` for local/production origin checks

Deployment documentation must cover creating the Postgres database, applying migrations, setting Preview and Production environment variables separately, checking the health endpoint, and linking the production URL from Mission Control. Database backups and provider retention are operational concerns and must not rely on Vercel deployment history.

The project pins Node 20 and an exact `@neondatabase/serverless` version in `package.json` and commits its lockfile. Vercel packaging must keep API functions and their server dependencies while excluding tests, fixtures, docs, migrations, scripts, `.env` files, and other non-runtime files from the published static asset set. A preview packaging smoke check must exercise the nested `/api/games/:gameId/card`, `/actions`, and `/rounds` paths; it must not rewrite `/api/**` to `index.html`.

## Acceptance criteria

- A user can create a valid 4 to 12 player game through the deployed app.
- Refreshing during setup, reveal, round, accuse, spy-guess, or result restores the correct server snapshot.
- The active secret card is never present in a general snapshot or cached response.
- The deadline continues to elapse across refreshes and serverless cold starts.
- Duplicate mutations with the same idempotency key do not create duplicate rounds or outcomes.
- Stale revisions receive a structured `409` response and the UI can recover by reloading the snapshot.
- Wrong accusation, correct spy guess, incorrect spy guess, replay, history, and deletion match the Phase 1 rules.
- An unrelated session cannot read, mutate, or delete another session’s game.
- Existing Phase 1 rule tests continue to pass. New service/API tests cover validation, persistence boundaries, authorization, conflicts, privacy, and all outcome paths. Disposable-Postgres integration tests cover concurrent same-key requests, receipt uniqueness and request-hash mismatch, rollback, expiry reconciliation, cross-session denial, replay/history/delete, and fresh-process resume; fixtures live under `test/fixtures`.
- The app runs locally with a documented Postgres connection and deploys through Vercel without requiring a long-lived server process.
- Mission Control can link to the standalone production URL without importing Spy internals.
