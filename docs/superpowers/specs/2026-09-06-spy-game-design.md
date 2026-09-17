# Spy Game Design

**Date:** 2026-09-06  
**Status:** Approved for implementation

## Design read

Reading this as: a same-device party game for a small group of friends, with a playful classified-file language, leaning toward a dark utility surface with warm amber accents and restrained motion.

The visual dials are `DESIGN_VARIANCE: 6`, `MOTION_INTENSITY: 4`, and `VISUAL_DENSITY: 5`. The game needs character and tension, but the controls must stay obvious when several people are passing one phone around.

## Goal

Build a no-build browser game that lets 4 to 12 people play a classic Spy location round on one shared device without accounts, network access, or hidden setup.

## Game rules

- The setup accepts 4 to 12 non-empty player names and prevents duplicate names after trimming.
- The app chooses one location from a local deck of at least 20 locations.
- Groups of 4 to 8 receive one spy. Groups of 9 to 12 receive two spies.
- Non-spies see the location and a short category label. Spies see only that they are a spy.
- Players pass the device one person at a time. A player must tap to reveal their card, then tap to hide it before passing the device onward.
- The host starts a configurable round timer of 3, 5, or 8 minutes after every card has been shown.
- During the round, the host may end the timer and open the accusation flow. When the timer reaches zero, the accusation flow opens automatically.
- The host selects one suspect. If the suspect is not a spy, the spies win immediately.
- If the suspect is a spy, the selected spy gets one chance to pick the location from the full location deck. A correct guess lets the spies win; an incorrect guess lets the group win.
- The result screen states the winning side, reveals the location and all spy names, and offers a replay with the same roster or a fresh setup.

## State machine

The browser state has five user-visible phases:

1. `setup`: roster, timer length, and start action.
2. `reveal`: private card for each player, with explicit hide and next actions.
3. `round`: timer, reminder of the rules, and end-round action.
4. `accuse`: suspect selection, followed by the spy guess when the suspect is a spy.
5. `result`: winner, revealed answers, and replay actions.

Every phase renders from one state object and has one primary action. Invalid actions are ignored or prevented at the control boundary, not left to produce a blank screen.

## Interface and visual system

- Use a single dark theme with off-black navy surfaces, warm amber as the only accent, and muted blue-gray supporting text.
- Use system sans for display copy and a monospace stack for labels, timer values, and classified metadata. No external font or image request is required.
- Use one consistent soft radius scale for the main cards and fields, with full-round controls only for compact status elements.
- Build the setup page as a left-aligned content column paired with an asymmetric dossier panel on wider screens. Collapse to one column below 768px.
- Use a top status row for phase and player count, a focused central panel for the current action, and a small rules strip rather than a dense dashboard.
- Use motion only for phase transitions and action feedback. Honor `prefers-reduced-motion` by disabling transforms and keeping opacity changes instant.
- Keep all visible copy plain and grammatical. Do not use em-dashes in the page copy.

## Accessibility and device behavior

- Use semantic headings, labels, buttons, lists, and form controls.
- Every input has a visible label, every icon-only control has an accessible name, and every dynamic phase change is announced through an `aria-live` region.
- Preserve visible `:focus-visible` rings and a logical tab order.
- Never rely on color alone to communicate spy, group, or winner status; pair color with explicit text and labels.
- The layout must remain usable at 320px wide and at desktop widths of 768px, 1024px, and 1440px.
- Use `min-height: 100dvh` for the main shell, not `100vh`.
- Tap targets are at least 44px tall. Primary buttons do not wrap at desktop widths.

## Technical architecture

- `index.html` contains the semantic shell and local script/style references. It can be served from the project folder with any static file server.
- `styles.css` owns the design tokens, responsive layout, phase-specific components, and reduced-motion behavior.
- `game-logic.js` owns pure, browser-independent rules: validation, spy count, shuffling, deal generation, timer formatting, accusation outcome, and spy-guess outcome. It exposes the same functions through `module.exports` for Node tests and `window.SpyGameLogic` for the browser.
- `game.js` owns DOM rendering, event handlers, timer scheduling, focus movement, and calls into `SpyGameLogic`. It does not duplicate rule decisions.
- `test/game-logic.test.js` uses Node's built-in test runner and covers the pure rules without third-party dependencies.
- `README.md` explains how to open the game and the five-step rules in a few lines.

## Acceptance criteria

- A fresh page shows setup with an actionable empty-state message and a disabled start button until four valid names exist.
- A valid roster can start a round and reach every phase without a page reload.
- Each player sees exactly one private role assignment, and the final result confirms the same assignment.
- The timer counts down, can be ended early, opens accusation on expiry, and does not create duplicate intervals after phase changes.
- Wrong accusations, correct spy guesses, and incorrect spy guesses each lead to the correct winner.
- Replay preserves the roster, selects a fresh location, and resets all phase and timer state.
- Node tests pass, the browser console is clean, and the responsive page is visually usable on a narrow viewport.
