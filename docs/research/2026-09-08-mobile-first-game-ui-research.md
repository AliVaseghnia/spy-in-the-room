# Mobile-first game UI research: Spy in the Room

**Research date:** 2026-09-08  
**Scope:** How this same-device, pass-the-phone hidden-role game should be represented on mobile first, with desktop as a secondary layout. Sources are primarily official platform/accessibility guidance and first-party descriptions of comparable games. This is a product and interaction-design brief, not a usability study or a legal/compliance certification.

## Executive summary

The central design constraint is not simply “small screens.” It is **shared-device privacy under a social handoff**: one phone moves from person to person, one person may see secret information, and the group must always know whose turn/state it is. The mobile experience should therefore behave like a focused tabletop game surface, not like a responsive document page.

The strongest evidence-backed direction is:

- Make the active game phase own the mobile viewport. Keep setup and saved-game management scrollable, but hide or collapse marketing copy, persistent dossier metadata, and unrelated history while a round is in progress.
- Present one dominant state and one dominant action at a time. Use an explicit privacy handoff, a deliberate reveal, and a deliberate hide/pass action; do not auto-advance after showing a secret.
- Use large, inset touch targets, visible press/focus states, readable text, and non-color status cues. Apple’s default iOS/iPadOS control size is 44×44 pt; Android guidance uses 48×48 dp; the web target minimum is 24×24 CSS px, while 44×44 CSS px is the enhanced WCAG target. The practical product target for the game’s primary actions is therefore approximately 48 CSS px, with spacing between adjacent targets. See [Apple Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility), [Android accessibility](https://developer.android.com/guide/topics/ui/accessibility/views/apps-views), and [WCAG Target Size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html).
- Treat the round timer as a game mechanic, not as a constantly announced status message. Keep the timer visually prominent, announce meaningful threshold changes rather than every tick, and provide an intentional way to end the round. WCAG’s timing guidance has exceptions for essential real-time activity, but the handoff/read-time portions of the experience should not become avoidably time-pressured. See [WCAG Timing Adjustable](https://www.w3.org/WAI/WCAG22/Understanding/timing-adjustable.html).
- Use one column at compact widths and a supporting pane only when the window is large enough. On desktop, preserve the play surface as the primary pane and use extra space for rules, score, or history; do not stretch small controls across a very wide screen. This follows the responsive patterns in [Material’s canonical layouts](https://m3.material.io/foundations/layout/canonical-examples/overview) and [Android adaptive-app guidance](https://developer.android.com/develop/adaptive-apps/guides/adaptive-dos-and-donts?hl=en).
- Keep the existing dark classified/spy identity, but increase the physicality of the play surface: a card back, a clear “private” state, phase-specific accent treatment, and restrained tactile feedback. These visual recommendations are **design inferences** from the game’s privacy/social topology, not rules stated by a platform guideline.

The resulting model is a responsive **game shell**:

```text
mobile:  phase HUD → one primary game object → one short instruction → action dock
desktop: phase HUD → centered play surface       + optional supporting pane
```

## Current product and interaction model

The project is already a same-device game for 4–12 named players. The current rules/specification defines one spy for 4–8 players and two spies for 9–12, a verbal question phase, accusation, a spy location-guess phase, five-round scoring, and completed-round history. The [project README](../../README.md) and [Spyfall-inspired refinement rules](../superpowers/specs/2026-09-08-spyfall-refinements.md) are the source of truth for the game contract.

| Phase | Current player goal | Current representation | Mobile design consequence |
| --- | --- | --- | --- |
| Setup / resume | Create a roster, choose a timer, or resume a saved game | Player-name fields, 3/5/8-minute choice, saved-game list, start action | Setup can scroll, but the first screen should establish the game and make the start action obvious. Do not carry setup metadata into active play. |
| Private reveal | Give the phone to the named player and let only that player see one card | “Pass the phone to …”, privacy instruction, neutral card, explicit reveal, then hide/pass | This is the highest-risk phase. It needs a dedicated privacy screen, a large handoff state, deliberate reveal/hide, and no secret content in shared chrome. |
| Investigation | Ask and answer questions while the clock runs | Timer, rule strip, question protocol, end-round action, optional spy-call panel | The round should read as a board/timer state rather than a long instruction page. Keep the primary action and timer in thumb reach. |
| Accusation | Agree verbally, select a suspect, and confirm the consequence | Inline suspect list and unanimous confirmation | Use full-width player tiles and a confirmation surface that clearly says what submitting means. The selected suspect must remain visible in the confirmation state. |
| Spy guess | Let the ordered spy(s) choose a location | Current guesser and a location-choice list | Use a visually scannable card grid, with clear current-guesser context and no accidental submission. |
| Result | Understand who won, why, and what happens next | Winner/location/spy information, points, leaderboard, replay/new/delete, history | Establish outcome first, score second, next action third. Move detailed history behind a secondary disclosure on a phone. |

The implementation already has several useful foundations:

- It uses `100dvh`-aware layout behavior, a 320px minimum, a single-column breakpoint, mostly 44px controls, visible `:focus-visible` styling, a neutral `aria-live` announcement region, and a reduced-motion media query.
- `game.js` clears the visible secret card on hide and during state transitions, and the server/API model returns only the current private card rather than placing all assignments in the general snapshot. See the [game client](../../game.js), [server game service](../../server/game-service.js), and [Phase 2 design](../superpowers/specs/2026-09-07-spy-game-phase-2-design.md).
- The current shell keeps a substantial introduction, a persistent active-phase card, a dossier aside, and a footer around the live game. At narrow widths this makes the active game feel embedded in a page rather than occupying the player’s attention. That is a local inspection finding, not a platform requirement.
- Current implementation details worth carrying into redesign work include native buttons/forms, server-authoritative deadlines, refresh/resume behavior, and explicit secret clearing. The redesign should preserve those semantics while changing the visual hierarchy.

## What the primary sources say

### Touch, input, and accessibility

[Apple’s Accessibility HIG](https://developer.apple.com/design/human-interface-guidelines/accessibility) says controls should have a default 44×44 pt hit region on iOS/iPadOS, with 28×28 pt as a minimum in its sizing discussion, and emphasizes spacing, simple gestures, alternatives to gestures, and visual indicators. [Apple’s Buttons HIG](https://developer.apple.com/design/human-interface-guidelines/buttons) adds that buttons need a clear press state and that the hit region should be at least 44×44 pt. [Apple’s Game Controls HIG](https://developer.apple.com/design/human-interface-guidelines/game-controls) recommends placing frequently used controls near thumbs and inside safe areas, making direct touch feel responsive, and hiding irrelevant controls.

[Android’s accessibility guidance](https://developer.android.com/guide/topics/ui/accessibility/views/apps-views) uses a 48×48 dp minimum touch/focus target. [Material’s metrics guidance](https://m1.material.io/layout/metrics-keylines.html) also uses 48×48 dp targets and generally 8 dp spacing. [web.dev’s accessible tap-target guidance](https://web.dev/articles/accessible-tap-targets?hl=en) recommends around 48 device-independent pixels and roughly 8px between targets, and says to use pointer capability rather than viewport width when adapting for touch.

[WCAG 2.2 Target Size (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) sets the AA minimum at 24×24 CSS px subject to spacing/equivalent-target exceptions; [Target Size (Enhanced)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced.html) gives 44×44 CSS px as the AAA level and calls out frequent, sequential, hard-to-undo, and edge-located controls as cases where larger targets help. The platform numbers are not interchangeable units, so the recommendation for this web game is a product decision: make primary mobile controls at least 44px high and preferably about 48px, with an 8–12px gap where choices sit next to each other.

### Responsive layout and form factors

[Material’s responsive UI guidance](https://m1.material.io/layout/responsive-ui.html) describes compact layouts as a single hierarchy and larger layouts as opportunities to show summary plus detail. [Material 3 canonical layouts](https://m3.material.io/foundations/layout/canonical-examples/overview) documents list-detail and supporting-pane patterns that separate primary and secondary content across compact, medium, and expanded window sizes. [Android’s adaptive-app dos and don’ts](https://developer.android.com/develop/adaptive-apps/guides/adaptive-dos-and-donts?hl=en) recommends window-size-class decisions, pane layouts, keyboard/mouse support on larger surfaces, and avoiding controls that simply stretch across the full window.

[Apple’s Layout HIG](https://developer.apple.com/design/human-interface-guidelines/layout) emphasizes adaptive layouts, safe areas, logical grouping, and progressive disclosure. It specifically cautions against placing buttons flush against viewport edges and recommends respecting insets. On the web, [MDN’s `env()` documentation](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/env) defines `safe-area-inset-*` variables for notches and system UI; [web.dev’s PWA app-design guidance](https://web.dev/learn/pwa/app-design) shows how to use safe-area insets for bottom controls; and [Chrome’s edge-to-edge guidance](https://developer.chrome.com/docs/css-ui/edge-to-edge) warns that bottom controls can be obscured by the gesture bar without insets.

[WCAG Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow) requires content to reflow at 320 CSS px without two-dimensional scrolling and warns that fixed/sticky content must not obscure content or focus. [WCAG Resize Text](https://www.w3.org/WAI/WCAG22/Understanding/resize-text.html) requires text to remain usable at 200% resize. [WCAG Orientation](https://www.w3.org/WAI/WCAG22/Understanding/orientation.html) says not to lock users to one orientation unless a specific orientation is essential. [MDN viewport guidance](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/meta/name/viewport) and [MDN CSS length guidance](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/length) support using the viewport meta configuration and dynamic viewport units deliberately rather than treating every viewport as a static rectangle.

### Game-specific interaction and feedback

[Apple’s Designing for Games HIG](https://developer.apple.com/design/human-interface-guidelines/designing-for-games) distinguishes touch interaction on iPhone from keyboard/mouse interaction on Mac, recommends teaching through play, and says defaults should be good while important information remains perceivable. [Apple’s Onboarding HIG](https://developer.apple.com/design/human-interface-guidelines/onboarding) recommends fast, optional onboarding and teaching in context rather than requiring memorization before play. [Apple’s Feedback HIG](https://developer.apple.com/design/human-interface-guidelines/feedback) frames feedback as communicating status, success/failure, warnings, or opportunities.

[WCAG Status Messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html) requires programmatic status for changes that do not move focus, while cautioning against overly chatty live regions. [WCAG Focus Visible](https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html) requires a visible keyboard focus indicator. [WCAG Keyboard](https://www.w3.org/WAI/WCAG22/Understanding/keyboard.html) requires functionality to be operable from a keyboard; native buttons and form controls make this substantially easier. [WCAG Pointer Gestures](https://www.w3.org/WAI/WCAG22/Understanding/pointer-gestures.html) requires a single-pointer alternative for multipoint or path-based gestures.

[MDN’s `<dialog>` documentation](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/dialog) describes native modal behavior, including focusing a control, Escape handling, and explicit close behavior. [MDN’s reduced-motion guidance](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/prefers-reduced-motion) documents the media query that lets a product reduce or remove non-essential motion. [Xbox Accessibility Guideline 112](https://learn.microsoft.com/en-us/xbox/accessibility/xbox-accessibility-guidelines/112), [XAG 113](https://learn.microsoft.com/en-us/xbox/accessibility/xbox-accessibility-guidelines/113), and [XAG 114](https://learn.microsoft.com/en-us/xbox/accessibility/xbox-accessibility-guidelines/114) provide authoritative game-specific guidance on logical navigation, modal focus, visible focus, and context when screens or controls change. These are game UX best practices, not a substitute for WCAG testing.

### Comparable same-device products

The product sources below are evidence of established interaction patterns, not independent usability research or platform standards.

- [TheSpyfall’s how-to-play page](https://thespyfall.com/how-to-play) describes local one-phone play: enter player names, pass the phone, privately reveal a role, hide it, and pass it on before using a timer and vote.
- [Spyfall.co’s how-to-play page](https://spyfall.co/app/how-to-play) describes the same location/spy/question/vote loop with timed rounds and multiple rounds.
- The developer-provided [Spy: Imposter Party Game App Store listing](https://apps.apple.com/us/app/spy-imposter-party-game/id6791315339) advertises 3–12 players on one phone, hold-to-reveal/private roles, instant hiding, and a privacy screen if the app is minimized. These are claims made by the developer listing, not independently verified behavior.
- The developer-provided [SpyFall: Find the Spy Google Play listing](https://play.google.com/store/apps/details?hl=en&id=com.tillo.spyfall) advertises one-device 3–12-player play, role viewing, a timer with audio alerts, themes/languages, and offline play.
- The official [Pass the Phone game page](https://passthephone.app/en/pass-the-phone-game/) is an adjacent, non-secret party-game example. It foregrounds a one-device sequence of prompt, handoff, response, and summary; this supports the importance of making the handoff loop explicit, but it does not establish the right treatment for secret roles.
- [Jackbox’s official how-to-play page](https://www.jackboxgames.com/how-to-play) is a useful topology contrast: it uses a visible host screen and phones as individual controllers, whereas this project uses one shared phone and must protect private information on that same surface.

The comparable products support the product inference that “pass phone → private action → clear completion state → pass phone” should be a first-class loop. They do not prove that one exact card layout, timer treatment, or reveal gesture is universally best.

## Design implications for this game

The following recommendations are labeled **Inference** where they extend the source guidance to this particular game.

### 1. The active phase should become the app surface

**Inference from the same-device topology and the responsive-layout guidance:** Once a game starts, the active phase should replace the introductory marketing block, dossier rail, and persistent footer on compact screens. The phone should show a small phase/round HUD, the current game object, a short instruction, and an action dock. Setup, resume, help, and history can remain normal scrollable views.

Recommended mobile shell:

```text
safe-area-aware top HUD
  game mark · round 2/5 · phase label

main play surface
  one dominant card / timer / player list / outcome
  one short instruction or rule

bottom action dock
  primary action
  secondary action or quiet “more” disclosure
```

Use `min-height: 100dvh` for the active shell, add `env(safe-area-inset-bottom)` to any sticky/fixed bottom dock, and give scrollable content enough bottom padding that focus and the last choice are not hidden behind it. This is an implementation recommendation based on [MDN safe-area insets](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/env), [web.dev app design](https://web.dev/learn/pwa/app-design), and [WCAG Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow).

### 2. Reveal needs a privacy-first state machine

**Inference:** The reveal phase should not look like an ordinary content card. It should have three visibly distinct states:

1. **Handoff:** “Pass to ADA” / “Only ADA should look” / “Ready?” with a neutral card back and a single “Reveal card” action.
2. **Private view:** the location or spy role dominates the card; any supporting text is secondary; the action is “Hide card and pass.”
3. **Completed handoff:** the secret is removed from the DOM/display and the next named player’s handoff begins.

The reveal action should be explicit and reversible only through the deliberate hide/pass action. Do not rely on a swipe, hold, hover, or an invisible timeout. A hold-to-reveal pattern exists in a developer listing, but the platform guidance favors simple gestures with alternatives and visible states; for a browser game played by a mixed group, a regular button is the safer baseline.

Shared-device privacy is a product-specific requirement rather than a WCAG rule. **Inference:** add a clear/obscure response when the document becomes hidden or loses focus, and avoid rendering a secret in a persistent header, browser-visible title, or background surface. The current client already clears the visible card on hide and refresh transitions; retain that behavior and consider a deliberate privacy overlay before the next render after a background/app-switch event. Verify this behavior on iOS Safari, Android Chrome, and installed standalone mode.

### 3. Round mode should be a timer board, not a prose page

**Inference:** During investigation, the timer should be the largest element or a strong top-level board signal, accompanied by one short rule strip such as “Ask one question. The answerer chooses next.” The full protocol can be a collapsible “How this round works” panel. Keep “End round” as the primary action and “Spy: call for a guess” as a secondary action in the bottom dock.

The timer is core real-time gameplay, so [WCAG Timing Adjustable](https://www.w3.org/WAI/WCAG22/Understanding/timing-adjustable.html) does not imply that the round itself must be made pauseable. It does imply a useful distinction: do not use the same hard timer for reading the handoff instructions or confirming a destructive action. Avoid an `aria-live` update on every second; announce start, meaningful warning thresholds, expiry, and authoritative state changes instead. Use a visible label and an icon/text treatment for urgency so color is not the only signal, consistent with [Apple’s game guidance](https://developer.apple.com/design/human-interface-guidelines/designing-for-games) and [WCAG contrast guidance](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html).

### 4. Accusation should use player tiles and a consequence-confirmation surface

**Inference:** A compact screen should show one full-width tile per player, with a large name, selected state, and clear focus/press feedback. After selection, use a native `<dialog>` or an equivalent accessible modal/sheet with focus contained in the confirmation state:

```text
Accuse ADA?
If this is wrong, the spies win the round.
[Cancel] [Confirm accusation]
```

The confirmation text must match the actual rules. It should keep the selected name visible and return focus predictably after cancellation. This follows [MDN dialog behavior](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/dialog), [XAG 113 focus guidance](https://learn.microsoft.com/en-us/xbox/accessibility/xbox-accessibility-guidelines/113), and [XAG 115 destructive-action guidance](https://learn.microsoft.com/en-us/xbox/accessibility/xbox-accessibility-guidelines/115). The “verbal unanimous” nature of the project’s rule should remain explicit; the interface is confirming the group’s spoken agreement, not pretending to authenticate each player.

### 5. Guess mode should make the current guesser and choices unambiguous

**Inference:** Show “ADA is guessing” or the current player’s name above the location choices, and use a card grid rather than a dense text list. At compact widths, use two columns if each tile remains comfortably tappable; collapse to one column when text or user scaling makes two columns unsafe. On expanded desktop, use three or four columns inside a bounded play surface. A selection should not silently submit; show a selected state and use an explicit confirm action if a wrong guess resolves the round immediately.

### 6. Results should be a short, celebratory hierarchy

**Inference:** Order the result view as: winning team/outcome → location and spy reveal → round points → cumulative leaderboard → next action. Keep replay/new game/delete as clearly separated actions, and place completed history behind a disclosure or secondary pane on mobile. On the final session round, announce the overall winner and tie state before exposing the full history.

This is consistent with [Apple Feedback HIG](https://developer.apple.com/design/human-interface-guidelines/feedback), which treats feedback as a communication of outcome and status, and with [Apple Onboarding HIG](https://developer.apple.com/design/human-interface-guidelines/onboarding), which favors contextual, optional guidance over front-loaded explanation. The celebratory language and visual treatment are product choices, not platform requirements; motion must honor `prefers-reduced-motion`.

## Prioritized design brief

### P0 — required for a credible mobile game surface

- Make active play a full-height, single-phase shell at compact widths. Remove or collapse the intro, dossier, footer, and unrelated history during reveal, round, accusation, guess, and result.
- Implement the three-state privacy handoff: named handoff → private reveal → clear-and-pass. Keep secrets out of shared chrome and clear/obscure on hide, phase transition, and document background/visibility changes.
- Give primary buttons and player/location choices approximately 48px touch height, with at least 8px spacing; preserve visible keyboard focus and a non-color selected state. Keep buttons inset from viewport edges and pad any fixed bottom dock for safe areas.
- Reflow cleanly at 320 CSS px and at 200% text size without horizontal scrolling or sticky controls covering focused content. Test both portrait and landscape rather than locking orientation.
- Keep one dominant action per phase, use native buttons/forms, and ensure every gesture has a simple pointer/keyboard equivalent.
- Keep the core timer visible, but limit live announcements to start, warning, expiry, and authoritative transitions. Do not impose the round timer on private reading or confirmation copy.

### P1 — important for polish and clarity

- Add a compact top HUD with round number, phase label, and a non-secret connection/resume status. Use a small brand mark rather than the full marketing heading while active.
- Use phase-specific surfaces: tactile card back/reveal card, timer board, player tiles, location grid, and result card. Keep a consistent grid, type scale, focus ring, and action dock across phases.
- Add a clear button press state and reduced-motion alternatives for reveal, phase changes, and result feedback. If audio/haptic feedback is added, make it progressive enhancement and user-controllable.
- Use an accessible accusation confirmation dialog/sheet with consequence text, focus management, Escape/cancel behavior, and predictable return focus.
- Make the current guesser, selection state, and irreversible action explicit in guess mode.
- Check text contrast, 200% scaling, long player names, translated strings, screen-reader labels, and keyboard order. Do not make urgency or winning state depend on hue alone.
- On desktop/expanded tablet, introduce a supporting pane for rules, score, or history only when it does not compete with the primary play surface.

### P2 — optional follow-up work

- Add an opt-in “keep screen awake” affordance for the investigation phase if browser support and user expectations justify it; document the fallback when it is unavailable.
- Add an optional privacy shield that obscures the page when the document becomes hidden or the phone is tilted/covered, while keeping a clear recovery action.
- Add an accessibility/preferences surface for larger text, higher contrast, reduced motion, and sound/haptic choices, without duplicating OS settings unnecessarily.
- Consider standalone/PWA installation. [web.dev’s app-like PWA guidance](https://web.dev/articles/app-like-pwas?hl=en) explains how a manifest and standalone display can remove browser UI, but this is a packaging enhancement, not a substitute for a focused active-game layout.
- Add a short first-play contextual tip or a one-round practice handoff. Keep it skippable and avoid blocking the group from starting.

## Desktop as the secondary layout

Desktop should use the same state hierarchy and copy, with more room for context rather than a different game. A reasonable expanded layout is:

```text
┌─────────────────────────────────────────────────────────────┐
│ compact phase / round HUD                                   │
├──────────────────────────────┬──────────────────────────────┤
│                              │                              │
│ primary play surface         │ supporting pane              │
│ bounded card/timer/choices   │ rules, score, history         │
│                              │                              │
├──────────────────────────────┴──────────────────────────────┤
│ primary action dock / keyboard-accessible actions            │
└─────────────────────────────────────────────────────────────┘
```

**Inference:** Center the primary play surface at roughly 640–720px wide inside a max-width container around 1100–1200px, then give the supporting pane the remaining space. These dimensions are starting points for implementation and testing, not values prescribed by the cited guidelines. The pane should collapse below the relevant window-size threshold; at medium/tablet widths it can become a drawer or a secondary tab; at compact widths it should be hidden behind “Rules,” “Score,” or “History.”

Support keyboard/mouse input and visible focus on desktop. Do not require hover to discover an action. Avoid rendering a private card in the supporting pane while another player may be looking at the shared monitor; the same privacy rules apply across form factors. Landscape tablet can use a two-pane treatment, but the single-pane mobile flow remains the canonical interaction order.

## Validation checklist

### Device and viewport matrix

- 320px CSS width, 390px phone portrait, 430px large phone portrait.
- 768px tablet/compact desktop, 1024px landscape tablet, 1440px desktop.
- iOS Safari and Android Chrome with browser chrome expanded/collapsed.
- Installed standalone/PWA mode if enabled.
- Portrait and landscape at each relevant compact/medium breakpoint.

### Privacy and state transitions

- Every player sees a named handoff before the secret can be revealed.
- The secret is absent before reveal, visible only after deliberate reveal, and absent after hide/pass.
- Back, refresh, focus loss, tab/app switch, and network retry cannot leave a stale secret in a shared visible state.
- A hidden document or app-switcher preview does not expose the current secret; if the browser cannot guarantee this, the UI provides a clear obscuring strategy and the limitation is documented.
- Two-spy rounds clearly identify the current guesser and preserve the defined guess order.

### Accessibility and interaction

- Primary actions and choice tiles are at least the intended target size and have adequate gaps.
- All actions work with keyboard and a single pointer; no hover-only or hold-only requirement.
- Focus is visible, modal focus is contained, and cancel returns focus to the initiating control.
- Screen-reader status announcements cover phase changes and meaningful timer state without announcing every tick.
- Content reflows at 320px and 200% text size without two-dimensional scrolling or obscured focus.
- Color is supplemented by text, shape, icon, selection outline, or position; text meets contrast requirements.
- `prefers-reduced-motion` removes non-essential flips, shakes, and animated transitions.

### Game comprehension and social flow

- A first-time player can tell whose turn/handoff it is without reading the full rules.
- The person holding the phone knows whether they should reveal, hide/pass, choose, confirm, or wait.
- The group can find the timer and end-round action without scrolling through instructions.
- Accusation consequences are visible before submission.
- Result hierarchy makes winner, reason, points, and next action clear in that order.

## Source notes and limitations

The platform and accessibility sources are official Apple, Android/Material, W3C, web.dev, MDN, Microsoft Xbox Accessibility Guidelines, and Chrome documentation. Comparable-game pages are first-party product pages or developer-provided app listings; they document advertised flows rather than independently measured usability. Product observations in this note are explicitly labeled where they are inferences from the project’s shared-device/privacy topology.

This research did not run moderated user tests, eye tracking, accessibility audits, or a statistically meaningful comparison of competing games. It did not establish that any one competitor’s UI is effective for all players. It also does not settle browser-specific privacy guarantees for OS app-switcher thumbnails; that behavior should be tested on target devices and treated as an implementation risk. The existing project’s rules, privacy architecture, and current DOM behavior were inspected locally; no production code was changed for this research note.

