# Existing-game comparison: Spy

**Research date:** 2026-09-08
**Scope:** Current browser and app implementations of the hidden-spy/location party-game format, plus publisher rulebooks. This is a product/prior-art comparison, not a legal opinion or an exhaustive patent/copyright search.

## Executive conclusion

The core game you built is not a new game concept. It is a close digital implementation of **Spyfall**, a published game whose documented rules already include a secret location known to non-spies, one spy who does not know the location, timed questioning, accusation, and a spy location guess. The published **Spyfall 2** rules also cover up to 12 players and two spies, including a recommendation to use two spies with nine or more players.

The single-device browser format is also not new: current websites and apps explicitly advertise local pass-the-phone play with private role reveals. Your work is still a distinct implementation and product: the visual design, wording, exact phase flow, server-authoritative privacy model, anonymous session ownership, Postgres persistence, resume-after-refresh behavior, idempotent API, and round-history implementation were not established as copied from any one source in this review. Those are engineering and UX distinctions, not a new underlying game mechanic.

The fairest description is therefore: **a well-executed Spyfall-inspired web game with its own implementation and some product-level differences, rather than a genuinely new genre or rules invention.**

## What was compared

The project specification and README describe a same-device game for 4–12 named players: one spy for 4–8 players and two spies for 9–12; non-spies see a location and category; players privately reveal cards while passing one device; a 3/5/8-minute round leads to accusation; a correctly accused spy gets one location guess; and the result can be replayed. Phase 2 adds server-side secrets, anonymous HttpOnly sessions, persistence/resume, completed-round history, revision checks, and idempotency. See the [project README](../../README.md), [Phase 1 design specification](../superpowers/specs/2026-09-06-spy-game-design.md), and [Phase 2 design specification](../superpowers/specs/2026-09-07-spy-game-phase-2-design.md).

The deployment label needs care: the README calls this a standalone Vercel project, but also says there is no public matchmaking or WebSocket play. The Phase 2 design keeps the first release on one shared device and defers individual player devices. In other words, “online” describes web hosting, persistence, and URL access here, not a newly invented networked party-game format.

## Closest matches

| Your feature | Existing source | Assessment |
| --- | --- | --- |
| Everyone except the spy sees the same location; players ask questions; the group identifies the spy; the spy can guess the location | [Cryptozoic's Spyfall game summary/rules PDF](https://deviramericas.com/wp-content/uploads/2014/12/2015_SpyFall_Game.pdf) | Direct match to the original published rules. The PDF describes secret location cards, one Spy card, 8-minute questioning rounds, accusation, and the Spy's location guess. |
| 4–12 players, with two spies in larger groups | [Hobby World's official Spyfall 2 rulebook](https://hobbyworldint.com/wp-content/uploads/2019/12/SPYFALL2_rules_ENG_curves.pdf) | Very close match. Spyfall 2 is for up to 12 players and its setup guidance recommends two spies for nine or more players. |
| One shared phone, private reveal, then pass to the next player | [The Spyfall rules](https://thespyfall.com/how-to-play) and the [SpyFall: Find the Spy App Store listing](https://apps.apple.com/us/app/spyfall-find-the-spy/id6743214724) | Direct match. The browser rules advertise local pass-and-play on one phone; the app listing advertises 3–12 players on one device and passing the phone for secret cards. |
| Timer, accusation/vote, and a final location guess if the spy is caught | [Spyfall.co's rules](https://spyfall.co/app/how-to-play) and the [App Store listing](https://apps.apple.com/us/app/spyfall-find-the-spy/id6743214724) | Direct or near-direct match. The sources describe adjustable timers, questions, voting, and the caught spy's last chance to guess the location. |
| A browser-hosted version of Spyfall with rooms and persistent online state | [Adrianocola's open-source Spyfall implementation](https://github.com/adrianocola/spyfall) and its [live site](https://spyfall.adrianocola.com/) | Confirms that browser implementations existed independently, including a React/Firebase implementation with room creation/joining and a timer. It is not evidence that your code copied this project. |
| Secret-role pass-and-play beyond location-based Spyfall | [Dronk's imposter-game guide](https://dronkapp.com/imposter-game/) | Adjacent prior art rather than an exact rules match: one phone, private reveal, timer, voting, and a final guess are used with secret words instead of locations. |

## Independent rules comparison

The following comparison uses the published Cryptozoic rules summary for the original game and Hobby World's official Spyfall 2 rulebook. Current websites and apps are useful evidence of variants, but the publisher rules are the baseline for deciding whether the project's defined rules match the original.

| Rule element | This project | Published Spyfall rule | Finding |
| --- | --- | --- | --- |
| Hidden information | Non-spies see the same location and category; spies see neither. | Non-spies receive the location; the Spy receives a Spy card and does not know the location. | **Core match.** The category is an added hint, not part of the original core summary. |
| Player count | 4–12. | Original: 3–8. Spyfall 2: 3–12. | **Custom range.** The upper bound comes from the sequel; the lower bound excludes the original's 3-player option. |
| Number of spies | Hard-coded: one for 4–8, two for 9–12. | Spyfall 2 lets the group choose one or two; it recommends one at six or fewer, two at nine or more, and requires two at 12. | **Close, but stricter.** The project's boundary is a sensible default, while the published rule leaves the choice open in the middle. |
| Two-spy coordination | Each spy only learns “you are the spy”; there is no partner-reveal step. | Spyfall 2 has the two spies identify each other after everyone views their card. | **Meaningful difference.** The project's two spies are independent rather than a known team. |
| Questioning | The app displays reminders, but the live conversation is not enforced by software. The spec does not encode turn order or a no-follow-up rule. | The dealer asks first; the answerer asks another player; no follow-up questions or immediate retaliation questions. | **Rule omission / house-rule freedom.** The social loop is present, but the published procedure is not implemented or stated as a formal constraint. |
| Timer | Host chooses 3, 5, or 8 minutes; expiry moves the game to accusation. | Original summary specifies an 8-minute round, while the full rules allow the group to agree on a different length. | **Compatible customization.** The timer mechanic matches; the presets are yours. |
| Accusation during or after the round | After the timer or an early host stop, the host selects one suspect and the server resolves it immediately. | A player stops the clock and asks the others to vote; the accusation succeeds only with unanimity. At time-out, the accusation phase proceeds through players until a unanimous conviction or the Spy wins. | **Major rules difference.** There is no group vote, unanimity requirement, rotating accuser, or per-player accusation limit in the implementation. |
| Accusing a non-spy | Wrong accusation immediately gives the win to the spies. | A unanimously accused non-spy gives the Spy the win. | **Outcome match; procedure differs.** |
| Catching a spy | A correct host accusation opens a `spy-guess` phase. | In the original rules, a spy who is caught by another player's accusation loses; the spy's voluntary guess is a separate action. The rulebook explicitly says a spy cannot guess after another player has stopped the clock to accuse. | **Variant.** The post-capture guess is common in digital versions, but it is not the original physical rule. |
| Spy location guess | Only the accused spy may choose one location, and only after a correct accusation. | A spy may reveal and guess at any time while the clock is running and before another player has stopped it. | **Major rules difference.** The project removes the spy's proactive risk/reward action and changes when the guess is available. |
| Two-spy guess | The unaccused second spy never gets a guess; the outcome is resolved from the selected accused player's guess. | In Spyfall 2, when one spy makes a location proposition, the other spy also reveals and guesses; the spies win if at least one is correct. | **Incomplete sequel alignment.** For 9–12 player games, the current flow should explicitly document whether only one selected spy is intended to guess. |
| Wrong location guess | Group wins. | Non-spies win when no spy identifies the location. | **Outcome match.** |
| Timer expiry without a successful accusation | The host gets one suspect selection; a wrong choice gives spies the win. | The end-of-round accusation process gives each player a chance to initiate a unanimous accusation; if nobody is unanimously convicted, the Spy wins. | **Outcome is similar, decision process is not.** |
| Location-specific roles | Non-spies see only location plus category. | The publisher advertises an advanced mode with a role at each location; Spyfall 2 describes a specific role for each non-spy. | **Simplified mode.** Category is not equivalent to a role card. |
| Replay and overall game | Replay keeps the roster, avoids the immediately previous location, and stores completed-round history; there is no points table or overall winner. | The physical game is played over agreed rounds, typically five, with points awarded each round and a player winner at the end; used location decks are not replayed during that game. | **Round-level digital variant.** History is an implementation strength, while scoring and the full used-deck rule are not present. |

### Rule conclusion

Call the defined rules **Spyfall-inspired** or **a Spyfall variant**, not an original rules invention. The hidden location, hidden spy, questions, timer, accusation, and location-guess ideas are direct matches. The project still has a coherent identity because its host-mediated, same-device, server-backed flow is intentionally simpler and more controlled than the physical rules.

The highest-priority rules decision is the 9–12 player case. Either implement the Spyfall 2 convention (the two spies know each other and both guess when the guess action is triggered), or explicitly state that this project uses independent spies and only the selected accused spy receives a guess. Leaving it implicit makes the outcome of a correct accusation ambiguous for the second spy.

## Execution comparison

### This project

The current checkout is a vanilla-JavaScript, same-device browser game. Phase 2 adds a Vercel Functions API and Postgres persistence. The server creates an anonymous 30-day HttpOnly session, stores only a hash of the token, owns the assignments and deadlines, and exposes one current private card at a time. General snapshots intentionally omit active location, category, spy flags, assignments, and card content. Mutations use row-locked transactions, revision checks, and idempotency receipts; expired rounds are reconciled from an absolute deadline. Completed round results are available through an owned history endpoint. See the [README](../../README.md), [Phase 1 design](../superpowers/specs/2026-09-06-spy-game-design.md), [Phase 2 design](../superpowers/specs/2026-09-07-spy-game-phase-2-design.md), [game logic](../../game-logic.js), and [server game service](../../server/game-service.js).

That architecture is unusually privacy- and failure-conscious for a pass-the-phone game. It is also intentionally narrow: no accounts, public rooms, join codes, separate player devices, chat, WebSockets, custom location decks, location roles, or scoring system.

### Adrianocola's open-source Spyfall implementation

The [adrianocola/spyfall repository](https://github.com/adrianocola/spyfall) is a React + Firebase implementation. Its published README documents Firebase anonymous authentication and Realtime Database deployment. The source shows a Redux game state containing `playersRoles`, `location`, `spies`, and timer state; `GameManager` combines local and remote players, selects locations, assigns configurable spy counts and location roles, and writes the active game state. Its database rules distinguish room data, remote players, and locations, with authenticated clients reading room data. These are different trade-offs from the project's server-sanitized snapshot and one-card endpoint: the open-source app is designed around synchronized room state and client rendering, while this project is designed around a single browser session and deliberate secret minimization. See the repository's [README](https://github.com/adrianocola/spyfall), [constants](https://raw.githubusercontent.com/adrianocola/spyfall/master/app/consts.js), [GameManager](https://github.com/adrianocola/spyfall/blob/master/app/containers/Game/GameManager.jsx), [game reducer](https://github.com/adrianocola/spyfall/blob/master/app/reducers/game.js), [Firebase service](https://github.com/adrianocola/spyfall/blob/master/app/services/firebase.js), and [database rules](https://github.com/adrianocola/spyfall/blob/master/database.rules.json).

| Capability | This project | Adrianocola implementation |
| --- | --- | --- |
| Play topology | One shared browser/phone; no public room or second device. | Local play plus Firebase-backed rooms with remote players, room IDs, and join URLs. |
| Framework and state | Vanilla JS; explicit server state machine; Vercel Functions + Postgres. | React/Redux; Firebase Realtime Database/Auth/Analytics; local Redux Persist for configuration/session state. |
| Secret handling | Active location and assignments stay server-side; current card is fetched privately and snapshots are sanitized. | Active game state is represented in Firebase-backed state (`playersRoles`, `location`, `spies`) and rendered by authorized clients under the project's database rules. |
| Player and content options | Fixed 4–12 roster, 24 categorized locations, fixed 1/2-spy threshold, no custom roles or decks. | 3–12, 52 default locations from Spyfall 1/2 in the inspected constants, configurable spy count, location-specific roles, custom locations, and an all-spies mode. |
| Round state | Absolute server deadline, server-side expiry reconciliation, revision conflicts, idempotent mutations, refresh/cold-start resume, completed-round history. | Realtime room synchronization and a Firebase-updated timer; the inspected core state focuses on the active game and room, and I found no equivalent to this project's Postgres round-history contract. |
| Host controls | Start, end, accuse, guess, replay, delete. | Moderator mode, fixed location/role reservations, hide-spy-count option, auto-start countdown, room management, settings, and analytics. |
| Presentation | Dark classified-file visual system with semantic controls, focus management, live neutral announcements, and reduced-motion behavior. | React/Bootstrap/Emotion UI with localization and a broader remote-room/settings surface. |

The open-source project is therefore not simply “the same app with different code.” It is broader as a multiplayer/configuration product; this project is more deliberate about same-device simplicity, server authority, resumability, and not sending active secrets in general state. The inspected sources are enough to compare architecture and UX scope, but not to establish a line-by-line code relationship or to make a full security audit of the live deployment.

### Other current browser and app benchmarks

The closest current website benchmark, [TheSpyfall](https://thespyfall.com/how-to-play), advertises both local pass-and-play on one phone and online rooms, with 3–10 players, multiple spies, adjustable 30-second-to-15-minute timers, and locations/items/role modes. The project matches its pass-phone interaction but has a different 4–12 range and a materially smaller feature surface; its persistence and API privacy model are not documented on the marketing page. [Spyfall.co](https://spyfall.co/app/how-to-play) likewise advertises 3–10 players, 3–15-minute rounds, questions, voting, and online rooms. The [SpyFall: Find the Spy App Store listing](https://apps.apple.com/us/app/spyfall-find-the-spy/id6743214724) is a closer feature match for 3–12 players on one device, 1–3 spies, 1–15-minute timers, pass-the-phone reveals, replay/history, and no internet. The project's differentiators are browser/no-install delivery and server-backed resume; those products' advantages are wider content, offline/local operation, and (in some cases) richer scoring/history or online play.

## Originality by layer

### Not original at the rules level

The central loop—secret location, one or more people who do not know it, conversational clues, suspicion/accusation, and a location guess—is the Spyfall formula. Spyfall's publisher summary dates the published product to 2015 and describes the same loop. Spyfall 2 makes the overlap with your player range especially clear: up to 12 players and two spies are part of the published sequel's design. Your host-only selection of one suspect differs from the original's player-led accusation/consensus procedure, but the accusation stage and wrong-accusation result are established rather than novel. The category label shown to non-spies is likewise a small presentation hint around the shared-location mechanic.

### Not original at the interaction-pattern level

Passing one phone around and tapping to reveal a private role is independently offered by current browser and iOS versions. No-install/no-account local play is also an existing positioning for these products.

### Potentially distinctive at the implementation/product level

This review did not find a source that establishes the same combination of:

- a vanilla-JavaScript same-origin app with a Vercel Functions/Postgres backend;
- server-side secrecy that returns only the current player's card;
- an anonymous HttpOnly session that owns a game;
- refresh/cold-start resume and stored completed-round history;
- revision checks and idempotency for state-changing requests; and
- your particular dark classified-file visual treatment and phase wording.

That combination can be a real differentiator in reliability, privacy, and polish. It should be described as a **distinct implementation or product experience**, not as a newly invented party-game mechanic.

## Search scope and date

Search conducted on **2026-09-08**. Query families covered official Spyfall and Spyfall 2 rules, two-spy and 12-player configurations, single-device/pass-the-phone implementations, online browser rooms, app-store listings, timers, accusations, final location guesses, replay, history, and open-source repositories. Sources were checked as first-party publisher/developer pages, official rule PDFs, app-store listings, live product pages, or repositories owned by the implementation author where available.

The principal sources are linked in the comparison table. The most important anchors are [Hobby World’s Spyfall page](https://hobbyworldint.com/portfolio-item/spyfall/), [Hobby World’s Spyfall 2 page](https://hobbyworldint.com/portfolio-item/spyfall-2/), the [official Spyfall 2 rules PDF](https://hobbyworldint.com/wp-content/uploads/2019/12/SPYFALL2_rules_ENG_curves.pdf), [SpyHunt on Google Play](https://play.google.com/store/apps/details?id=com.apicellaj.android.spyhunt), [SpyFall: Find the Spy on the App Store](https://apps.apple.com/us/app/spyfall-find-the-spy/id6743214724), [thespyfall.com](https://thespyfall.com/how-to-play), [Spyfall X](https://spyfallx.com/about.html), and [adrianocola/spyfall on GitHub](https://github.com/adrianocola/spyfall).

## Limitations

- The repository documents a standalone Vercel deployment but does not record a production hostname, so this conclusion is based on the checkout’s documented and implemented behavior rather than a live production black-box test.
- Search results are evidence that comparable products are publicly available, not proof that every similar implementation was found.
- Web pages can change, disappear, or use marketing language that is broader than the actual product.
- This did not compare source code line-by-line, establish dates for every web clone, or search patent/copyright/trademark registries.
- “Novel” in a product sense and “legally protectable” are different questions. Consult an intellectual-property lawyer if you need a legal clearance or want to protect a specific name, artwork, codebase, or novel rules expression.
