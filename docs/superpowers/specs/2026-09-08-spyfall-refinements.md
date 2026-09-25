# Spyfall-inspired refinement rules

This document is the rules contract for the polished local variant of Spy. It
keeps the pass-the-phone flow and server-held secrets while making the
two-spy, accusation, and session loops explicit.

## Core rules

- Four to eight players receive one spy.
- Nine to twelve players receive two spies.
- In a two-spy round, each spy privately sees the other spy's name.

- Built-in location rounds also give each non-spy a private role prompt.
  Prompts do not repeat until that location’s deck is exhausted; only then
  may they cycle. Spies receive no location role.
- Custom-secret rounds have no location roles. Before the result, general
  snapshots omit all roles; each non-spy’s role appears only on their private
  card. The result identifies non-spy roles and labels spies as “Spy”.
- Answer in character if you like; don’t say your role outright.
- The question phase is verbal. Ask one question, let the answerer ask next,
  do not ask follow-up questions, and do not immediately ask the previous
  questioner.
- The group may end the timer early, call a verbal accusation vote, and must
  confirm unanimous agreement in the pass-phone interface before submitting
  the suspect.
- A wrong accusation gives the spies the round.
- A correctly accused spy or a voluntary spy call opens the guess phase.
- Every spy gets one location guess in that phase. The first guesser is the
  accused spy or the spy who called for the guess, followed by the other spy.
- At least one correct guess gives the round to the spies. If every guess is
  wrong, the group wins.
- A round awards two points to each member of the winning team. A spy win from
  a correct location guess awards three points to each spy.

## Session rules

- A standard game samples one fixed, alphabetized board of 24 locations from the built-in deck.
- Deck-mode rounds use an unused location from that board; if all 24 are used, the board becomes available again.
- The board is public, and spies choose their deck-mode guess from it. Custom-secret rounds keep free-text guesses and have no board; legacy games without a stored board use the full deck.
- After each result, the interface shows round points and the cumulative
  leaderboard before offering the next round.
- At the end of round five, the highest cumulative score wins. Ties are shown
  as ties and the completed history remains available.

## Deliberate scope

Voting is confirmed by the group verbally because this is a shared-device
game and there is no individual player authentication. The server still
authoritatively checks phases, player IDs, spy assignments, guess order,
revisions, and idempotency keys. Custom decks, rotating leadership,
online rooms, and publishing are later extensions.
