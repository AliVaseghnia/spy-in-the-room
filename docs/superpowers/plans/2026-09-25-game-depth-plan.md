# Game depth ("10x") Implementation Plan

> **Status:** Proposed 2026-09-25. Phase A approved for implementation once Ali signs off on the open decisions below.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Read `2026-09-25-luna-handoff.md` first.

**Goal:** Make each round of Spy in the Room *play* better, not just look better: give the spy real agency, give everyone else a character, cut handoff friction, and make the accusation a dramatic group moment.

**Why:** A playtest on 2026-09-25 (6 players, live site) found the engineering solid but the game asymmetric in the wrong direction:

| Finding | Effect at the table |
|---|---|
| The spy never sees the possible locations until the final guess, then picks from all 65 | A caught spy has ~1/65 odds; the "last shot" has no tension and the spy has nothing to reason about during the round |
| Non-spies get only "Location: X" | Nothing to role-play; questions go stale after a lap |
| Handoff costs 3 taps per player (reveal → hide → pass) | 18 taps before a 6-player round starts, ×5 rounds |
| "Reveal again" stays available after the card is hidden, including on the final "Cards are hidden" screen | Whoever holds the phone next (or anyone, once it's on the table) can re-open the previous player's card and read the location |
| Accusation is one consensus tap | No individual stakes, no split-vote drama, no data for end-of-game awards |

**Architecture:** Unchanged. Server-authoritative Vercel Functions over Postgres (and the in-memory store for dev/tests); vanilla ES5 browser scripts; no build step. New game state lives in the stores and is exposed only through `sanitizeGameSnapshot` / `cardForCurrentPlayer` in `server/game-service.js`.

**Tech stack:** Node 24 CommonJS, Neon Postgres + `server/memory-store.js`, vanilla JS/HTML/CSS, `node --test`.

**Rules contract:** `docs/superpowers/specs/2026-09-08-spyfall-refinements.md`. Every rule change below must update that spec in the same task.

## Global constraints

- **Privacy invariant (non-negotiable):** before the `result` phase, no general snapshot, summary, URL, browser storage, cache, or log contains the true location, a spy flag, or any role. Roles and locations travel only in the per-player card response. The location *board* (a list of candidates) is public by design and must not reveal which entry is true: sort it alphabetically, never in deal order.
- Custom-secret rounds keep today's behaviour (free-text guess, no board, no roles).
- Existing saved games (no board, no roles) must still resume, play, and score; treat missing fields as "legacy" and fall back to the full deck.
- Browser code stays ES5-compatible plain scripts; no framework, no bundler.
- TDD: a focused failing test before each behaviour change; full `npm test` green at every commit.
- Migrations are additive (`ADD COLUMN IF NOT EXISTS`, new tables). Next migration number is `006`.
- Nothing is deployed to production and no migration is run against Neon without Ali's explicit go-ahead.

## Decisions for Ali (block the tasks named)

| # | Decision | Recommendation | Blocks |
|---|---|---|---|
| D1 | Board scope: one board per **game** or per **round** | Per game, 24 locations. Players learn the list across rounds, which is what makes the spy better over time. 5 rounds never exhausts 24. | A2 |
| D2 | Remove "Reveal again" after a card is hidden | Yes. Keep a re-read only while the card is still face-up. A player who forgot can ask the table to restart the handoff (existing flow) | A1 |
| D3 | Role tone and who writes them | Luna drafts all 65 × 7 roles in one reviewable file; Ali edits before merge | A3 |
| D4 | Secret ballot default | Off by default for 4–5 players, on for 6+ (toggle in setup) | B1 |
| D5 | Ballot tie rule | One re-vote among the tied suspects; still tied → spies win (the room failed to agree) | B1 |

---

## Phase A — the core loop (implement now)

### Task A0: Land the in-flight handoff redesign

The working tree carries an uncommitted rewrite of the reveal flow (explicit reveal/hide steps replacing hold-to-peek) across `game.js`, `game-view.js`, `index.html`, `styles.css`, `service-worker.js`, `README.md`, and three test files. All 124 tests pass on it.

- [ ] Review the diff with Ali; commit it as its own commit ("Replace hold-to-peek with explicit reveal and hide") before any Phase A work, so later tasks diff cleanly.

### Task A1: Two-tap handoff and close the re-reveal leak

**Files:** `game.js`, `game-view.js`, `index.html`, `styles.css`; tests in `test/game-feel.test.js` (or a new `test/handoff.test.js`).

Target flow per player: **"I'm Farzaneh — reveal"** → card face-up with **"Hide & pass to Asal"** → the next player's reveal screen. The last player's button reads **"Hide & start the round"** (or "Hide — everyone ready?" followed by the existing start confirmation).

- [ ] Failing test: after a card is hidden, no control can re-reveal that player's card (covers the mid-handoff screen and the final "Cards are hidden" screen).
- [ ] Failing test: hiding advances straight to the next player's reveal screen (one action, not two).
- [ ] Implement: merge the hide and pass steps; remove `reveal-again` once hidden (per D2); keep the step indicator honest (2 steps).
- [ ] Keep the server contract as is if possible. The `card` endpoint already separates reveal and hide. If advancing needs a new combined action, add it server-side with a revision check rather than firing two client calls.
- [ ] Update copy in `README.md` ("Pass, reveal, hide") and the in-app Rules sheet.

### Task A2: Public location board (per D1)

**Files:** `game-logic.js` (board selection helper), `server/game-service.js` (`buildGameRecord`, `chooseLocation`, `buildRoundRecord`, `sanitizeGameSnapshot`, guess validation near the `input.type === 'guess'` branch), `server/postgres-store.js`, `server/memory-store.js`, `database/migrations/006_location_board.sql`, `game-view.js` (`renderRound`, `renderGuess`), `index.html`, `styles.css`, `service-worker.js` (bump cache version); tests in `test/game-logic.test.js`, `test/refinements.test.js`, `test/phase2.test.js`.

Schema: `games.board_locations text[] NULL` (null = legacy game → full deck).

- [ ] Failing logic test: `pickBoard(deck, size, random)` returns `size` unique deck names, sorted alphabetically, deterministic for a seeded `random`.
- [ ] Failing service test: a new deck-mode game stores a 24-name board; every round's location is drawn from that board without repeats; custom-mode games store no board.
- [ ] Failing privacy test: the board appears in snapshots for `round`, `accuse`, `spy-guess`, and `result` phases, and its order is independent of the true location (e.g. across many seeded games the true location's index is not constant; simplest check: board equals its own sorted copy).
- [ ] Failing guess test: a guess outside the board is rejected with 400; legacy games (null board) still accept any deck location.
- [ ] Migration `006_location_board.sql`, store read/write for both stores.
- [ ] Round view: a collapsible "Possible locations" grid (read-only, category-grouped or alphabetical, ≥44px tap targets not needed since it's not interactive). **No cross-off state:** the phone sits on the table in view of everyone, so any spy marking would be public.
- [ ] Guess view: show only the board's 24 locations; keep search.
- [ ] Spy card copy: "You're the spy. The location is on the board — listen and narrow it down."
- [ ] Update the rules spec and README feature table.

### Task A3: Location roles (per D3)

**Files:** `game-logic.js` (`LOCATION_DECK` entries gain `roles`, `dealRound` assigns them), `server/game-service.js` (`buildRoundRecord`, `cardForCurrentPlayer`, result outcome), both stores, `database/migrations/007_assignment_roles.sql`, `game-view.js` (reveal card, result), tests in `test/content-contract.test.js`, `test/game-logic.test.js`, `test/refinements.test.js`.

Schema: `assignments.role text NULL` (null for spies, custom rounds, and legacy rounds).

- [ ] Failing content test: every deck location has ≥7 unique roles, each 2–32 characters, none containing the location name (case-insensitive).
- [ ] Failing logic test: `dealRound` gives every non-spy a role, no repeats until the location's roles are exhausted, spies get none.
- [ ] Failing privacy test: roles never appear in a general snapshot before `result`; the card response for a non-spy includes `role`; the spy's card does not.
- [ ] Draft the roles in `game-logic.js` in one commit titled "Draft location roles for review" so Ali can review the content alone (D3). Tone: playful, specific, family-friendly ("Campground: the one who forgot the tent poles").
- [ ] Card: "Campground — you're the park ranger." Result screen lists each player's role next to their avatar.
- [ ] Update rules spec, README, and the Rules sheet ("Answer in character if you like; don't say your role outright").

**Phase A exit criteria:** full suite green; a scripted local playthrough (`npm run dev`, 6 players, one round to result) shows the 2-tap handoff, the board during the round, a role on every non-spy card, board-only guessing; advisor review passed; Ali approves deploy.

---

## Phase B — the group moment (after Phase A ships)

### Task B1: Secret ballot (per D4, D5)

New optional setting. After "End round & vote", the phone passes around: each player taps a suspect privately (cannot vote for self), then hands it on. Server stores votes (`votes` table: round_id, voter_id, suspect_id, ballot_number), tallies, and reveals them one at a time in a dramatic flip. Plurality becomes the accused and continues into the existing spy-guess flow. Ties follow D5. Consensus mode stays as the default for small groups.

### Task B2: Question tracker (client-only)

A small "Asking now: Ali → tap who they asked" strip on the round screen. Round-scoped browser state only (not persisted, not sent to the server); shows who hasn't been asked yet. Purely an aid, so it's optional and dismissable.

### Task B3: Scoring and end-of-session awards

With ballots: +1 to each player who voted for a spy; a spy who calls for the guess mid-round and gets it right scores 4. Update the rules spec. After round 5, show 2–3 awards computed from server data only (votes, guesses, points): "Best bluffer" (spy who drew the fewest votes), "Sharp eye" (most votes on actual spies), "Most suspicious innocent". Include them in the share card.

---

## Phase C — bigger bets (not in the Luna handoff; scope separately)

- **Persian localization + Persian location pack** (family game nights). Requires a string table extraction pass first.
- **Theme packs** (Family, Travel, Office, Holiday) selectable in setup; the board draws from the chosen pack.
- **Multi-device rooms** (room code, each player on their own phone). The server-authoritative design makes this feasible, but it's a new product surface: realtime transport, per-player sessions, reconnects.
