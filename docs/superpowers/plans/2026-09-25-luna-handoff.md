# Handoff to Luna: Spy in the Room, Phase A

**From:** Claude (advisor), on behalf of Ali · **Date:** 2026-09-25
**Repo:** `~/Developer/spy-in-the-room` · GitHub `AliVaseghnia/spy-in-the-room` · live at https://spyintheroom.vercel.app
**Plan:** [`2026-09-25-game-depth-plan.md`](2026-09-25-game-depth-plan.md). This is your task list. Read it in full before starting.

## Your job

Implement **Phase A** of the plan: tasks A0 → A1 → A2 → A3, in that order. Phase B and C are out of scope. Mention anything you notice there, but don't build it.

You are the implementer. I'm the advisor: I wrote the plan from a live playtest and a code read, and I review your work at the checkpoints below. Ali owns the product decisions and anything that touches production.

## What you're walking into

- **Stack:** vanilla ES5 browser scripts (`game-logic.js`, `game.js`, `game-view.js`, `api-client.js`, `prefs.js`), no build step. Vercel Node 24 Functions in `api/`, with the domain logic in `server/game-service.js`. Two interchangeable stores: `server/postgres-store.js` (Neon) and `server/memory-store.js` (dev and tests). Migrations are in `database/migrations/`; the next number is `006`.
- **Run it:** `npm test` (124 tests, ~0.2s, all green as of 2026-09-25). `npm run dev` starts a zero-setup in-memory server.
- **Rules contract:** `docs/superpowers/specs/2026-09-08-spyfall-refinements.md`. Update it whenever you change a rule.
- **Uncommitted work exists.** The working tree has an in-progress reveal-flow rewrite across 10 files. That is Task A0: get Ali's OK and commit it as-is *before* touching anything else. Don't mix it into your commits.
- **Previous plans** in this folder show the house style: TDD per task, a privacy test for every new field, and the README and rules spec updated in the same task.

## Hard rules

1. **Privacy invariant.** Before the `result` phase, no general snapshot or summary may contain the true location, spy flags, or roles. They travel only in the per-player card response (`cardForCurrentPlayer`). The new board is public, but it must be sorted alphabetically so its order reveals nothing. Every task that adds a field adds a privacy test.
2. **Failing test first** for each behaviour change. Full `npm test` green at every commit.
3. **Legacy games keep working.** A game with a null board or null roles falls back to today's behaviour.
4. **Branch `feat/game-depth-phase-a`.** One commit per plan checkbox group. No pushes to `main`, no `vercel --prod`, and no migrations against Neon without Ali's explicit yes.
5. **Match the code around you.** ES5 in the browser, CommonJS on the server, the same naming and comment density. No new dependencies.
6. **Open decisions D1–D5** are listed in the plan. My recommendations are there, but Ali decides. If Ali hasn't answered by the time a task needs one, stop that task and ask. Don't guess.

## Checkpoints: contact the advisor

Message me at each of these points. Before each checkpoint, send a short status: what's done, the test count, and any deviation from the plan.

| When | What to send | What I'll check |
|---|---|---|
| **C0: after reading the plan** | Your questions and anything in the plan you think is wrong | Misreadings before any code exists |
| **C1: before A2's migration** | The `006` SQL and the store read/write diff | Additive and legacy-safe, and matches the memory store |
| **C2: after A2** | Diff summary plus the privacy tests | Board leaks, guess validation, legacy fallback |
| **C3: roles draft committed** | Commit hash of "Draft location roles for review" | Tone, quality, no location names inside roles. Ali edits after me |
| **C4: Phase A done** | Branch name, final test count, and a local playthrough note (6 players, one round through to the result) | Final review before Ali decides on deploy |

**How to reach me:** if you're a Claude Code session on Ali's Mac, `SendMessage` to the session named **"Spy in game project"**. Otherwise, post your checkpoint message to Ali and they'll relay it. If I'm not reachable within a reasonable time, keep going on the independent parts and log the question in your status.

Push back on the plan when the code tells you something the plan didn't know. That's the point of C0. Say so with evidence rather than silently deviating.

## Known facts you can rely on (verified 2026-09-25)

- The re-reveal leak is real. `revealCardAgain` (`game.js` ~L1505) re-opens the current player's card while the UI says to pass the phone. `game-view.js` ~L126 also shows it on the final "Cards are hidden" screen. Task A1 closes it.
- Guess validation lives in `server/game-service.js` in the `input.type === 'guess'` branch (~L996). It currently accepts any `LOCATION_DECK` name.
- `chooseLocation` / `buildRoundRecord` / `buildGameRecord` (~L495–620) are where the board and roles get dealt.
- `cardForCurrentPlayer` (~L294) is the only place a role should be added to a response before the result.

## Definition of done (Phase A)

- [ ] A0 committed separately with Ali's OK
- [ ] A1–A3 checkboxes done, with the rules spec and README updated
- [ ] `npm test` green, with new tests for every behaviour and privacy rule above
- [ ] Local playthrough confirms: 2-tap handoff, no re-reveal after hiding, the board visible during the round, a role on every non-spy card, and guessing limited to the board
- [ ] Advisor sign-off at C4
- [ ] Ali has approved (or declined) the migration and deploy. You don't deploy on your own.
