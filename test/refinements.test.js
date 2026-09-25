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
  createGame,
  getGameSnapshot
} = require('../server/game-service.js');

const ENV = {
  NODE_ENV: 'test',
  APP_ORIGIN: 'http://localhost:3000',
  SESSION_SECRET: 'refinement-session-secret'
};

function nowAt(value = '2026-09-08T12:00:00.000Z') {
  return new Date(value);
}

async function createGameWithRevealedCards(players, { secretMode, customSecret, random = () => 0 } = {}) {
  const store = new MemoryStore();
  const session = await createSession({ store, env: ENV, now: nowAt() });
  const created = await createGame({
    store,
    sessionId: session.session.id,
    players,
    timerSeconds: 300,
    secretMode,
    customSecret,
    random,
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

function assertPublicBoardSnapshot(snapshot, board) {
  assert.deepEqual(snapshot.locationBoard, board);
  assert.deepEqual(snapshot.locationBoard, snapshot.locationBoard.slice().sort());
  if (snapshot.phase === 'result') return;

  const serialized = JSON.stringify(snapshot);
  for (const privateField of [
    '"locationName"',
    '"locationCategory"',
    '"isSpy"',
    '"spyPlayers"',
    '"assignments"',
    '"role"',
    '"card"'
  ]) {
    assert.equal(serialized.includes(privateField), false, `snapshot leaked ${privateField}`);
  }
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
  const round = game.store.games.get(game.created.gameId).rounds[0];
  const wrongGuess = game.created.locationBoard.find((location) => location !== round.locationName);
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
    command: { type: 'guess', playerId: firstSpy, location: wrongGuess },
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
    command: { type: 'guess', playerId: secondSpy, location: round.locationName },
    expectedRevision: firstGuess.meta.revision,
    idempotencyKey: 'refinement-two-spy-second-guess',
    now: nowAt()
  });
  assert.equal(final.data.phase, 'result');
  assert.equal(final.data.outcome.winner, 'spies');
  assert.equal(final.data.outcome.guesses.length, 2);
  assert.equal(final.data.outcome.guesses[0].correct, false);
  assert.equal(final.data.outcome.guesses[1].correct, true);
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
  const board = game.store.games.get(game.created.gameId).boardLocations;
  assert.equal(board.length, 24);
  assert.deepEqual(board, board.slice().sort());
  assert.deepEqual(game.created.locationBoard, board);
  const locations = [];

  for (let roundNumber = 1; roundNumber <= 5; roundNumber += 1) {
    const persisted = game.store.games.get(game.created.gameId);
    const round = persisted.rounds.find((candidate) => candidate.roundNumber === persisted.currentRoundNumber);
    const nonSpyId = round.assignments.find((assignment) => !assignment.isSpy).playerId;
    assert.ok(board.includes(round.locationName));
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
      assert.deepEqual(replay.data.locationBoard, board);
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

test('the sorted public board is present in each phase without identifying the selected location', async () => {
  const game = await createGameWithRevealedCards(['Ana', 'Bea', 'Cy', 'Dee']);
  const record = game.store.games.get(game.created.gameId);
  const board = record.boardLocations;
  const roundSnapshot = await getGameSnapshot({
    store: game.store,
    sessionId: game.session.session.id,
    gameId: game.created.gameId,
    now: nowAt()
  });
  assertPublicBoardSnapshot(roundSnapshot, board);

  const ended = await applyGameAction({
    store: game.store,
    sessionId: game.session.session.id,
    gameId: game.created.gameId,
    command: { type: 'end-round' },
    expectedRevision: game.revision,
    idempotencyKey: 'board-private-end',
    now: nowAt()
  });
  assert.equal(ended.data.phase, 'accuse');
  assertPublicBoardSnapshot(ended.data, board);

  const spyId = spyIds(game.store, game.created.gameId)[0];
  const accused = await applyGameAction({
    store: game.store,
    sessionId: game.session.session.id,
    gameId: game.created.gameId,
    command: { type: 'accuse', playerId: spyId },
    expectedRevision: ended.meta.revision,
    idempotencyKey: 'board-private-accuse',
    now: nowAt()
  });
  assert.equal(accused.data.phase, 'spy-guess');
  assertPublicBoardSnapshot(accused.data, board);

  const wrongGuess = board.find((location) => location !== record.rounds[0].locationName);
  const result = await applyGameAction({
    store: game.store,
    sessionId: game.session.session.id,
    gameId: game.created.gameId,
    command: { type: 'guess', playerId: spyId, location: wrongGuess },
    expectedRevision: accused.meta.revision,
    idempotencyKey: 'board-private-guess',
    now: nowAt()
  });
  assert.equal(result.data.phase, 'result');
  assertPublicBoardSnapshot(result.data, board);
});

test('a board hides the true location index across deterministic random sources', async () => {
  const indexes = [];
  for (const value of [0.12, 0.49, 0.88]) {
    const game = await createGameWithRevealedCards(
      ['Ana', 'Bea', 'Cy', 'Dee'],
      { random: () => value }
    );
    const record = game.store.games.get(game.created.gameId);
    assert.deepEqual(record.boardLocations, record.boardLocations.slice().sort());
    indexes.push(record.boardLocations.indexOf(record.rounds[0].locationName));
  }
  assert.ok(new Set(indexes).size > 1);
});

test('deck guesses are limited to the game board while legacy games keep the full deck', async () => {
  const game = await createGameWithRevealedCards(['Ana', 'Bea', 'Cy', 'Dee']);
  const record = game.store.games.get(game.created.gameId);
  const outsideBoard = LOCATION_DECK.find((location) => !record.boardLocations.includes(location.name));
  const spyId = spyIds(game.store, game.created.gameId)[0];
  const ended = await applyGameAction({
    store: game.store,
    sessionId: game.session.session.id,
    gameId: game.created.gameId,
    command: { type: 'end-round' },
    expectedRevision: game.revision,
    idempotencyKey: 'board-guess-end',
    now: nowAt()
  });
  const accused = await applyGameAction({
    store: game.store,
    sessionId: game.session.session.id,
    gameId: game.created.gameId,
    command: { type: 'accuse', playerId: spyId },
    expectedRevision: ended.meta.revision,
    idempotencyKey: 'board-guess-accuse',
    now: nowAt()
  });

  await assert.rejects(
    applyGameAction({
      store: game.store,
      sessionId: game.session.session.id,
      gameId: game.created.gameId,
      command: { type: 'guess', playerId: spyId, location: outsideBoard.name },
      expectedRevision: accused.meta.revision,
      idempotencyKey: 'board-guess-rejected',
      now: nowAt()
    }),
    (error) => error.status === 400 && error.code === 'VALIDATION_ERROR'
  );
  const accepted = await applyGameAction({
    store: game.store,
    sessionId: game.session.session.id,
    gameId: game.created.gameId,
    command: {
      type: 'guess',
      playerId: spyId,
      location: record.boardLocations.find((location) => location !== record.rounds[0].locationName)
    },
    expectedRevision: accused.meta.revision,
    idempotencyKey: 'board-guess-accepted',
    now: nowAt()
  });
  assert.equal(accepted.data.phase, 'result');

  const legacy = await createGameWithRevealedCards(['Ena', 'Fay', 'Gia', 'Hal']);
  const legacyRecord = legacy.store.games.get(legacy.created.gameId);
  const legacyBoard = legacyRecord.boardLocations.slice();
  const legacySecret = legacyRecord.rounds[0].locationName;
  legacyRecord.boardLocations = null;
  const legacyOutsideBoard = LOCATION_DECK.find((location) => (
    !legacyBoard.includes(location.name) && location.name !== legacySecret
  ));
  const legacySpyId = spyIds(legacy.store, legacy.created.gameId)[0];
  const legacyEnd = await applyGameAction({
    store: legacy.store,
    sessionId: legacy.session.session.id,
    gameId: legacy.created.gameId,
    command: { type: 'end-round' },
    expectedRevision: legacy.revision,
    idempotencyKey: 'legacy-board-end',
    now: nowAt()
  });
  const legacyAccused = await applyGameAction({
    store: legacy.store,
    sessionId: legacy.session.session.id,
    gameId: legacy.created.gameId,
    command: { type: 'accuse', playerId: legacySpyId },
    expectedRevision: legacyEnd.meta.revision,
    idempotencyKey: 'legacy-board-accuse',
    now: nowAt()
  });
  const legacyResult = await applyGameAction({
    store: legacy.store,
    sessionId: legacy.session.session.id,
    gameId: legacy.created.gameId,
    command: { type: 'guess', playerId: legacySpyId, location: legacyOutsideBoard.name },
    expectedRevision: legacyAccused.meta.revision,
    idempotencyKey: 'legacy-board-guess',
    now: nowAt()
  });
  const replay = await applyGameAction({
    store: legacy.store,
    sessionId: legacy.session.session.id,
    gameId: legacy.created.gameId,
    command: { type: 'replay' },
    expectedRevision: legacyResult.meta.revision,
    idempotencyKey: 'legacy-board-replay',
    random: () => 0,
    now: nowAt()
  });
  const nextRound = legacy.store.games.get(legacy.created.gameId).rounds[1];
  assert.equal(replay.data.locationBoard, null);
  assert.equal(nextRound.secretMode, 'deck');
  assert.ok(LOCATION_DECK.some((location) => location.name === nextRound.locationName));
  assert.notEqual(nextRound.locationName, legacySecret);
});
