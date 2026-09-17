# Spy in the Room: A+ improvement plan

> **Status:** Implemented and deployed (initial release 2026-09-08; verified maintenance release 2026-09-15)
> **Date:** 2026-09-08
> **Scope:** Product, rules, mobile UX, accessibility, content, reliability, and launch quality
> **Implementation status:** The technical product, rules, privacy, UX, content, feedback, PWA, resilience, and automated/browser verification work described here is implemented in the current release. Real-device accessibility runs, field p75 INP measurement, and the group pilot remain evidence gates for a later measured release decision.

## Implementation and release evidence

The current release ships the core A+ plan as a standalone, no-account,
same-device game. It includes the focused active-game shell, explicit private
handoffs with secret clearing, modal accusation and guess confirmation, the
two-spy sequence, five-round scoring and replay, a 65-location validated deck,
optional sound/haptics and wake-lock feedback, a static-shell PWA with honest
offline behavior, privacy-safe performance marks, and production browser
coverage for the supported flows.

The remaining items are empirical rather than missing product code: testing on
physical iOS/Android devices with VoiceOver/TalkBack and 200% text, measuring
field p75 INP, and observing the proposed 6–10 group pilot. The release does
not claim those gates have passed; the privacy limitation around screenshots,
shoulder surfing, and compromised devices remains documented in the product
and deployment notes.

## Executive recommendation

Make Spy in the Room an exceptional shared-device party game by making the first
round feel immediate, making every private handoff unambiguous, and making the
social deduction loop resolve cleanly on a small screen. The recommended sequence
is core-first:

1. Freeze and expose the rules contract.
2. Rebuild the active game as a mobile-first, one-action-at-a-time game shell.
3. Treat privacy and handoff transitions as a tested security boundary.
4. Tighten accusation, two-spy guessing, results, and replay pacing.
5. Add a deliberately authored content system and replay depth.
6. Add audiovisual polish, installability, and an honest offline/resume story.
7. Validate on real devices and with real groups before calling the game ready.

The product should remain a standalone, no-account, same-device game for the first
quality release. Online rooms, individual player devices, accounts, matchmaking,
payments, ads, and social analytics are separate products and remain out of scope.

The quality bar is not “more features.” It is that a new group can start quickly,
pass the phone without leaking a secret, understand the current phase without a
moderator, and finish a five-round session with a satisfying reveal and fair score.

## Current baseline and diagnosis

The current implementation already contains valuable foundations:

- The browser supports 4–12 named players, one spy for 4–8 players, two known
  spies for 9–12 players, 3/5/8-minute rounds, a pass-the-phone reveal flow,
  accusation confirmation, ordered spy guesses, five-round scoring, replay, and
  completed-round history.
- Server state is authoritative. Active snapshots omit locations, categories,
  spy flags, assignments, and card content. The private-card route returns one
  card and uses no-store responses.
- Anonymous HttpOnly session ownership, Postgres persistence, absolute deadlines,
  revision checks, idempotency receipts, retry handling, and visibility/focus
  refreshes are already present.
- The existing Node suite and syntax checks pass: 66 tests with no failures at
  the time of this plan.
- The visual system is already coherent: dark surfaces, amber accent, readable
  typography, focus-visible styling, 44px-height controls, a 320px minimum, and
  reduced-motion CSS.

The main gap is product-level focus. The current document structure keeps the
intro, header/status rail, dossier, and footer around active phases, so the game
reads like a responsive webpage rather than a focused pass-the-phone instrument.
The phase containers are semantically labeled but several confirmation surfaces
are inline panels rather than true modal interactions. Safe-area padding,
explicit press states, optional audio/haptics, PWA shell support, and real-browser
coverage are not yet complete. The result is technically careful but still
leaves avoidable social friction at the moments where a group is most likely to
hesitate: first setup, phone handoff, accusation, two-spy guessing, and the
transition back into another round.

The existing rules contract is in
docs/superpowers/specs/2026-09-08-spyfall-refinements.md. It should be treated as
the canonical product contract for this plan: two spies know each other, both
spies get an ordered guess opportunity, a correct guess gives the spies the
round, a round win awards two points, a spy win by correct guess awards three
points to each spy, and a session contains five rounds.

## Definition of A+

### User promise

“Give us one phone and five minutes. Everyone will know what to do, nobody will
accidentally see a secret, and the reveal at the end will make us want another
round.”

### Proposed scorecard

These are internal release hypotheses, not claims about industry benchmarks.
They must be measured in pilot sessions and adjusted only with evidence.

| Dimension | Target or release gate | How to measure |
| --- | --- | --- |
| Time to play | Median setup-to-first-investigation state at or below 60 seconds for a returning group; first-time groups receive a short contextual explanation without a blocking tutorial | Instrument privacy-safe phase timestamps in local test builds and observe pilot groups |
| Handoff clarity | Zero wrong-player reveals in 20 consecutive scripted handoff cycles per supported device; no participant asks what to tap in the intended happy path | Scripted QA plus observation |
| Secret privacy | Zero known leaks in 100 reveal/hide/background/refresh cycles; active snapshots, URLs, browser storage, and service-worker caches contain no secret | Static contract tests, service tests, browser tests, app-switcher checks |
| Flow completion | At least 80% of pilot groups complete five rounds; at least 70% choose another round from the result screen | Pilot funnel and short exit question |
| Interaction response | p75 Interaction to Next Paint at or below 200ms on representative mobile sessions; tap acknowledgement should feel immediate even when the API is slow | Field marks plus throttled browser runs. The 200ms p75 target is the web.dev “good” INP threshold, not a guarantee of game quality. See the [Web Vitals guidance](https://web.dev/articles/vitals). |
| Responsive access | No loss of content or two-direction scrolling at 320 CSS px; text remains usable at 200% zoom; keyboard focus is visible and never trapped | Browser matrix, WCAG checks, keyboard and screen-reader passes |
| Fairness | No rule or content defect that makes one role structurally impossible to play; investigate win-rate and guess-rate skew after pilot play, without silently changing scoring | Round history plus anonymized pilot notes |
| Content freshness | No immediate location repeat while unused content remains; fewer than 10% of observed groups call a location confusing, culturally narrow, or too easy to identify from one clue | Content QA rubric and pilot feedback |

“A+” is achieved only when the release gates pass together. A fast game with
privacy ambiguity is not A+, and a beautiful game with confusing rules is not A+.

## Approaches considered

| Approach | What it would do | Benefit | Cost or risk |
| --- | --- | --- | --- |
| A. Polish-only pass | Keep the current information architecture and add colors, motion, sound, and more copy | Lowest code risk and fastest visible change | Preserves the webpage-like active layout, handoff ambiguity, and weak browser coverage |
| B. Feature expansion first | Add custom decks, modes, stats, online rooms, and content breadth before changing the core flow | Creates a large feature surface quickly | Multiplies state/privacy/test complexity before the core loop is trustworthy |
| C. Core-first quality pass, recommended | Reframe active phases as a mobile game shell, formalize privacy transitions, tighten the rules and result loop, then add content and optional capabilities | Improves every session immediately and creates a stable base for later modes | Requires coordinated frontend, rules, content, and QA work before feature expansion |

Choose approach C. The shared-device topology is the product’s strongest
differentiator and its largest usability constraint. Current comparable products
consistently emphasize one-device play, private reveals, quick handoffs, timers,
voting, final guesses, and replay breadth. For example, [Pass the Phone](https://passthephone.app/en/pass-the-phone-game/)
describes a one-phone prompt-and-handoff loop, [Sketchlapse](https://www.sketchlapse.com/)
emphasizes privacy screens and fast handoffs, and the [Imposter: Pass and Play
listing](https://play.google.com/store/apps/details?id=com.imposter.play)
emphasizes private role passing, offline play, content breadth, difficulty, and
customization. These are developer/product claims, so they are useful patterns,
not proof that each feature is well executed.

## Product and rules lock: Phase 0

Do this before implementation begins. The current refinement spec already
resolves most of the rules; the work here is to expose the rules as product
decisions and remove any remaining ambiguity from copy, state names, and tests.

### Decisions to ratify

- Describe the game publicly as “Spyfall-inspired” or “a Spyfall variant.” Do not
  imply the underlying hidden-location mechanic is novel.
- Keep 4–8 players at one spy and 9–12 players at two spies.
- Keep two-spy partner visibility. Each spy sees the other spy’s name privately.
- Keep the verbal questioning protocol: one question, the answerer asks next,
  no follow-up, and no immediate retaliation question.
- Keep the shared-device verbal-unanimity model for accusations. The interface
  records the group’s confirmation; it cannot authenticate each player.
- Keep voluntary spy calls, correctly accused spy handling, ordered guesses for
  both spies, and the existing point values. The UI must make the sequence
  explicit rather than making the group infer it.
- Keep five rounds, no-repeat-until-deck-exhausted behavior, visible round
  scoring, cumulative leaderboard, and explicit tie treatment.
- Decide the language and tone guardrail before content authoring: clever and
  tense, but suitable for ordinary adult groups and without unsafe stereotypes,
  real-person accusations, or instructions involving dangerous activity.

### Phase 0 deliverables and acceptance criteria

- A short rules decision record is added to the project docs after approval and
  linked from README.
- Every server phase has one user-facing name, one allowed next-state list, one
  entry announcement, and one exit action.
- A state-transition table covers setup, reveal-ready, revealed, hidden handoff,
  investigation, accusation, spy-guess for each spy, result, next round, and
  completed session.
- The product copy says what happens on a wrong accusation, a wrong guess, a
  correct guess, timer expiry, a second spy’s turn, a tie, a failed request, and
  a deleted saved game.
- Every rule row has a pure test or a service test. Any rule change after this
  gate requires an explicit product decision and updated tests before UI work.

## Target experience

The active flow should be a compact state machine with a single clear action at
each handoff:

    Setup / Resume
        -> Handoff: named player
        -> Reveal: private card
        -> Hide and pass
        -> Investigation: timer + rules
        -> Accusation: choose -> confirm -> resolve
        -> Guess: spy 1 -> spy 2 if applicable
        -> Result: reveal -> score -> next round

The browser may have supporting information, but only the current state and its
next meaningful action should dominate the screen. The source of truth remains
the server snapshot; the client owns presentation state only.

## Implementation sequence

### Phase 1: Mobile-first game shell

**Goal:** Make the app feel like a game while preserving the existing server
contracts and dark amber design language.

**Primary files:** index.html, styles.css, game.js.

**Work:**

- Add an explicit active-game shell state. Setup/resume can retain concise
  onboarding context; reveal, investigation, accusation, guess, and result should
  hide or collapse the marketing intro, dossier, and footer.
- Reduce the active header to brand, round/phase, and only the status needed for
  the current state. Remove redundant labels from the action area.
- Use a full-height layout with a scrollable content region and a bottom action
  dock only where it materially improves reachability. The dock must add a
  baseline inset plus safe-area inset and must never cover focused content.
- Keep one primary action per state. Put secondary actions in a clear secondary
  row or a disclosure surface, not beside the primary action at equal weight.
- Give choice tiles a strong pressed state, selected state, disabled state, and
  focus state. Do not rely on color alone to convey selection or winner.
- Keep long names and large text from breaking the layout. Test 320, 375, 390,
  430, 768, 1024, and 1440 CSS px widths, portrait and landscape.
- Preserve a no-build vanilla-JavaScript architecture. Extract a module only
  when it creates a stable boundary, such as the content catalog or a reusable
  phase renderer. Do not perform a broad rewrite of game.js merely for style.

**Acceptance criteria:**

- At every active phase, the current task, current player where relevant, and
  primary action are visible without hunting.
- There is no horizontal scrolling at 320 CSS px or at 200% text size.
- Every interactive target has at least 44 CSS px of comfortable hit area in
  the web implementation, with visible spacing and focus. This is an internal
  target informed by Apple’s 44pt guidance and Android’s 48dp guidance; it is
  not interchangeable with WCAG’s 24 CSS px minimum.
- The next action remains visible above the bottom safe area and browser UI.
- A desktop view still uses the additional width for context without making the
  phone-sized flow dependent on a second screen.

### Phase 2: Privacy and handoff boundary

**Goal:** Make it impossible to misunderstand when a secret is private, visible,
hidden, or safe to pass, within the limits of a shared physical device.

**Primary files:** index.html, styles.css, game.js, api-client.js,
server/game-service.js, server/http.js, test files.

**Work:**

- Represent handoff as explicit substates: “Pass to [name]”, “Ready to reveal,”
  “Card visible,” and “Hidden. Pass to the next player.” Use a deliberate tap to
  reveal; do not make a hold gesture the only path because it is harder to
  discover and less accessible.
- Give the secret card an intentionally different visual treatment and a
  prominent hide/pass action. Never put the location or role in the page title,
  persistent header, URL, local storage, session storage, analytics payload,
  service-worker cache, or a general game snapshot.
- Clear secret text, card state, accessible labels, and any derived DOM content
  before the hide request, on successful hide, on phase change, on a failed
  retry that invalidates the card, and when the document becomes hidden.
- On refresh or browser reopen, return to the named handoff with the card hidden.
  Do not rely on beforeunload: mobile browsers may not fire it when the user
  app-switches or kills the browser. Use server persistence plus visibility and
  focus reconciliation.
- Keep card responses no-store and keep API responses out of any service-worker
  cache. Treat no-store as necessary cache hygiene, not as protection against
  screenshots, shoulder surfing, malicious extensions, or a compromised device.
- Make the two-spy sequence explicit: show the partner name privately, show which
  spy is guessing now, show whether another guess remains, and reveal the result
  only after both guesses are complete.
- Add a privacy veil or “screen clear” action only as an optional extra layer. It
  must not replace the ordinary hide action or create a new ambiguous state.

**Acceptance criteria:**

- A static test proves that active snapshots and HTML do not contain secret
  fields outside the private-card render path.
- A browser test runs at least 100 scripted reveal/hide/background/refresh cycles
  and finds no visible secret after the card is hidden.
- A background/resume test reconciles against the authoritative snapshot and
  never advances a handoff based on a stale client timer.
- A two-spy test covers partner reveal, first guess, second guess, and result
  ordering.
- The product documentation states plainly that the app cannot prevent someone
  from photographing or viewing the shared screen.

### Phase 3: Phase UX and social friction

**Goal:** Remove hesitation from the moments that determine whether a group
  trusts the game.

**Primary files:** index.html, styles.css, game.js, api-client.js,
server/game-service.js, test/ux-static.test.js, test/privacy-state.test.js.

**Setup and resume:**

- Put “Start a new game” and “Resume saved game” on equal, obvious paths.
- Use progressive disclosure for setup rules. The first screen should explain
  only player count, pass-phone privacy, and the round length; the full rules
  remain available from a help surface.
- Support fast roster entry, add/remove without layout jumps, duplicate-name
  guidance at the field, and a review state before starting.
- Preserve saved-game metadata without revealing active secrets. Explain the
  difference between an unfinished saved game and a completed session.

**Reveal and handoff:**

- Make the named recipient the first visual element after the phase label.
- Use the same verbs everywhere: Reveal card, Hide and pass, Pass to [name].
- Never auto-reveal after a timeout, focus change, or retry.
- Announce the phase and recipient through a concise status message. Do not place
  secret content in the live region.

**Investigation:**

- Make the timer the visual anchor but keep the questions verbal and social.
- Show the short protocol by default and put expanded rules behind “How to play.”
- Use a clear distinction between “End round” and “Spy: call for a guess.”
- Use a server deadline for truth, a local display tick for responsiveness, and a
  single reconciliation request when the focused display reaches zero.
- Give non-core reading/handoff surfaces no forced countdown. If a future mode
  adds a timer for those surfaces, it must be adjustable or extendable. The
  round countdown is a core game mechanic and needs a product decision before
  being paused or removed.

**Accusation:**

- Use player tiles with names, seat order, and a selected state. Do not make the
  group remember which name was tapped.
- Use a real modal confirmation interaction for the irreversible accusation:
  background inert, focus enters the dialog, Escape returns when appropriate,
  and focus returns to the invoking choice. Follow the [WAI-ARIA modal dialog
  pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/) and test
  actual browser/screen-reader behavior rather than assuming aria-modal alone
  is sufficient.
- Phrase the confirmation in consequence-first language: “Everyone agrees
  [name] is the spy?” Explain that a wrong accusation gives the spies the round.
- Keep “Choose again” easy to reach and preserve the selected player until the
  group cancels.

**Guess and result:**

- Show one guesser at a time, a bounded grid of locations, an explicit confirm
  state, and a plain-language outcome after each guess.
- Make the result a short reveal ritual: winner first, reason second, location
  and spies third, points and next action last. Avoid making the group parse a
  dense data table before seeing who won.
- Keep score/history visible but secondary. At round five, replace “Play again”
  with a clear session-complete state and show ties without inventing a
  tiebreaker.
- Use a stable “Play next round” action that preserves roster and timer, plus a
  separate “New game” action that intentionally discards the roster.

**Errors and recovery:**

- Keep connection errors visible near the current task with Retry and a concise
  explanation. Disable duplicate mutations while one is in flight.
- On a revision conflict, fetch the authoritative snapshot, clear any private
  card, announce that the saved game changed, and move focus to the current
  primary action.
- Make failure states recoverable and non-accusatory: never imply that a player
  did something wrong because the network failed.

### Phase 4: Content, fairness, and replay depth

**Goal:** Make the game replayable because the questions are interesting, not
  because the interface merely supports another click.

**Primary files:** game-logic.js, a new content/locations.js or
content/locations.json, server/game-service.js, database migrations only if
content metadata becomes persisted, test/content.test.js, README and content
documentation.

**Content direction:**

- Audit the current location deck. Use 48 original locations as a starting
  hypothesis, organized into 8–12 broad categories, before tuning the exact
  count from playtest repetition data.
- Give each location an internal schema with stable id, display name, category,
  difficulty, audience-safety tags, cultural-context notes, and a small set of
  fair anchor clues. Anchor clues are QA material and optional future hint
  material; they are not automatically displayed during the round.
- Keep names familiar enough to evoke a place but not so specific that one
  obvious clue instantly solves the round. Avoid real-person names, copyrighted
  text, trademark-heavy imitation, stereotypes, and unsafe real-world
  instructions.
- Author a clue matrix for each location: clues that are safe for a non-spy,
  clues that are too revealing, plausible spy questions, and pairs of locations
  that are too easy to distinguish. Review each location with at least one
  second reader.
- Preserve no-repeat-until-exhausted behavior. Use stable ids so history and
  content changes do not corrupt replay. If the deck is exhausted, clearly
  document the reset behavior.
- Add difficulty and optional hint metadata only after the standard deck is
  coherent. A hint must help the spy participate without making the location
  trivial for everyone else.
- Defer user-created packs until moderation, import limits, privacy, and
  persistence are designed. A local content file is enough for this release.

**Acceptance criteria:**

- Content validation rejects duplicate ids/names, empty categories, unsafe
  metadata shapes, and locations with missing QA fields.
- Pure tests prove sampling, no-repeat behavior, deck exhaustion, and replay
  compatibility.
- A content review checklist is completed for every location in the release
  deck.
- Pilot groups can name the location category after the reveal and report that
  most rounds had multiple plausible suspects.
- Content counts from competitor listings are treated as marketing claims, not
  as a reason to inflate the deck without quality review.

### Phase 5: Feel, audiovisual feedback, and finish

**Goal:** Add character and feedback without turning the game into a noisy or
  inaccessible spectacle.

**Primary files:** styles.css, index.html, game.js, optional small assets,
  test/ux-static.test.js.

**Work:**

- Use restrained phase accents: briefing, private handoff, investigation,
  decision, last chance, and debrief should feel distinct while retaining the
  same color and type system.
- Add a visible pressed state for every actionable tile and button. Use subtle
  elevation/materiality for cards, but keep text contrast and focus stronger
  than decoration.
- Add reduced-motion equivalents for every transition. The state must remain
  understandable when animation is disabled. Preserve the current
  prefers-reduced-motion support and test it on real devices.
- Add optional sound cues for reveal, hide, timer warning, accusation confirm,
  guess resolution, and result. Provide a visible sound toggle and never rely
  on autoplay; browser media policies can reject audible playback.
- Add optional haptics only as a redundant cue. Haptic support is inconsistent,
  can be suppressed, and must never carry essential information by itself.
- Consider Screen Wake Lock during the active investigation only, behind a
  clear user setting or an unobtrusive opt-in. Reacquire after visibility
  returns when permitted and show no alarming failure if the browser declines.
- Do not add a looping background track, flashing countdown, forced vibration,
  or large animation that makes the phone harder to pass around.

**Acceptance criteria:**

- Sound-off, haptics-off, reduced-motion, and unsupported-device paths preserve
  the same information and completion rate as the default path.
- No audio starts without an explicit user gesture or enabled setting.
- Timer warnings have visual, textual, and optional audio/haptic channels.
- A visible press state appears within the interaction budget on touch and
  keyboard input.

### Phase 6: PWA shell, offline honesty, and resilience

**Goal:** Make the hosted game pleasant to reopen and install without pretending
  that a server-authoritative saved game can mutate while disconnected.

**Primary files:** index.html, a new manifest.webmanifest, service-worker.js,
offline.html, api-client.js, game.js, docs/deployment.md, test/phase2-static.test.js,
test/offline-contract.test.js.

**Work:**

- Add a web app manifest with name, short name, icons, theme colors, start URL,
  and standalone display. Test browser-installed and normal-tab modes
  separately. Installation is an enhancement, never a prerequisite.
- Add a versioned service worker that caches only the static shell, styles,
  scripts, manifest, icons, and offline page. Network API requests, private
  cards, session-specific JSON, and result mutations must be network-only and
  no-store.
- Make the offline page explain the boundary: the app can show a reconnect
  surface, but an authoritative saved game needs the server. Do not claim that
  “offline” means a saved server game can continue safely.
- Use navigator.onLine and online events only as hints. Confirm recovery with a
  same-origin health or game request, then reconcile the snapshot. A LAN can
  report online while the site is unreachable.
- Keep current server persistence, idempotency, revisions, and absolute
  deadlines. On reconnect, re-fetch before enabling a mutation and clear any
  stale private card.
- Decide separately whether a future “Quick Play” local-only mode is worth
  building. If pursued, it must use memory-only secrets, have a visibly separate
  mode label, avoid sharing saved-game state, and receive its own threat model
  and rule tests. Do not quietly turn the server-backed mode into a hybrid.
- Version and invalidate the service-worker cache deliberately. A stale shell
  must fail safe and provide a recovery path after a deployment.

**Acceptance criteria:**

- The app loads a useful reconnect/offline surface after the shell is cached.
- No private API response is present in Cache Storage, and the service worker
  has no route that caches /api.
- Installed mode and browser mode both preserve the same handoff privacy.
- A kill/reopen/background/offline/online matrix resumes from authoritative
  state or explains exactly why a user must retry.
- A service-worker update test verifies that a new shell can replace an old one
  without exposing a stale active game state.

### Phase 7: Verification, playtest, and launch

**Goal:** Replace confidence based on static tests with evidence from real
  browsers, real devices, and real groups.

**Test layers:**

- Keep the existing pure rules suite and extend it for all rules decisions,
  content validation, score ties, deck exhaustion, and two-spy ordering.
- Extend service tests for privacy, idempotency, revision conflicts, expiry
  reconciliation, retry, ownership, deletion, and result/history boundaries.
- Add static contract tests for semantic roles, dialog labels, hidden secret
  fields, manifest/service-worker routes, no-store headers, no browser-storage
  game state, and absence of external runtime dependencies.
- Add real-browser tests using Playwright or the available browser testing
  workflow. Cover first run, resume, every phase, wrong accusation, both guess
  paths, replay, deletion, errors, refresh, background/foreground, and long
  names. Do not treat Node tests as visual or interaction proof.
- Run a device/accessibility matrix: iOS Safari, Android Chrome, desktop
  Safari/Chrome/Firefox where available; 320px and 390px phones; landscape;
  200% text; keyboard-only; VoiceOver and TalkBack; reduced motion; sound off;
  slow network; offline; app switcher; light/forced color settings if
  supported.
- Add performance marks for boot-to-usable, tap-to-acknowledgement,
  phase-render, API latency, and layout shift. Keep marks free of player names,
  locations, roles, card text, or session identifiers. If production telemetry
  is proposed, get an explicit privacy decision first; pilot logging can remain
  local and manual.

**Pilot design:**

- Recruit 6–10 groups across 4, 5–8, and 9–12 players. Include both experienced
  party-game players and people unfamiliar with Spyfall.
- Observe the first setup, at least three handoffs, one accusation, one guess,
  one result-to-next-round transition, and one interrupted/reopened session.
- Record only task outcomes and friction: hesitation, wrong tap, secret glimpse,
  clarification question, premature exit, rule dispute, content complaint, and
  whether the group starts another round.
- Ask three short questions after play: “What was confusing?”, “When did the
  game feel most fun?”, and “Would you start another round?”
- Tune copy and layout before adding new modes. Tune content and scoring only
  after the rules contract remains stable across observed groups.

**Release gates:**

- No known P0 privacy, secret-clearing, incorrect-state, or irreversible-action
  defect.
- Existing and new automated tests pass, including browser tests for the
  supported happy path and failure paths.
- No 320px/200%-text layout loss and no inaccessible keyboard or dialog trap.
- p75 mobile INP is at or below 200ms in the measured release candidate, with
  API latency reported separately.
- Handoff, privacy, resume, and two-spy acceptance criteria pass on the real
  device matrix.
- Pilot completion and “play again” targets are met or have an explicitly
  documented product decision.
- Content review is complete, including safety, duplicate, fairness, and
  cultural-context checks.
- Deployment smoke test confirms correct asset version, API health, migrations,
  no-store behavior, and a fresh-process resume.

## File map and ownership

| Area | Files | Planned responsibility |
| --- | --- | --- |
| Active shell and semantics | index.html, styles.css | Phase visibility, safe-area layout, action hierarchy, focus/dialog semantics, press states, reduced-motion variants |
| Client state and rendering | game.js | Sanitized snapshot rendering, phase presentation, card clearing, focus/announcement policy, deadline display, mutation queue, recovery |
| Browser API boundary | api-client.js | Same-origin requests, structured errors, idempotency key reuse, retry rules, no-store private-card handling |
| Pure rules | game-logic.js | Player/spies rules, state transition helpers, scoring, timer formatting, content selection, no-repeat deck behavior |
| Content | content/locations.js or content/locations.json | Versioned original locations, categories, difficulty/tags, QA metadata, stable ids |
| Server rules | server/game-service.js, server/validation.js | Authoritative transitions, two-spy order, expiry reconciliation, safe snapshots, content contract |
| Persistence | server/memory-store.js, server/postgres-store.js, database/migrations | Transaction ordering, receipts, deadlines, history, optional future content/mode persistence |
| PWA/reconnect | manifest.webmanifest, service-worker.js, offline.html | Static shell installability and reconnect boundary; never cache private API data |
| Tests | test/content.test.js, test/privacy-state.test.js, test/ux-static.test.js, test/offline-contract.test.js, test/browser/ | Rules, static contracts, privacy, accessibility, browser and lifecycle behavior |
| Documentation | README.md, docs/deployment.md, docs/superpowers/specs | Rules, setup, install/reconnect boundary, QA evidence, approved decisions |

Avoid a database migration for static content unless the product explicitly
needs server-selected custom packs or content administration. The first deck can
be a versioned code asset consumed by the pure rules and validated in tests.
Likewise, do not split game.js or game-logic.js by file count alone; extract only
when a stable interface improves testability or prevents secret/state coupling.

## Dependency order and checkpoints

1. Phase 0 rules, copy, safety, and scorecard lock.
2. Phase 1 active shell and responsive semantics.
3. Phase 2 privacy/handoff tests and two-spy state clarity.
4. Phase 3 phase-specific interaction and recovery UX.
5. Phase 4 content catalog and fairness QA can run in parallel with late Phase 3,
   but must be complete before pilot launch.
6. Phase 5 audiovisual polish after the state and accessibility paths are stable.
7. Phase 6 PWA/offline shell after API/no-store contracts are stable.
8. Phase 7 full browser/device matrix, pilot, fixes, and release decision.

At each checkpoint, run the existing test command:

    npm test
    node --check game-logic.js
    node --check game.js
    node --check api-client.js
    git diff --check

The browser and device gates are additional; a passing Node suite cannot replace
them. Each phase should end with a small reviewable slice and a recorded
acceptance result. Do not combine the content expansion, PWA work, and visual
shell rewrite into one unreviewable change.

## Risk register

| Risk | Why it matters | Mitigation and owner |
| --- | --- | --- |
| Rules drift from Spyfall or from the existing refinement contract | Players may dispute outcomes and the product may make unsupported originality claims | Product owner ratifies the rules record; tests and copy derive from it |
| Shared-device secret exposure | One leak can invalidate trust in the whole game | Client/server privacy contract, DOM clearing, no-store, no cache, lifecycle tests, explicit physical-device limitation |
| Browser/app-switcher lifecycle loss | Mobile browsers do not guarantee beforeunload or timer callbacks | Server deadline and persistence remain authoritative; reconcile on visibility/focus/reopen |
| Offline hybrid inconsistency | A client may show a state that the server later rejects | Static-shell-only service worker; network-only API; reconnect snapshot before mutation |
| Two-spy ambiguity | One spy may guess while the other is forgotten or shown the wrong turn | Ordered guess state, partner reveal test, result blocked until required guesses complete |
| Timer/accessibility conflict | A countdown can pressure users during reading or assistive interaction | Keep round timer as a documented core mechanic; never time-box handoff/help without an adjustable policy |
| Content quantity over quality | A large deck can still produce repetitive or unfair prompts | Schema, clue matrix, second-reader review, no-repeat tests, pilot feedback |
| Desktop/mobile divergence | A desktop layout may accidentally become a second required screen | Same state contract and action hierarchy; desktop only adds supporting context |
| Analytics/privacy creep | Player names, locations, or roles could become telemetry | No analytics by default; if approved, emit coarse event names only and document retention |
| Service-worker staleness | An old shell can talk to new contracts or display stale copy | Versioned caches, update test, safe fallback, deployment smoke test |
| Social awkwardness around accusation | The UI could appear to authenticate a verbal consensus it cannot verify | Copy says “Everyone agrees?” and keeps the interface as a recorder of the group’s spoken decision |
| Long names and localization | Names or future translations can break tiles and phase headings | Stress test long strings, use semantic wrapping, reserve space for future expansion |

## Research basis and source ledger

The research was conducted on 2026-09-08. Product listings and developer pages
below are treated as first-party feature claims, not independent usability
evidence. Platform and standards sources are separated conceptually from
comparator patterns. Confidence describes confidence in the observed claim, not
confidence that the product executes it well.

| Claim used in this plan | Source and date | Evidence summary and implication | Confidence and limitation |
| --- | --- | --- | --- |
| One-phone party play benefits from a clear prompt/choice/handoff/reveal loop | [Pass the Phone: Pass the Phone Game](https://passthephone.app/en/pass-the-phone-game/), Pass the Phone, date not stated | The first-party site describes one phone, player choice, handoff, timed prompts, and a reveal payoff. Keep handoff as a first-class game state. | High for the product’s stated behavior; developer marketing claim |
| Privacy screens and fast handoffs are explicit product features in comparable one-device games | [Sketchlapse](https://www.sketchlapse.com/), Beta Acid, ©2026 | The site emphasizes a privacy screen between turns, fast handoffs, offline play, and a reveal chain. Treat “safe to pass” as a visible state, not implied copy. | High for stated feature; no independent task-success measurement |
| Private role passing, offline use, difficulty, hints, and custom content recur in current digital imposter games | [Imposter: Pass and Play](https://play.google.com/store/apps/details?id=com.imposter.play), Anish Mishra, updated 2026-05-24 | The listing claims offline/no-account play, private role pass, 5,000+ word pairs, difficulty levels, hints, timers, custom word banks, and player ordering. Use these as prioritization signals, not a mandate to copy the feature set. | High for listing claims; counts and quality are unverified marketing |
| Comparable digital versions commonly add private voting, final guesses, history, and multiple modes | [Undercover: Word Party Game](https://play.google.com/store/apps/details?hl=en_CA&id=com.yanstarstudio.joss.undercover), Yanstar Studio OU, updated 2026-09-01, and [official FAQ](https://www.yanstarstudio.com/undercover-faq) | The listing/FAQ describe same-phone offline play, secret roles, pass-and-play, voting/reveal, score/ranking, custom words, and tie options. Use explicit resolution and replay as quality opportunities while keeping this game’s rules distinct. | High for stated behavior; comparator mixes online and offline modes |
| Spyfall’s published format supports timed questions, accusation, location guessing, repeated rounds, and expanded location/role decks | [Spyfall 2 product page](https://cryptozoic.com/products/spyfall2_game), Cryptozoic, release date 2017-01-25, and [Spyfall 2 rulebook](https://cdn.shopify.com/s/files/1/0464/6961/1676/files/SPYFALL2_Rulebook.pdf?v=1611121030), Hobby World/Cryptozoic, ©2016 | Publisher materials describe up to 12 players, two-spy play, short rounds, accusation, spy guesses, scoring, and replay through locations/roles. The plan preserves the inspired variant while documenting where its exact rules differ. | High for published rules; not a legal opinion and not evidence of UX quality |
| A host-visible screen and explicit lobby reduce coordination cost in multi-device party games | [How to Play](https://www.jackboxgames.com/how-to-play), Jackbox Games, date not stated | Jackbox describes a host screen, lobby, room code, and phones as controllers. This is topology-adjacent, not a direct same-phone requirement; borrow the readiness/status principle only. | High for Jackbox’s flow; limited transfer because this app intentionally uses one device |
| Games should teach through play, use good defaults, and make nonessential onboarding skippable | [Apple HIG: Designing for games](https://developer.apple.com/design/human-interface-guidelines/designing-for-games) and [Onboarding](https://developer.apple.com/design/human-interface-guidelines/onboarding), Apple Developer, current/undated | Apple guidance favors contextual teaching, clear defaults, legibility, full-screen game focus, and optional onboarding/help. Keep the first-run explanation short and put reference material later. | High as platform guidance; recommendation, not web conformance law |
| WCAG 2.2 provides requirements for reflow, resize, keyboard access, focus, timing, status messages, target size, and non-color cues | [Web Content Accessibility Guidelines (WCAG) 2.2](https://www.w3.org/TR/WCAG22/), W3C Recommendation, 2024-12-12 | WCAG covers 320px reflow, 200% text resize, keyboard/no-trap, focus visibility, timing adjustment, status messages, and 24px minimum targets with exceptions. Use it as the normative web baseline, then apply a more generous internal touch target. | High; success criteria and exceptions require page-specific judgment, especially for core game timers |
| True modal dialogs need focus management and inert background behavior | [WAI-ARIA APG: Dialog (Modal) Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/), W3C WAI, current page | The pattern requires focus entry, containment, Escape behavior, labeling, and return focus when the background is genuinely modal. Use tested dialog behavior for accusation/delete confirmation. | High as implementation guidance; APG is advisory and browser/AT support still needs testing |
| Safe-area insets are required when a web layout goes edge-to-edge | [Designing Websites for iPhone X](https://webkit.org/blog/7929/designing-websites-for-iphone-x/), WebKit/Apple, 2017-09-22, updated safe-area section 2017-10-31 | WebKit documents viewport-fit and env safe-area insets, with baseline padding plus the inset. Apply this to any fixed/sticky action dock and test browser chrome changes. | High for WebKit behavior; other browsers and installed modes need their own checks |
| Dynamic viewport units can resize as browser UI changes | [CSS length and viewport units](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/length), MDN, current page accessed 2026-09-08 | MDN distinguishes small, large, and dynamic viewport units and warns that dynamic resizing can degrade UI. Keep content scrollable and test 100dvh rather than assuming it is universally stable. | High; implementation behavior varies by browser version |
| Visibility events are more reliable than beforeunload for lifecycle reconciliation | [Page Visibility API](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API), MDN, last modified 2025-12-30, and [beforeunload](https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeunload_event), MDN, current page | Browsers throttle background work; beforeunload is unreliable on mobile. Reconcile from the server on visibility/focus and do not decrement a timer blindly in the background. | High; exact browser lifecycle behavior still needs real-device testing |
| no-store prevents compliant caches from storing private responses but is not a complete privacy guarantee | [RFC 9111 HTTP Caching](https://www.rfc-editor.org/rfc/rfc9111.html), IETF, 2022-06, and [MDN Cache-Control](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cache-Control), current | The standard defines no-store behavior and warns it cannot defeat every malicious cache or eavesdropper. Keep no-store and add DOM/storage/cache hygiene plus the physical-device warning. | High; HTTP cache rules do not cover screenshots or hostile local software |
| Service workers can provide a cached shell, but full offline mutation requires a separate data/conflict design | [Service workers](https://web.dev/learn/pwa/service-workers) and [Assets and data](https://web.dev/learn/pwa/assets-and-data), web.dev, accessed 2026-09-08 | web.dev describes static-shell caching, optional service workers, durable storage needs, and the higher complexity of offline sync. Cache the shell only until a local-only mode is deliberately designed. | High; service-worker/browser support and deployment behavior need testing |
| Installed PWA behavior varies by browser and is optional | [Web app manifest](https://web.dev/learn/pwa/web-app-manifest) and [Installation](https://web.dev/learn/pwa/installation), web.dev, accessed 2026-09-08 | Manifest/install behavior differs by browser and OS; an app should still work without install. Treat install as a convenience layer. | High; exact install criteria are browser/platform-specific |
| Good p75 INP is at or below 200ms, but field measurement is needed | [Web Vitals](https://web.dev/articles/vitals), web.dev, last updated 2024-10-31 | web.dev defines INP and its p75 good threshold, and distinguishes field measurement from lab proxies. Measure actual game interactions and report API latency separately. | High for the web performance metric; not a direct game-fun or privacy measure |
| Screen Wake Lock can help keep an active round visible, but requests can fail and must be reacquired after visibility changes | [Screen Wake Lock API](https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API), MDN, current page accessed 2026-09-08 | MDN documents secure-context requirements, possible request failure, and reacquisition on visibility changes. Use it only during an active round, with a fallback and no user-visible failure state. | High for API caveats; availability varies by browser, device, power policy, and installed mode |
| Audio/haptics are optional, policy-constrained, and must have redundant visual/text channels | [Autoplay guide](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay), [Vibration API](https://developer.mozilla.org/en-US/docs/Web/API/Vibration_API), MDN, current pages, and [Xbox Accessibility Guideline 103](https://learn.microsoft.com/en-us/xbox/accessibility/xbox-accessibility-guidelines/103), Microsoft, current | Browsers can reject audible autoplay; vibration is inconsistently supported/suppressed; accessibility guidance says critical cues need another sensory channel. Make sound/haptics opt-in and redundant. | High; support varies by browser, device, permission, and user settings |

## Research limitations and stop condition

The evidence is sufficient for this plan because the same patterns recur across
publisher rules, first-party one-device products, platform guidance, and web
standards. The research does not establish:

- A universal “best” round length, reveal animation, haptic pattern, or scoring
  balance for this specific group and content deck.
- A first-party comparator study measuring secret leakage, handoff error rate,
  screen-reader success, p75 input latency, or five-round retention.
- A guarantee that a browser can prevent screenshots, shoulder surfing, or
  app-switcher previews.
- A reliable rule that a server-backed game can be fully playable offline without
  a separate local-state and conflict model.
- That a competitor’s content count, “no ads,” privacy label, or update date
  proves a better player experience. App-store privacy labels and feature
  listings are developer-supplied and may be incomplete.

Those gaps are why the plan uses hypotheses, explicit acceptance tests, real
device checks, and a group pilot instead of treating competitor feature counts as
requirements. Further broad browsing is unlikely to change the recommended
sequence until the product rules and first-party flow are tested with players.

## Approval and next step

This document is ready for review as the implementation direction. After approval,
turn Phase 0 decisions into the project’s design/spec record, then execute the
phases as small reviewable slices. The first implementation slice should be the
mobile active shell plus semantic state/focus tests; it should not add custom
decks, analytics, online play, or a full offline mode before the core handoff
loop passes privacy and real-device checks.
