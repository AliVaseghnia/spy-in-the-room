<div align="center">

<img src="favicon.svg" width="64" height="64" alt="Spy in the Room">

# Spy in the Room

**One phone. One secret. One player who has no idea where they are.**

A pass-the-phone social deduction party game for **4–12 players**. Everyone
gets the same location card — except the spies, who have to bluff their way
through the questions without ever learning where they are.

[**Play it live**](https://spyintheroom.vercel.app) · [How to play](#how-to-play) · [Run it locally](#local-development) · [Architecture](#architecture)

</div>

<p align="center">
  <img src="docs/screenshots/setup-mobile.png" width="240" alt="Add players and pick a round length">
  <img src="docs/screenshots/reveal-agent-mobile.png" width="240" alt="Hold to reveal your card">
  <img src="docs/screenshots/round-mobile.png" width="240" alt="Question round with a live timer">
</p>
<p align="center">
  <img src="docs/screenshots/accuse-mobile.png" width="240" alt="Accuse a suspect">
  <img src="docs/screenshots/result-mobile.png" width="240" alt="Round result and scoreboard">
  <img src="docs/screenshots/round-desktop.png" width="240" alt="Desktop round view">
</p>

## Why it exists

Most pass-the-phone deductions are a timer and a text prompt. This one is
built to feel like a game you reach for again:

- **Hold to reveal.** Press and hold to read your card. Let go and it hides
  instantly — no "someone left the screen open" incidents, and it feels like
  checking a classified dossier.
- **Question deck.** A tap deals a location-agnostic question ("What is the
  loudest thing here?"). The spy can use it too; nobody stalls out.
- **Chaos mode.** An optional public twist each round — *answers must be
  exactly three words*, *nobody may use the word "the"*.
- **A round that looks alive.** A draining timer ring, spy count, urgency
  colour, and haptic/audio ticks at one minute and ten seconds.
- **Players are tokens.** Everyone gets a stable avatar and colour that
  follows them through the handoff, the vote, and the scoreboard.
- **A result worth watching.** A stamp hits, the location and spies are
  revealed, points animate onto a leaderboard, and the whole result can be
  shared to the group chat.
- **It remembers your table.** Names, cue preferences, and chaos mode are
  stored on the device. Nothing about the game itself ever is.

## How to play

1. **Add the room (4–12).** Pick a 3, 5, or 8 minute round. Use a built-in
   location or bring your own secret.
2. **Hold, read, pass.** Each player holds the card button to peek at their
   role, then passes the phone on. 9–12 players get **two spies** who know
   each other.
3. **Ask, bluff, vote.** Ask one question at a time without revealing the
   location. When the clock stops, the room names one suspect.
4. **Last shot.** If the room accuses a spy, the spy gets one guess at the
   secret. Name it and the spies steal the round; miss and the room wins.
5. **Five rounds.** Points land on a running leaderboard — spies score 3 for
   a correct guess and 2 otherwise, the room scores 2.

## Features

| | |
|---|---|
| Players | 4–12, one phone, no accounts |
| Rounds | 3 / 5 / 8 minute timers, five-round sessions |
| Spies | 1 spy (4–8), 2 partnered spies (9–12) |
| Secrets | 65 built-in locations across 8 categories, or a custom secret |
| Feel | Hold-to-reveal cards, flip animation, timer ring, twists, avatars, audio + haptics |
| Platform | Installable PWA shell, offline reconnect fallback, mobile-first responsive layout |
| Accessibility | Full keyboard flow, live-region announcements, focus management, `prefers-reduced-motion` support |
| Privacy | Server-authoritative roles; general API responses never contain the location, spy flags, or card contents |

## Architecture

The browser is plain ES5-compatible JavaScript — no build step, no framework,
no bundler. The server is Vercel Node.js Functions over an external Postgres
database. Secrets are dealt and held server-side; the client only ever
receives the card for the player currently holding the phone.

```mermaid
flowchart LR
  B["Browser · vanilla JS + PWA"] -->|"same-origin /api"| F["Vercel Functions"]
  F --> S["Game service · transitions, scoring, revisions"]
  S --> P[("Neon Postgres · games, rounds, assignments")]
  B -.->|"cache: public shell only"| SW["Service worker"]
```

**Browser modules** (loaded in order, all plain script tags):

| File | Responsibility |
|---|---|
| `game-logic.js` | Pure rules: deck, deals, scoring, avatars, questions, twists |
| `prefs.js` | The only browser-storage surface (names + cue flags, allow-listed) |
| `api-client.js` | Fetch wrapper: credentials, no-store, idempotency keys, errors |
| `game-view.js` | DOM rendering for every phase |
| `game.js` | State machine, mutations, timer, privacy locks, cues |
| `service-worker.js` | Versioned static shell cache and offline reconnect page |

**API surface:**

| Route | Purpose |
|---|---|
| `GET /api/health`, `GET /api/ready` | Deployment health and readiness |
| `GET /api/games` | Bootstrap the anonymous session and list saved games |
| `POST /api/games` | Create a game (idempotency-key protected) |
| `GET /api/games/:id` | Sanitized snapshot for the owning session |
| `POST /api/games/:id/card` | Reveal or hide the **current player's** card |
| `POST /api/games/:id/actions` | End round, accuse, call for a guess, record guesses, replay |
| `GET /api/games/:id/rounds` | Completed round history |
| `DELETE /api/games/:id` | Delete an owned game |

Every mutation carries an idempotency key and an expected revision, so
double-taps, retries, and two tabs cannot corrupt a game. Sessions are
anonymous, HttpOnly, and `SameSite=Lax`; mutations require an exact
`APP_ORIGIN` match.

## Local development

Requires **Node 24.x**.

### Option A — zero setup (in-memory)

```bash
npm install
npm run dev
# → http://localhost:3000
```

This runs the real API route handlers against an in-memory store. Games reset
when the process exits. It refuses to start in production.

### Option B — full stack (Postgres)

Use a disposable Postgres database; never point local testing at production.

```bash
npm install

export DATABASE_URL='postgres://user:password@host/database'
export SESSION_SECRET="$(openssl rand -base64 32)"
export APP_ORIGIN='http://localhost:3000'

node scripts/migrate.js
npx vercel dev
```

`.env.example` documents the four variables. The complete runbook, including
Preview/Production database separation and migration order, is in
[`docs/deployment.md`](docs/deployment.md).

## Tests

```bash
npm test
```

The suite is 118 tests across pure rule contracts, static browser/CSP/PWA
contracts, and full API flows against the deterministic memory store. It runs
without a database, network, or browser. GitHub Actions runs it on every push
and pull request.

Syntax checks used in CI:

```bash
node --check game-logic.js && node --check prefs.js && node --check api-client.js \
  && node --check game-view.js && node --check game.js && node --check service-worker.js
```

## Deployment

Deployed as its own Vercel project with an external Postgres database (Neon in
production). Set `DATABASE_URL`, `SESSION_SECRET`, `APP_ORIGIN`, and
`CRON_SECRET` per environment, apply migrations before routing traffic, and
let the daily cron call `/api/maintenance/cleanup`. Full instructions:
[`docs/deployment.md`](docs/deployment.md).

## Security & privacy notes

- Secret assignments, the location, and the spy flags live only in the server
  store. Snapshots are sanitized per session and card responses are
  `Cache-Control: no-store`.
- The service worker caches only public shell assets. `/api/**` is never
  cached.
- `prefs.js` is the only code that touches browser storage, and it persists
  only an allow-listed shape: player names, sound/haptics flags, chaos mode.
  It never stores cards, snapshots, secrets, game ids, or history.
- No third-party scripts, fonts, or analytics beyond Vercel's page-view
  counter; the CSP is `'self'`-only.

Spy in the Room is an independent game. Spyfall is a trademark of its
respective owner; this project is not affiliated with it.

## License

[MIT](LICENSE) © 2026 Ali Vaseghnia
