# Custom secret and handoff visuals Implementation Plan

> **Status:** Implemented and production-verified (2026-09-15). The live custom-secret flow confirms that migration `004_custom_secret_mode.sql` is active on the production database.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a group choose a private text secret for each round while making role handoffs, guessing, saved-game cleanup, and the supporting visuals easier to understand.

**Architecture:** Keep the server authoritative and store the secret only in the existing round record, adding an explicit `secret_mode` marker so custom guesses can be compared without exposing the secret in active snapshots. The game remembers the selected mode; a custom-mode replay requires a new secret for that next round. The browser renders mode-aware setup, guessing, and replay prompts, plus local generated artwork that never contains game data.

**Tech Stack:** Node 24 serverless functions, CommonJS game service, Postgres and in-memory stores, vanilla browser JavaScript, HTML/CSS, local raster assets, Node built-in test runner.

**Spec:** Approved design in the conversation; existing rules contract at `docs/superpowers/specs/2026-09-08-spyfall-refinements.md`.

## Global Constraints

- A custom secret is entered again for every round in a five-round session.
- Active snapshots, URLs, browser storage, service-worker caches, and performance marks must not contain the custom secret.
- Standard deck rounds keep the existing 65 validated public locations and location-list guessing flow.
- Custom rounds use a free-text spy guess; trimming, whitespace folding, and case-insensitive comparison happen on the server.
- Existing saved games remain resumable and deletable; unrelated vault changes must be preserved.
- All behavioral changes require a focused failing test before implementation and a full `npm test` run before release.

---

### Task 1: Extend the server secret contract

**Files:**
- Modify: `server/validation.js`
- Modify: `server/game-service.js`
- Modify: `server/postgres-store.js`
- Modify: `server/memory-store.js`
- Create: `database/migrations/004_custom_secret_mode.sql`
- Modify: `api/games/[gameId]/actions.js`
- Test: `test/phase2.test.js`, `test/refinements.test.js`

**Interfaces:**
- Create requests accept `secretMode: "deck" | "custom"` and, for custom mode, `customSecret`.
- Replay actions accept `customSecret` only when the game is in custom mode.
- Public snapshots expose `secretMode` but never expose `customSecret` before the result phase.
- A round record carries `secretMode`, `locationName`, and `locationCategory`; custom rounds use category `Custom`.

- [x] **Step 1: Write failing contract tests** for custom create validation, custom replay requirements, server-side normalized guesses, mode-only active snapshots, and result-only secret exposure.
- [x] **Step 2: Run focused tests** with `node --test test/phase2.test.js test/refinements.test.js`; verify the new assertions fail against the deck-only implementation.
- [x] **Step 3: Implement normalized custom-secret validation and the `secretMode` fields** in both stores and the Postgres migration, preserving deck defaults for old records.
- [x] **Step 4: Implement custom round creation and replay** without returning the secret in active snapshots; make `guess` accept arbitrary custom text but keep deck guesses restricted to `LOCATION_DECK`.
- [x] **Step 5: Include `customSecret` in action request hashes** so idempotency cannot replay a different guess or next-round secret.
- [x] **Step 6: Re-run the focused tests and then `node --check` on all changed JavaScript files.

### Task 2: Add mode-aware browser interaction

**Files:**
- Modify: `index.html`
- Modify: `game.js`
- Modify: `api-client.js`
- Modify: `styles.css`
- Test: `test/a-plus-static.test.js`, `test/phase2-static.test.js`

**Interfaces:**
- Setup submits `{ players, timerSeconds, secretMode, customSecret }`.
- `state.snapshot.secretMode` controls whether the guess view renders a location list or a text input.
- Before a custom-mode replay, a compact next-round secret form collects `customSecret`; deck mode replays immediately.
- Resume cards expose a per-game delete control and keep Resume as the primary action.

- [x] **Step 1: Add failing static assertions** for the custom-secret controls, mode-aware guessing input, replay prompt, delete control, and local visual asset references.
- [x] **Step 2: Run the focused static test and confirm it fails before markup and behavior are added.
- [x] **Step 3: Add accessible setup and replay controls** with explicit labels, validation messages, and no secret-bearing text in document metadata.
- [x] **Step 4: Add mode-aware guessing** with a text input for custom rounds, confirmation copy that uses the submitted text, and no custom secret rendered into the spy-facing DOM.
- [x] **Step 5: Add saved-game deletion from the resume list** using the existing DELETE route and the same mutation/error safeguards as active-game deletion.
- [x] **Step 6: Run static tests and inspect the 320px layout contract.

### Task 3: Create and integrate local game artwork

**Files:**
- Create: `assets/role-spy.png`
- Create: `assets/role-agent.png`
- Create: `assets/pass-phone.png`
- Modify: `index.html`
- Modify: `styles.css`
- Test: `test/a-plus-static.test.js`

- [x] **Step 1: Generate the three non-personal, abstract illustrations** with transparent backgrounds and a consistent dark/amber/teal visual system.
- [x] **Step 2: Inspect the generated files** for usable dimensions, transparency, and absence of text that could conflict with localization or privacy copy.
- [x] **Step 3: Add the artwork as decorative, accessible supporting visuals** beside the role, handoff, and guess explanations; keep critical instructions in text.
- [x] **Step 4: Run the static test and render each active phase at narrow and desktop widths.

### Task 4: Verify, document, and release

**Files:**
- Modify: `README.md`
- Modify: `docs/deployment.md`
- Modify: `docs/superpowers/plans/2026-09-08-a-plus-game-improvement-plan.md`

- [x] **Step 1: Run `npm test` and all JavaScript syntax checks.
- [x] **Step 2: Run scoped `git diff --check -- '1 Projects/Spy game'` and inspect the diff for privacy regressions.
- [x] **Step 3: Use the browser-testing workflow to exercise the credential-free custom four-player flow, custom next-round re-entry, and secret clearing; production deck/resume/delete flows remain separately verified.
- [x] **Step 4: Apply migration 004 to the explicitly authorized target, deploy the verified project to the production alias, and repeat the critical custom browser smoke tests against production.** Production `/api/ready` and `/api/health` returned `200`; the live browser smoke test created a custom game, completed all private handoffs, exercised end-round cancel/confirm, final vote, result, and deletion, and reported zero console errors or warnings. Temporary test games were deleted after verification.
- [x] **Step 5: Record only observed evidence and remaining empirical accessibility/pilot gates in the release documentation.

## Self-review

- Custom mode is covered by validation, storage, action hashing, replay, guess comparison, and result sanitization.
- Deck mode remains the default for old games and existing clients.
- The secret is never placed in active snapshots, browser storage, visual asset content, or performance marks.
- UI additions retain keyboard focus, text alternatives, reduced-motion behavior, and the 320px no-horizontal-overflow contract.
- The plan does not claim physical-device accessibility or pilot outcomes that have not been observed.
