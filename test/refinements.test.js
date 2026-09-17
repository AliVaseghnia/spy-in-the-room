const assert = require('node:assert/strict');
const test = require('node:test');

const {
  dealRound,
  calculateRoundPoints,
  LOCATION_DECK
} = require('../game-logic.js');
const { MemoryStore } = require('../server/memory-store.js');
const { createSession } = require('../server/session.js');
const {
  applyCardAction,
  applyGameAction,
  createGame
} = require('../server/game-service.js');

const ENV = {
  NODE_ENV: 'test',
  APP_ORIGIN: 'http://localhost:3000',
  SESSION_SECRET: 'refinement-session-secret'
};

function nowAt(value = '2026-09-08T12:00:00.000Z') {
  return new Date(value);
}

async function createGameWithRevealedCards(players, { secretMode, customSecret } = {}) {
  const store = new MemoryStore();
  const session = await createSession({ store, env: ENV, now: nowAt() });
  const created = await createGame({
    store,
    sessionId: session.session.id,
    players,
    timerSeconds: 300,
    secretMode,
    customSecret,
    random: () => 0,
    now: nowAt()
  });
  let revision = created.revision;
  const cards = [];

  for (let index = 0; index < players.length; index += 1) {
    const revealed = await applyCardAction({
      store,
      sessionId: session.session.id,
      gameId: created.gameId,
      action: 'reveal',
      expectedRevision: revision,
      idempotencyKey: `refinement-reveal-${index}`,
      now: nowAt()
    });
    cards.push(revealed.data.card);
    const hidden = await applyCardAction({
      store,
      sessionId: session.session.id,
      gameId: created.gameId,
      action: 'hide',
      expectedRevision: revision,
      idempotencyKey: `refinement-hide-${index}`,
      now: nowAt()
    });
    revision = hidden.meta.revision;
  }

  return { store, session, created, revision, cards };
}

async function revealNextRound(game) {
  let revision = game.revision;
  const players = game.store.games.get(game.created.gameId).players;
  for (let index = 0; index < players.length; index += 1) {
    await applyCardAction({
      store: game.store,
      sessionId: game.session.session.id,
      gameId: game.created.gameId,
      action: 'reveal',
      expectedRevision: revision,
      idempotencyKey: `refinement-next-reveal-${game.store.games.get(game.created.gameId).currentRoundNumber}-${index}`,
      now: nowAt()
    });
    const hidden = await applyCardAction({
      store: game.store,
      sessionId: game.session.session.id,
      gameId: game.created.gameId,
      action: 'hide',
      expectedRevision: revision,
      idempotencyKey: `refinement-next-hide-${game.store.games.get(game.created.gameId).currentRoundNumber}-${index}`,
      now: nowAt()
    });
    revision = hidden.meta.revision;
  }
  game.revision = revision;
}

function spyIds(store, gameId) {
  const game = store.games.get(gameId);
  const round = game.rounds.find((candidate) => candidate.roundNumber === game.currentRoundNumber);
  return round.assignments.filter((assignment) => assignment.isSpy).map((assignment) => assignment.playerId);
}

test('two-spy deals pair each spy with the other spy and score the winning team', () => {
  const players = ['Ana', 'Bea', 'Cy', 'Dee', 'Ena', 'Fay', 'Gia', 'Hal', 'Ira'];
  const round = dealRound(players, LOCATION_DECK[0], () => 0);
  const spyCards = round.cards.filter((card) => card.isSpy);

  assert.equal(spyCards.length, 2);
  assert.equal(spyCards[0].partner, spyCards[1].player);
  assert.equal(spyCards[1].partner, spyCards[0].player);
  assert.deepEqual(
    calculateRoundPoints({ players, spies: round.spies, winner: 'spies', reason: 'correct-guess' }),
    players.map((player) => ({ player, points: round.spies.includes(player) ? 3 : 0 }))
  );
});

test('two-spy rounds let both spies guess and either correct guess wins', async () => {
  const players = Array.from({ length: 9 }, (_, index) => `Player ${index + 1}`);
  const game = await createGameWithRevealedCards(players);
  const spies = spyIds(game.store, game.created.gameId);
  const firstSpy = spies[0];
  const secondSpy = spies[1];
  const ended = await applyGameAction({
    store: game.store,
    sessionId: game.session.session.id,
    gameId: game.created.gameId,
    command: { type: 'end-round' },
    expectedRevision: game.revision,
    idempotencyKey: 'refinement-two-spy-end',
    now: nowAt()
  });

  const accused = await applyGameAction({
    store: game.store,
    sessionId: game.session.session.id,
    gameId: game.created.gameId,
    command: { type: 'accuse', playerId: firstSpy },
    expectedRevision: ended.meta.revision,
    idempotencyKey: 'refinement-two-spy-accuse',
    now: nowAt()
  });
  assert.equal(accused.data.phase, 'spy-guess');
  assert.equal(accused.data.guessingPlayer.id, firstSpy);

  const firstGuess = await applyGameAction({
    store: game.store,
    sessionId: game.session.session.id,
    gameId: game.created.gameId,
    command: { type: 'guess', playerId: firstSpy, location: 'Bank' },
    expectedRevision: accused.meta.revision,
    idempotencyKey: 'refinement-two-spy-first-guess',
    now: nowAt()
  });
  assert.equal(firstGuess.data.phase, 'spy-guess');
  assert.equal(firstGuess.data.guessingPlayer.id, secondSpy);

  const final = await applyGameAction({
    store: game.store,
    sessionId: game.session.session.id,
    gameId: game.created.gameId,
    command: { type: 'guess', playerId: secondSpy, location: LOCATION_DECK[0].name },
    expectedRevision: firstGuess.meta.revision,
    idempotencyKey: 'refinement-two-spy-second-guess',
    now: nowAt()
  });
  assert.equal(final.data.phase, 'result');
  assert.equal(final.data.outcome.winner, 'spies');
  assert.equal(final.data.outcome.guesses.length, 2);
  assert.equal(final.data.outcome.guesses[1].player.id, secondSpy);
});

test('a spy can call for a guess before the timer ends', async () => {
  const players = ['Ana', 'Bea', 'Cy', 'Dee'];
  const game = await createGameWithRevealedCards(players);
  const spyId = spyIds(game.store, game.created.gameId)[0];

  const called = await applyGameAction({
    store: game.store,
    sessionId: game.session.session.id,
    gameId: game.created.gameId,
    command: { type: 'call-guess', playerId: spyId },
    expectedRevision: game.revision,
    idempotencyKey: 'refinement-voluntary-call',
    now: nowAt()
  });
  assert.equal(called.data.phase, 'spy-guess');
  assert.equal(called.data.guessingPlayer.id, spyId);
});

test('custom two-spy rounds accept arbitrary normalized guesses until one is correct', async () => {
  const players = Array.from({ length: 9 }, (_, index) => `Player ${index + 1}`);
  const game = await createGameWithRevealedCards(players, {
    secretMode: 'custom',
    customSecret: '  Lighthouse\t\nAt Dawn  '
  });
  const spies = spyIds(game.store, game.created.gameId);
  const ended = await applyGameAction({
    store: game.store,
    sessionId: game.session.session.id,
    gameId: game.created.gameId,
    command: { type: 'end-round' },
    expectedRevision: game.revision,
    idempotencyKey: 'custom-two-spy-end',
    now: nowAt()
  });
  const accused = await applyGameAction({
    store: game.store,
    sessionId: game.session.session.id,
    gameId: game.created.gameId,
    command: { type: 'accuse', playerId: spies[0] },
    expectedRevision: ended.meta.revision,
    idempotencyKey: 'custom-two-spy-accuse',
    now: nowAt()
  });
  const firstGuess = await applyGameAction({
    store: game.store,
    sessionId: game.session.session.id,
    gameId: game.created.gameId,
    command: { type: 'guess', playerId: spies[0], location: 'Something Else' },
    expectedRevision: accused.meta.revision,
    idempotencyKey: 'custom-two-spy-first-guess',
    now: nowAt()
  });
  assert.equal(firstGuess.data.phase, 'spy-guess');
  assert.equal(firstGuess.data.guessingPlayer.id, spies[1]);

  const result = await applyGameAction({
    store: game.store,
    sessionId: game.session.session.id,
    gameId: game.created.gameId,
    command: {
      type: 'guess',
      playerId: spies[1],
      location: ' lighthouse\nAT dawn '
    },
    expectedRevision: firstGuess.meta.revision,
    idempotencyKey: 'custom-two-spy-second-guess',
    now: nowAt()
  });
  assert.equal(result.data.phase, 'result');
  assert.equal(result.data.outcome.winner, 'spies');
  assert.equal(result.data.outcome.guesses[1].correct, true);
});

test('a session scores five non-repeating rounds and then closes the scoreboard', async () => {
  const players = ['Ana', 'Bea', 'Cy', 'Dee'];
  const game = await createGameWithRevealedCards(players);
  const locations = [];

  for (let roundNumber = 1; roundNumber <= 5; roundNumber += 1) {
    const persisted = game.store.games.get(game.created.gameId);
    const round = persisted.rounds.find((candidate) => candidate.roundNumber === persisted.currentRoundNumber);
    const nonSpyId = round.assignments.find((assignment) => !assignment.isSpy).playerId;
    locations.push(round.locationName);

    const ended = await applyGameAction({
      store: game.store,
      sessionId: game.session.session.id,
      gameId: game.created.gameId,
      command: { type: 'end-round' },
      expectedRevision: game.revision,
      idempotencyKey: `refinement-score-end-${roundNumber}`,
      now: nowAt()
    });
    const result = await applyGameAction({
      store: game.store,
      sessionId: game.session.session.id,
      gameId: game.created.gameId,
      command: { type: 'accuse', playerId: nonSpyId },
      expectedRevision: ended.meta.revision,
      idempotencyKey: `refinement-score-accuse-${roundNumber}`,
      now: nowAt()
    });
    game.revision = result.meta.revision;
    assert.equal(result.data.outcome.session.roundsCompleted, roundNumber);
    assert.equal(result.data.outcome.session.roundsTotal, 5);
    assert.equal(result.data.outcome.session.isFinal, roundNumber === 5);
    assert.ok(result.data.outcome.roundPoints.every((entry) => Number.isInteger(entry.points)));

    if (roundNumber < 5) {
      const replay = await applyGameAction({
        store: game.store,
        sessionId: game.session.session.id,
        gameId: game.created.gameId,
        command: { type: 'replay' },
        expectedRevision: game.revision,
        idempotencyKey: `refinement-score-replay-${roundNumber}`,
        random: () => 0,
        now: nowAt()
      });
      game.revision = replay.meta.revision;
      await revealNextRound(game);
    }
  }

  assert.equal(new Set(locations).size, locations.length);
  assert.equal(game.store.games.get(game.created.gameId).rounds.length, 5);
  await assert.rejects(
    applyGameAction({
      store: game.store,
      sessionId: game.session.session.id,
      gameId: game.created.gameId,
      command: { type: 'replay' },
      expectedRevision: game.revision,
      idempotencyKey: 'refinement-score-after-final',
      now: nowAt()
    }),
    (error) => error.code === 'GAME_COMPLETE' && error.status === 409
  );
});
