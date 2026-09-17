# Spy in the Room copy review

Date: 2026-09-15

## Decision

Use a sly, low-key host voice: short instructions, everyday words, light tension, and occasional dry humor. The copy should sound like something a friend would say while handing over a phone, not like a product specification or a tutorial generated from UI labels.

Privacy, accessibility, and irreversible-action warnings stay literal and explicit. The playful voice belongs around those instructions, never in place of them.

## Principles applied

- Lead with the player’s next move: “Add your players”, “Peek, then pass”, “Ask your questions”, and “Lock it in”.
- Prefer concrete social verbs over abstract product language: “Talk it out”, “Watch who sounds lost”, and “Pick wrong and the spies take the round”.
- Keep instructions short, scannable, and in the second person. Use contractions where they sound natural.
- Give each phase a memorable spoken cue: “Get ready”, “Peek & pass”, “Ask around”, “Call it”, and “One last shot”.
- Make system states useful without exposing implementation details: “No connection. Reconnect to keep playing.” and “The game changed in another tab. Loading the latest version.”
- Keep choices and confirmations unambiguous: the room still has to agree, guesses still cannot be changed, and deletion still says it cannot be undone.
- Keep the rules available on demand and teach the flow in the order players experience it: add names, look at the card, ask questions, vote, then guess.

## Before → after highlights

| Previous copy | Revised copy | Reason |
| --- | --- | --- |
| Classified party game | A pass-the-phone game | Names the actual social format instead of using a generic label |
| Find the one who does not belong. | Someone in this room is lying. | Creates immediate tension and sounds spoken |
| Set the roster | Add your players | Uses the player’s action and removes product jargon |
| Round in progress | The round is live | Shorter, warmer status language |
| The timer will stop and the group will move to the final vote. | The clock stops here. Then the room votes. | More rhythmic and easier to scan |
| Could not reach the game server. | We can’t reach the game right now. | Human, direct, and still clear |

## Research notes

Apple’s guidance on [writing for interfaces](https://developer.apple.com/design/human-interface-guidelines/writing) emphasizes a defined voice, action-oriented labels, consistent terminology, and error messages that explain the problem without blaming the player. Its [onboarding guidance](https://developer.apple.com/design/human-interface-guidelines/onboarding) and [games guidance](https://developer.apple.com/design/human-interface-guidelines/designing-for-games) support fast, optional instruction and teaching through play.

Microsoft’s [Windows writing style](https://learn.microsoft.com/en-us/windows/apps/design/style/writing-style) and [simple, human brand voice](https://learn.microsoft.com/en-us/style-guide/brand-voice-above-all-simple-human) guidance favor warm, relaxed, crisp copy: active voice, short text, second person, contractions, and concise action labels. It also recommends clear dialog call-and-response and next steps for errors.

Google’s [Material writing guidance](https://m1.material.io/style/writing.html) reinforces simple, direct, concise copy, consistent verbs, sentence case, and revealing detail only when it is needed.

Jackbox’s [how-to-play page](https://www.jackboxgames.com/how-to-play) is a useful genre reference: setup is presented as a short sequence of player actions, with the host and players told exactly what to do next.

## Scope and follow-up

This pass changes player-facing copy in the shell, phase view, controller announcements, API network errors, and offline fallback. It does not change game rules, scoring, privacy behavior, or API contracts. Because the shell assets are precached, the service-worker cache was bumped from v10 to v11.

The “humanizer” part of the review was handled as a direct editorial pass in the repository. No third-party copy service or package was added, so player names, secrets, and game state never leave the app for copy processing.
