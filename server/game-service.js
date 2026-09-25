'use strict';

const crypto = require('node:crypto');

const SpyGameLogic = require('../game-logic.js');
const { DEFAULT_MAX_GAMES_PER_SESSION } = require('./config.js');
const { HttpError, validationError } = require('./http.js');
const { resolveNow } = require('./session.js');
const {
  hashRequest,
  validateActionRequest,
  validateCardRequest,
  validateCreateRequest,
  validateIdempotencyKey,
  normalizeCustomSecret,
  validateListOptions,
  validateRoundListOptions,
  encodeRoundCursor
} = require('./validation.js');

const LOCATION_BOARD_SIZE = 24;

class NotFoundError extends HttpError {
  constructor(message = 'Game not found.') {
    super(404, 'NOT_FOUND', message, {});
    this.name = 'NotFoundError';
  }
}

function field(record, camelName, snakeName) {
  if (record && record[camelName] !== undefined) return record[camelName];
  return record ? record[snakeName] : undefined;
}

function toDateOrNull(value) {
  if (value === undefined || value === null || value === '') return null;
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isoOrNull(value) {
  const date = toDateOrNull(value);
  return date ? date.toISOString() : null;
}

function playerIdentity(player) {
  if (!player) return null;
  return {
    id: String(field(player, 'id', 'id')),
    seat: Number(field(player, 'seat', 'seat')),
    displayName: String(field(player, 'displayName', 'display_name'))
  };
}

function playersForRecord(record) {
  return (record && Array.isArray(record.players) ? record.players : [])
    .map(playerIdentity)
    .sort((left, right) => left.seat - right.seat);
}

function currentRoundForRecord(record) {
  const rounds = record && Array.isArray(record.rounds) ? record.rounds : [];
  const currentRoundNumber = Number(field(record, 'currentRoundNumber', 'current_round_number'));
  return rounds.find((round) => Number(field(round, 'roundNumber', 'round_number')) === currentRoundNumber)
    || rounds[rounds.length - 1]
    || null;
}

function secretModeForRecord(record, fallback = 'deck') {
  const value = field(record, 'secretMode', 'secret_mode');
  if (value === 'custom' || value === 'deck') return value;
  return fallback === 'custom' ? 'custom' : 'deck';
}

function secretModeForRound(game, round) {
  return secretModeForRecord(round, secretModeForRecord(game));
}

function assignmentList(round) {
  if (!round) return [];
  if (Array.isArray(round.assignments)) return round.assignments;
  return [];
}

function arrayField(record, camelName, snakeName) {
  const value = field(record, camelName, snakeName);
  return Array.isArray(value) ? value : [];
}

function findPlayer(players, playerId) {
  if (!playerId) return null;
  return players.find((player) => player.id === String(playerId)) || null;
}

function spyAssignments(round) {
  return assignmentList(round).filter((assignment) => Boolean(field(assignment, 'isSpy', 'is_spy')));
}

function spyPlayerIds(round) {
  return spyAssignments(round).map((assignment) => String(field(assignment, 'playerId', 'player_id')));
}

function guessesForRound(round) {
  const guesses = arrayField(round, 'guesses', 'guesses');
  if (guesses.length > 0) return guesses;
  const legacyGuess = field(round, 'guess', 'guess');
  return legacyGuess === undefined || legacyGuess === null
    ? []
    : [{ playerId: field(round, 'accusedPlayerId', 'accused_player_id'), location: String(legacyGuess) }];
}

function guessOrderForRound(round, players, preferredPlayerId) {
  const spyIds = spyPlayerIds(round);
  const storedOrder = arrayField(round, 'guessOrder', 'guess_order')
    .map((playerId) => String(playerId))
    .filter((playerId, index, values) => spyIds.includes(playerId) && values.indexOf(playerId) === index);
  const first = preferredPlayerId ? String(preferredPlayerId) : null;
  const order = [];

  if (first && spyIds.includes(first)) order.push(first);
  storedOrder.forEach((playerId) => {
    if (!order.includes(playerId)) order.push(playerId);
  });
  spyIds.forEach((playerId) => {
    if (!order.includes(playerId)) order.push(playerId);
  });
  return order;
}

function roundPointsForPlayers(round, players) {
  const storedPoints = arrayField(round, 'points', 'points');
  if (storedPoints.length > 0) {
    return players.map((player) => {
      const entry = storedPoints.find((candidate) => (
        String(field(candidate, 'playerId', 'player_id')) === player.id
      ));
      return {
        player,
        points: entry ? Number(field(entry, 'points', 'points')) || 0 : 0
      };
    });
  }

  const winner = field(round, 'winner', 'winner');
  const reason = field(round, 'reason', 'reason');
  if (!winner) return players.map((player) => ({ player, points: 0 }));
  const spies = spyAssignments(round)
    .map((assignment) => findPlayer(players, field(assignment, 'playerId', 'player_id')))
    .filter(Boolean)
    .map((player) => player.displayName);
  const fallback = SpyGameLogic.calculateRoundPoints({
    players: players.map((player) => player.displayName),
    spies,
    winner,
    reason
  });
  return players.map((player) => ({
    player,
    points: (fallback.find((entry) => entry.player === player.displayName) || {}).points || 0
  }));
}

function pointsRecordsForRound(round, players) {
  return roundPointsForPlayers(round, players).map((entry) => ({
    playerId: entry.player.id,
    points: entry.points
  }));
}

function sessionScoreForRecord(record, players) {
  const rounds = record && Array.isArray(record.rounds) ? record.rounds : [];
  const completed = rounds
    .filter((round) => field(round, 'completedAt', 'completed_at'))
    .sort((left, right) => Number(field(left, 'roundNumber', 'round_number'))
      - Number(field(right, 'roundNumber', 'round_number')));
  const totals = new Map(players.map((player) => [player.id, 0]));

  completed.forEach((round) => {
    roundPointsForPlayers(round, players).forEach((entry) => {
      totals.set(entry.player.id, (totals.get(entry.player.id) || 0) + entry.points);
    });
  });

  const leaderboard = players.map((player) => ({
    player,
    points: totals.get(player.id) || 0
  })).sort((left, right) => right.points - left.points || left.player.seat - right.player.seat);
  const roundsTotal = Number(field(record, 'roundLimit', 'round_limit')) || 5;
  const roundsCompleted = completed.length;
  const highestScore = leaderboard.length > 0 ? leaderboard[0].points : 0;
  return {
    roundsCompleted,
    roundsTotal,
    isFinal: roundsCompleted >= roundsTotal,
    leaderboard,
    winner: roundsCompleted >= roundsTotal
      ? leaderboard.filter((entry) => entry.points === highestScore).map((entry) => entry.player)
      : []
  };
}

function invalidPhase(action, phase, allowedPhases) {
  return new HttpError(409, 'INVALID_PHASE', `Cannot ${action} while the game is in ${phase}.`, {
    action,
    phase,
    allowedPhases
  });
}

function normalizeCardValues({ action, expectedRevision, idempotencyKey } = {}) {
  const rawInput = action && typeof action === 'object' ? action : { action };
  return validateCardRequest({
    ...rawInput,
    action: rawInput.action,
    expectedRevision: expectedRevision === undefined
      ? rawInput.expectedRevision
      : expectedRevision,
    idempotencyKey: idempotencyKey === undefined
      ? rawInput.idempotencyKey
      : idempotencyKey
  });
}

function normalizeGameValues({ command, expectedRevision, idempotencyKey } = {}) {
  const rawCommand = typeof command === 'string'
    ? { type: command }
    : (command && typeof command === 'object' ? { ...command } : {});
  if (expectedRevision !== undefined) rawCommand.expectedRevision = expectedRevision;
  if (idempotencyKey !== undefined) rawCommand.idempotencyKey = idempotencyKey;
  return validateActionRequest(rawCommand);
}

function requestHashOrCompute(requestHash, value) {
  return typeof requestHash === 'string' && requestHash.length > 0
    ? requestHash
    : hashRequest(value);
}

function snapshotEnvelope(snapshot, now) {
  return {
    data: snapshot,
    meta: {
      serverNow: now.toISOString(),
      revision: snapshot.revision
    }
  };
}

function cardEnvelope(card, revision, now) {
  return {
    data: { card },
    meta: {
      serverNow: now.toISOString(),
      revision
    }
  };
}

async function refreshGameInTransaction(tx, sessionId, gameId, fallback) {
  if (typeof tx.lockOwnedGame === 'function') {
    return (await tx.lockOwnedGame(sessionId, gameId)) || fallback;
  }
  if (typeof tx.getGameForSession === 'function') {
    return (await tx.getGameForSession(sessionId, gameId)) || fallback;
  }
  return fallback;
}

async function updateTransition(tx, {
  game,
  sessionId,
  gameId,
  gameValues,
  roundValues,
  now
}) {
  const round = currentRoundForRecord(game);
  if (!round) throw new HttpError(500, 'INTERNAL_ERROR', 'Current round is missing.', {});
  if (roundValues && Object.keys(roundValues).length > 0) {
    if (typeof tx.updateRound !== 'function') {
      throw new TypeError('The store does not implement round updates.');
    }
    await tx.updateRound(round.id, roundValues);
  }
  if (typeof tx.updateGame !== 'function') {
    throw new TypeError('The store does not implement game updates.');
  }
  await tx.updateGame(gameId || field(game, 'id', 'id'), {
    ...(gameValues || {}),
    revision: Number(field(game, 'revision', 'revision')) + 1,
    updatedAt: now
  });
  return refreshGameInTransaction(tx, sessionId, gameId || field(game, 'id', 'id'), game);
}

function cardForCurrentPlayer(game) {
  const players = playersForRecord(game);
  const revealIndex = Number(field(game, 'currentRevealIndex', 'current_reveal_index'));
  const player = players[revealIndex];
  const round = currentRoundForRecord(game);
  if (!player || !round) {
    throw new HttpError(500, 'INTERNAL_ERROR', 'The current handoff card is unavailable.', {});
  }
  const assignment = assignmentList(round).find((candidate) => (
    String(field(candidate, 'playerId', 'player_id')) === player.id
  ));
  if (!assignment) {
    throw new HttpError(500, 'INTERNAL_ERROR', 'The current handoff assignment is unavailable.', {});
  }
  const isSpy = Boolean(field(assignment, 'isSpy', 'is_spy'));
  const card = {
    player,
    isSpy,
    location: isSpy ? null : String(field(round, 'locationName', 'location_name')),
    category: isSpy ? null : String(field(round, 'locationCategory', 'location_category'))
  };
  if (isSpy) {
    const partner = spyAssignments(round)
      .map((candidate) => findPlayer(players, field(candidate, 'playerId', 'player_id')))
      .find((candidate) => candidate && candidate.id !== player.id);
    if (partner) card.partner = partner;
  }
  return card;
}

function spyNamesForRound(round, players) {
  return spyAssignments(round)
    .map((assignment) => findPlayer(players, field(assignment, 'playerId', 'player_id')))
    .filter(Boolean)
    .map((player) => player.displayName);
}

async function runAuthoritativeMutation({
  store,
  sessionId,
  gameId,
  expectedRevision,
  idempotencyKey,
  requestHash,
  now,
  apply
}) {
  if (!store || typeof store.runMutationTransaction !== 'function') {
    throw new TypeError('The store does not implement authoritative mutations.');
  }
  try {
    return await store.runMutationTransaction({
      sessionId,
      gameId,
      expectedRevision,
      idempotencyKey,
      requestHash,
      now,
      apply
    });
  } catch (error) {
    if (error && error.code === 'REVISION_CONFLICT') {
      let snapshot = error.currentRecord ? sanitizeGameSnapshot(error.currentRecord) : null;
      if (!snapshot && typeof store.getGameForSession === 'function') {
        try {
          snapshot = await getGameSnapshot({ store, sessionId, gameId, now });
        } catch (readError) {
          snapshot = null;
        }
      }
      if (snapshot) {
        error.details = {
          ...(error.details || {}),
          snapshot
        };
      }
    }
    throw error;
  }
}

/**
 * Convert an internal game row into the exact public snapshot contract.
 * Active rows intentionally have no path by which location or assignments can
 * reach the returned object. Result data is the one explicitly authorized
 * exception in the Phase 2 contract.
 */
function sanitizeGameSnapshot(record) {
  if (!record) return null;
  const players = playersForRecord(record);
  const phase = String(field(record, 'currentPhase', 'current_phase'));
  const revealIndex = Number(field(record, 'currentRevealIndex', 'current_reveal_index'));
  const currentPlayer = phase === 'reveal' && revealIndex >= 0 && revealIndex < players.length
    ? players[revealIndex]
    : null;
  const round = currentRoundForRecord(record);
  const accusedPlayerId = field(record, 'currentAccusedPlayerId', 'current_accused_player_id')
    ?? field(round, 'accusedPlayerId', 'accused_player_id');
  const accusedPlayer = ['accuse', 'spy-guess', 'result'].includes(phase)
    ? findPlayer(players, accusedPlayerId)
    : null;
  const secretMode = secretModeForRound(record, round);
  const boardLocations = field(record, 'boardLocations', 'board_locations');
  const guessingPlayer = phase === 'spy-guess'
    ? findPlayer(
      players,
      guessOrderForRound(round, players, accusedPlayerId)[guessesForRound(round).length]
    )
    : null;
  let outcome = null;

  if (phase === 'result') {
    const winner = field(record, 'currentWinner', 'current_winner')
      ?? field(round, 'winner', 'winner');
    const reason = field(record, 'currentReason', 'current_reason')
      ?? field(round, 'reason', 'reason');
    outcome = {
      winner: winner ?? null,
      reason: reason ?? null
    };
    const location = field(round, 'locationName', 'location_name');
    const category = field(round, 'locationCategory', 'location_category');
    const guess = field(round, 'guess', 'guess');
    const guesses = guessesForRound(round)
      .map((entry) => {
        const guesser = findPlayer(players, field(entry, 'playerId', 'player_id'));
        if (!guesser) return null;
        return {
          player: guesser,
          location: field(entry, 'location', 'location') == null
            ? null
            : String(field(entry, 'location', 'location')),
          correct: Boolean(field(entry, 'correct', 'correct'))
        };
      })
      .filter(Boolean);
    const spies = spyAssignments(round)
      .map((assignment) => findPlayer(players, field(assignment, 'playerId', 'player_id')))
      .filter(Boolean);
    if (location !== undefined && location !== null) outcome.location = String(location);
    if (category !== undefined && category !== null) outcome.category = String(category);
    if (spies.length > 0) outcome.spyPlayers = spies;
    if (accusedPlayer) outcome.accusedPlayer = accusedPlayer;
    if (guess !== undefined && guess !== null) outcome.guess = String(guess);
    if (guesses.length > 0) outcome.guesses = guesses;
    outcome.roundPoints = roundPointsForPlayers(round, players).map((entry) => ({
      player: entry.player,
      points: entry.points
    }));
    outcome.session = sessionScoreForRecord(record, players);
  }

  const snapshot = {
    gameId: String(field(record, 'id', 'id')),
    roundNumber: Number(field(record, 'currentRoundNumber', 'current_round_number')),
    phase,
    timerSeconds: Number(field(record, 'timerSeconds', 'timer_seconds')),
    players,
    currentPlayer,
    revealIndex,
    secretMode,
    locationBoard: secretMode === 'deck' && Array.isArray(boardLocations)
      ? boardLocations.slice()
      : null,
    deadlineAt: isoOrNull(field(record, 'currentDeadlineAt', 'current_deadline_at'))
      || isoOrNull(field(round, 'deadlineAt', 'deadline_at')),
    accusedPlayer,
    outcome,
    revision: Number(field(record, 'revision', 'revision'))
  };
  if (guessingPlayer) snapshot.guessingPlayer = guessingPlayer;
  return snapshot;
}

/**
 * Convert a resume-list row into the smaller public contract used before a
 * player selects a game. The list never needs result details, assignments, or
 * round history, so keeping them out here also prevents a compact store row
 * from accidentally growing into a secret-bearing snapshot.
 */
function sanitizeGameSummary(record) {
  if (!record) return null;
  const players = playersForRecord(record);
  const phase = String(field(record, 'currentPhase', 'current_phase'));
  const revealIndex = Number(field(record, 'currentRevealIndex', 'current_reveal_index'));
  const round = currentRoundForRecord(record);
  const currentPlayer = phase === 'reveal' && revealIndex >= 0 && revealIndex < players.length
    ? players[revealIndex]
    : null;
  const summary = {
    gameId: String(field(record, 'id', 'id')),
    roundNumber: Number(field(record, 'currentRoundNumber', 'current_round_number')),
    phase,
    timerSeconds: Number(field(record, 'timerSeconds', 'timer_seconds')),
    players,
    currentPlayer,
    revealIndex,
    secretMode: secretModeForRecord(record),
    deadlineAt: isoOrNull(field(record, 'currentDeadlineAt', 'current_deadline_at'))
      || isoOrNull(field(round, 'deadlineAt', 'deadline_at')),
    revision: Number(field(record, 'revision', 'revision'))
  };
  return summary;
}

function chooseLocation(random, excludedLocationNames, boardLocations) {
  const source = typeof random === 'function' ? random : Math.random;
  const value = Number(source());
  const bounded = Number.isFinite(value) ? Math.max(0, Math.min(0.999999999, value)) : 0;
  const excluded = new Set(
    Array.isArray(excludedLocationNames)
      ? excludedLocationNames
      : excludedLocationNames ? [excludedLocationNames] : []
  );
  const sourceDeck = Array.isArray(boardLocations)
    ? boardLocations
      .map((name) => SpyGameLogic.LOCATION_DECK.find((location) => location.name === name))
      .filter(Boolean)
    : SpyGameLogic.LOCATION_DECK;
  const available = sourceDeck.filter((location) => !excluded.has(location.name));
  const deck = available.length > 0 ? available : sourceDeck;
  return deck[Math.floor(bounded * deck.length)];
}

function buildRoundRecord({
  game,
  roundNumber,
  random,
  now,
  excludedLocationName,
  secretMode,
  customSecret
} = {}) {
  const players = playersForRecord(game);
  const mode = secretMode === undefined
    ? secretModeForRecord(game)
    : secretModeForRecord({ secretMode });
  const location = mode === 'custom'
    ? { name: normalizeCustomSecret(customSecret), category: 'Custom' }
    : chooseLocation(random, excludedLocationName, field(game, 'boardLocations', 'board_locations'));
  const dealt = SpyGameLogic.dealRound(
    players.map((player) => player.displayName),
    location,
    random
  );
  const startedAt = resolveNow(now);
  return {
    id: crypto.randomUUID(),
    gameId: String(field(game, 'id', 'id')),
    roundNumber,
    secretMode: mode,
    locationName: location.name,
    locationCategory: location.category,
    phase: 'reveal',
    revealIndex: 0,
    deadlineAt: null,
    accusedPlayerId: null,
    guess: null,
    guesses: [],
    guessOrder: [],
    points: [],
    winner: null,
    reason: null,
    startedAt,
    completedAt: null,
    assignments: players.map((player) => ({
      playerId: player.id,
      isSpy: dealt.spies.includes(player.displayName)
    }))
  };
}

function buildGameRecord({
  sessionId,
  players,
  timerSeconds,
  secretMode = 'deck',
  customSecret,
  random,
  now
}) {
  const createdAt = resolveNow(now);
  const mode = secretModeForRecord({ secretMode });
  const boardLocations = mode === 'custom'
    ? null
    : SpyGameLogic.pickBoard(SpyGameLogic.LOCATION_DECK, LOCATION_BOARD_SIZE, random);
  const location = mode === 'custom'
    ? { name: normalizeCustomSecret(customSecret), category: 'Custom' }
    : chooseLocation(random, null, boardLocations);
  const dealt = SpyGameLogic.dealRound(players, location, random);
  const gameId = crypto.randomUUID();
  const roundId = crypto.randomUUID();
  const playerRecords = players.map((displayName, seat) => ({
    id: crypto.randomUUID(),
    seat,
    displayName
  }));
  const assignments = playerRecords.map((player) => ({
    playerId: player.id,
    isSpy: dealt.spies.includes(player.displayName)
  }));

  return {
    id: gameId,
    sessionId,
    timerSeconds,
    secretMode: mode,
    boardLocations,
    roundLimit: 5,
    currentRoundNumber: 1,
    currentPhase: 'reveal',
    currentRevealIndex: 0,
    currentDeadlineAt: null,
    currentAccusedPlayerId: null,
    currentWinner: null,
    currentReason: null,
    revision: 1,
    createdAt: new Date(createdAt.getTime()),
    updatedAt: new Date(createdAt.getTime()),
    players: playerRecords,
    rounds: [{
      id: roundId,
      gameId,
      roundNumber: 1,
      secretMode: mode,
      locationName: location.name,
      locationCategory: location.category,
      phase: 'reveal',
      revealIndex: 0,
      deadlineAt: null,
      accusedPlayerId: null,
      guess: null,
      guesses: [],
      guessOrder: [],
      points: [],
      winner: null,
      reason: null,
      startedAt: new Date(createdAt.getTime()),
      completedAt: null,
      assignments
    }]
  };
}

function receiptResponse(receipt) {
  if (!receipt) return null;
  const response = receipt.response ?? receipt.responseJson ?? receipt.response_json;
  const snapshot = response && response.data && response.data.gameId ? response.data : response;
  if (snapshot && snapshot.gameId && snapshot.secretMode === undefined) {
    return { ...snapshot, secretMode: 'deck' };
  }
  return snapshot;
}

function creationRequestHashMatches(receipt, input, requestHash) {
  if (receipt.requestHash === requestHash) return true;
  // Before secret modes existed, deck creation hashes only contained the
  // roster and timer. Keep those receipts replayable after the additive change.
  return input.secretMode === 'deck'
    && input.customSecret === undefined
    && receipt.requestHash === hashRequest({
      players: input.players,
      timerSeconds: input.timerSeconds
    });
}

async function transactionFor(store, callback) {
  if (store && typeof store.withTransaction === 'function') {
    return store.withTransaction(callback);
  }
  return callback(store);
}

async function getSessionLock(tx, sessionId) {
  if (tx && typeof tx.lockSession === 'function') return tx.lockSession(sessionId);
  return true;
}

async function getCreationReceipt(tx, sessionId, idempotencyKey) {
  if (typeof tx.getCreationReceipt === 'function') {
    return tx.getCreationReceipt(sessionId, idempotencyKey);
  }
  if (typeof tx.findCreationReceipt === 'function') {
    return tx.findCreationReceipt(sessionId, idempotencyKey);
  }
  return null;
}

async function insertGame(tx, record) {
  if (typeof tx.insertGame === 'function') return tx.insertGame(record);
  if (typeof tx.createGameRecord === 'function') return tx.createGameRecord(record);
  throw new TypeError('The store does not implement game creation.');
}

async function insertCreationReceipt(tx, values) {
  if (typeof tx.insertCreationReceipt !== 'function') {
    throw new TypeError('The store does not implement creation receipts.');
  }
  return tx.insertCreationReceipt(values);
}

async function countGamesForSession(tx, sessionId) {
  if (typeof tx.countGamesForSession === 'function') {
    return Number(await tx.countGamesForSession(sessionId));
  }
  if (typeof tx.countActiveGames === 'function') {
    return Number(await tx.countActiveGames(sessionId));
  }
  throw new TypeError('The store does not implement game counting.');
}

async function createGame({
  store,
  sessionId,
  players,
  timerSeconds,
  secretMode,
  customSecret,
  random,
  now,
  idempotencyKey,
  maxGames = DEFAULT_MAX_GAMES_PER_SESSION
} = {}) {
  if (!store) throw new TypeError('A game store is required.');
  const input = validateCreateRequest({ players, timerSeconds, secretMode, customSecret });
  const key = idempotencyKey === undefined || idempotencyKey === null
    ? null
    : validateIdempotencyKey(idempotencyKey, 'Idempotency-Key');
  const requestHash = key ? hashRequest(input) : null;
  const createdAt = resolveNow(now);

  return transactionFor(store, async (tx) => {
    const session = await getSessionLock(tx, sessionId);
    if (session === null || session === false) throw new NotFoundError('Session not found.');
    if (session && session.expiresAt && new Date(session.expiresAt).getTime() <= createdAt.getTime()) {
      throw new NotFoundError('Session not found.');
    }

    if (key) {
      const receipt = await getCreationReceipt(tx, sessionId, key);
      if (receipt) {
        if (!creationRequestHashMatches(receipt, input, requestHash)) {
          throw validationError('Idempotency key was reused for a different request.', 400, {
            field: 'Idempotency-Key'
          });
        }
        return receiptResponse(receipt);
      }
    }

    const gameCount = await countGamesForSession(tx, sessionId);
    if (gameCount >= maxGames) {
      throw new HttpError(409, 'GAME_LIMIT_REACHED', 'Maximum saved games reached.', {
        maxGames
      });
    }

    const record = buildGameRecord({
      sessionId,
      players: input.players,
      timerSeconds: input.timerSeconds,
      secretMode: input.secretMode,
      customSecret: input.customSecret,
      random,
      now: createdAt
    });
    const stored = await insertGame(tx, record);
    const snapshot = sanitizeGameSnapshot(stored || record);
    if (key) {
      await insertCreationReceipt(tx, {
        sessionId,
        idempotencyKey: key,
        requestHash,
        gameId: snapshot.gameId,
        response: snapshot,
        createdAt
      });
    }
    return snapshot;
  });
}

async function getGameSnapshot({ store, sessionId, gameId, now } = {}) {
  if (!store) throw new TypeError('A game store is required.');
  let record = null;
  if (typeof store.reconcileExpiredRound === 'function') {
    record = await store.reconcileExpiredRound({ sessionId, gameId, now });
  } else if (typeof store.getGameForSession === 'function') {
    record = await store.getGameForSession(sessionId, gameId);
  } else if (typeof store.getGame === 'function') {
    const candidate = await store.getGame(gameId);
    if (candidate && candidate.sessionId === sessionId) record = candidate;
  }
  return record ? sanitizeGameSnapshot(record) : null;
}

async function listGames({ store, sessionId, limit, cursor, now } = {}) {
  const listMethod = store && typeof store.listGameSummaries === 'function'
    ? store.listGameSummaries.bind(store)
    : store && typeof store.listGames === 'function'
      ? store.listGames.bind(store)
      : null;
  if (!listMethod) {
    throw new TypeError('The store does not implement game listing.');
  }
  const options = validateListOptions({ limit, cursor });
  const result = await listMethod({ sessionId, ...options, now });
  const records = Array.isArray(result) ? result : (result && result.items) || [];
  return {
    items: records.map(sanitizeGameSummary),
    nextCursor: Array.isArray(result) ? null : ((result && result.nextCursor) || null)
  };
}

async function applyCardAction({
  store,
  sessionId,
  gameId,
  action,
  expectedRevision,
  idempotencyKey,
  requestHash,
  now
} = {}) {
  if (!store) throw new TypeError('A game store is required.');
  const input = normalizeCardValues({ action, expectedRevision, idempotencyKey });
  const currentTime = resolveNow(now);
  const canonicalHash = requestHashOrCompute(requestHash, {
    action: input.action,
    expectedRevision: input.expectedRevision
  });

  return runAuthoritativeMutation({
    store,
    sessionId,
    gameId,
    expectedRevision: input.expectedRevision,
    idempotencyKey: input.idempotencyKey,
    requestHash: canonicalHash,
    now: currentTime,
    apply: async (tx, game, transitionTime) => {
      if (field(game, 'currentPhase', 'current_phase') !== 'reveal') {
        throw invalidPhase(input.action, field(game, 'currentPhase', 'current_phase'), ['reveal']);
      }

      if (input.action === 'reveal') {
        return cardEnvelope(cardForCurrentPlayer(game), Number(field(game, 'revision', 'revision')), transitionTime);
      }

      const players = playersForRecord(game);
      const revealIndex = Number(field(game, 'currentRevealIndex', 'current_reveal_index'));
      const nextRevealIndex = revealIndex + 1;
      const finalCard = nextRevealIndex >= players.length;
      const gameValues = { currentRevealIndex: nextRevealIndex };
      const roundValues = { revealIndex: nextRevealIndex };

      if (finalCard) {
        const timerSeconds = Number(field(game, 'timerSeconds', 'timer_seconds'));
        const deadline = new Date(transitionTime.getTime() + timerSeconds * 1000);
        gameValues.currentPhase = 'round';
        gameValues.currentDeadlineAt = deadline;
        roundValues.phase = 'round';
        roundValues.deadlineAt = deadline;
      }

      const updated = await updateTransition(tx, {
        game,
        sessionId,
        gameId,
        gameValues,
        roundValues,
        now: transitionTime
      });
      return snapshotEnvelope(sanitizeGameSnapshot(updated), transitionTime);
    }
  });
}

async function applyGameAction({
  store,
  sessionId,
  gameId,
  command,
  expectedRevision,
  idempotencyKey,
  requestHash,
  random,
  now
} = {}) {
  if (!store) throw new TypeError('A game store is required.');
  const input = normalizeGameValues({ command, expectedRevision, idempotencyKey });
  const currentTime = resolveNow(now);
  const hashInput = {
    type: input.type,
    expectedRevision: input.expectedRevision
  };
  if (input.playerId !== undefined) hashInput.playerId = input.playerId;
  if (input.location !== undefined) hashInput.location = input.location;
  if (input.customSecret !== undefined) hashInput.customSecret = input.customSecret;
  const canonicalHash = requestHashOrCompute(requestHash, hashInput);

  return runAuthoritativeMutation({
    store,
    sessionId,
    gameId,
    expectedRevision: input.expectedRevision,
    idempotencyKey: input.idempotencyKey,
    requestHash: canonicalHash,
    now: currentTime,
    apply: async (tx, game, transitionTime) => {
      const phase = field(game, 'currentPhase', 'current_phase');
      const round = currentRoundForRecord(game);
      const players = playersForRecord(game);
      if (!round) throw new HttpError(500, 'INTERNAL_ERROR', 'Current round is missing.', {});

      if (input.type === 'end-round') {
        if (phase !== 'round') throw invalidPhase('end-round', phase, ['round']);
        const updated = await updateTransition(tx, {
          game,
          sessionId,
          gameId,
          gameValues: {
            currentPhase: 'accuse',
            currentDeadlineAt: null
          },
          roundValues: {
            phase: 'accuse',
            deadlineAt: null
          },
          now: transitionTime
        });
        return snapshotEnvelope(sanitizeGameSnapshot(updated), transitionTime);
      }

      if (input.type === 'accuse') {
        if (phase !== 'accuse') throw invalidPhase('accuse', phase, ['accuse']);
        const accusedPlayer = findPlayer(players, input.playerId);
        if (!accusedPlayer) {
          throw validationError('The accused player is not in this game.', 400, { field: 'playerId' });
        }
        const outcome = SpyGameLogic.resolveAccusation(
          accusedPlayer.displayName,
          spyNamesForRound(round, players)
        );
        const gameValues = {
          currentPhase: outcome.phase,
          currentAccusedPlayerId: accusedPlayer.id,
          currentDeadlineAt: null,
          currentWinner: outcome.winner || null,
          currentReason: outcome.reason || null
        };
        const roundValues = {
          phase: outcome.phase,
          accusedPlayerId: accusedPlayer.id,
          deadlineAt: null,
          winner: outcome.winner || null,
          reason: outcome.reason || null,
          guess: null,
          guesses: outcome.phase === 'spy-guess' ? [] : [],
          guessOrder: outcome.phase === 'spy-guess'
            ? guessOrderForRound(round, players, accusedPlayer.id)
            : [],
          points: outcome.phase === 'result'
            ? pointsRecordsForRound({ ...round, winner: outcome.winner, reason: outcome.reason }, players)
            : []
        };
        if (outcome.phase === 'result') roundValues.completedAt = transitionTime;
        const updated = await updateTransition(tx, {
          game,
          sessionId,
          gameId,
          gameValues,
          roundValues,
          now: transitionTime
        });
        return snapshotEnvelope(sanitizeGameSnapshot(updated), transitionTime);
      }

      if (input.type === 'call-guess') {
        if (phase !== 'round') throw invalidPhase('call-guess', phase, ['round']);
        const caller = findPlayer(players, input.playerId);
        const callerAssignment = caller && assignmentList(round).find((assignment) => (
          String(field(assignment, 'playerId', 'player_id')) === caller.id
        ));
        if (!caller || !callerAssignment || !Boolean(field(callerAssignment, 'isSpy', 'is_spy'))) {
          throw new HttpError(409, 'INVALID_STATE', 'Only a spy can call for a guess.', {});
        }
        const guessOrder = guessOrderForRound(round, players, caller.id);
        const updated = await updateTransition(tx, {
          game,
          sessionId,
          gameId,
          gameValues: {
            currentPhase: 'spy-guess',
            currentDeadlineAt: null,
            currentAccusedPlayerId: null,
            currentWinner: null,
            currentReason: null
          },
          roundValues: {
            phase: 'spy-guess',
            deadlineAt: null,
            accusedPlayerId: null,
            guess: null,
            guesses: [],
            guessOrder,
            winner: null,
            reason: null,
            points: []
          },
          now: transitionTime
        });
        return snapshotEnvelope(sanitizeGameSnapshot(updated), transitionTime);
      }

      if (input.type === 'guess') {
        if (phase !== 'spy-guess') throw invalidPhase('guess', phase, ['spy-guess']);
        const roundSecretMode = secretModeForRound(game, round);
        const boardLocations = field(game, 'boardLocations', 'board_locations');
        const selectedLocation = roundSecretMode === 'deck'
          ? SpyGameLogic.LOCATION_DECK.find((location) => (
            location.name === input.location
            && (!Array.isArray(boardLocations) || boardLocations.includes(location.name))
          ))
          : null;
        const guessValue = roundSecretMode === 'custom'
          ? normalizeCustomSecret(input.location, 'location')
          : selectedLocation && selectedLocation.name;
        if (!guessValue) {
          throw validationError('The guessed location is not available for this game.', 400, {
            field: 'location'
          });
        }
        const accusedPlayerId = field(game, 'currentAccusedPlayerId', 'current_accused_player_id')
          ?? field(round, 'accusedPlayerId', 'accused_player_id');
        const guessOrder = guessOrderForRound(round, players, accusedPlayerId);
        const previousGuesses = guessesForRound(round);
        const expectedGuesserId = guessOrder[previousGuesses.length];
        const submittedGuesserId = input.playerId === undefined
          ? expectedGuesserId
          : String(input.playerId);
        if (!expectedGuesserId || submittedGuesserId !== expectedGuesserId) {
          throw new HttpError(409, 'INVALID_STATE', 'It is not this player\'s turn to guess.', {
            expectedPlayerId: expectedGuesserId || null
          });
        }
        const guesserAssignment = assignmentList(round).find((assignment) => (
          String(field(assignment, 'playerId', 'player_id')) === submittedGuesserId
        ));
        if (!guesserAssignment || !Boolean(field(guesserAssignment, 'isSpy', 'is_spy'))) {
          throw new HttpError(409, 'INVALID_STATE', 'Only a spy can make a spy guess.', {});
        }
        const locationName = String(field(round, 'locationName', 'location_name'));
        const comparableGuess = roundSecretMode === 'custom'
          ? guessValue.toLowerCase()
          : guessValue;
        const comparableLocation = roundSecretMode === 'custom'
          ? normalizeCustomSecret(locationName, 'location').toLowerCase()
          : locationName;
        const nextGuesses = previousGuesses.concat([{
          playerId: submittedGuesserId,
          location: guessValue,
          correct: comparableGuess === comparableLocation
        }]);
        const allSpiesGuessed = nextGuesses.length >= guessOrder.length;
        if (!allSpiesGuessed) {
          const updated = await updateTransition(tx, {
            game,
            sessionId,
            gameId,
            gameValues: {
              currentPhase: 'spy-guess',
              currentDeadlineAt: null
            },
            roundValues: {
              phase: 'spy-guess',
              guesses: nextGuesses,
              guessOrder,
              guess: guessValue
            },
            now: transitionTime
          });
          return snapshotEnvelope(sanitizeGameSnapshot(updated), transitionTime);
        }
        const comparableGuesses = roundSecretMode === 'custom'
          ? nextGuesses.map((entry) => ({
            ...entry,
            location: normalizeCustomSecret(entry.location, 'location').toLowerCase()
          }))
          : nextGuesses;
        const outcome = SpyGameLogic.resolveSpyGuesses(comparableGuesses, comparableLocation);
        const updated = await updateTransition(tx, {
          game,
          sessionId,
          gameId,
          gameValues: {
            currentPhase: 'result',
            currentDeadlineAt: null,
            currentWinner: outcome.winner,
            currentReason: outcome.reason
          },
          roundValues: {
            phase: 'result',
            deadlineAt: null,
            guess: guessValue,
            guesses: nextGuesses,
            guessOrder,
            winner: outcome.winner,
            reason: outcome.reason,
            points: pointsRecordsForRound({
              ...round,
              winner: outcome.winner,
              reason: outcome.reason,
              guesses: nextGuesses
            }, players),
            completedAt: transitionTime
          },
          now: transitionTime
        });
        return snapshotEnvelope(sanitizeGameSnapshot(updated), transitionTime);
      }

      if (input.type === 'replay') {
        if (phase !== 'result') throw invalidPhase('replay', phase, ['result']);
        const roundsTotal = Number(field(game, 'roundLimit', 'round_limit')) || 5;
        const completedRounds = (Array.isArray(game.rounds) ? game.rounds : [])
          .filter((candidate) => field(candidate, 'completedAt', 'completed_at'));
        if (completedRounds.length >= roundsTotal) {
          throw new HttpError(409, 'GAME_COMPLETE', 'The five-round session is complete.', {
            roundsCompleted: completedRounds.length,
            roundsTotal
          });
        }
        const replaySecretMode = secretModeForRecord(game);
        const nextCustomSecret = replaySecretMode === 'custom'
          ? normalizeCustomSecret(input.customSecret)
          : undefined;
        if (replaySecretMode === 'deck' && input.customSecret !== undefined) {
          throw validationError('customSecret is only valid for custom games.', 400, {
            field: 'customSecret'
          });
        }
        if (typeof tx.insertRound !== 'function') {
          throw new TypeError('The store does not implement round creation.');
        }
        const nextRoundNumber = Number(field(game, 'currentRoundNumber', 'current_round_number')) + 1;
        const nextRound = buildRoundRecord({
          game,
          roundNumber: nextRoundNumber,
          random,
          now: transitionTime,
          secretMode: replaySecretMode,
          customSecret: nextCustomSecret,
          excludedLocationName: (game.rounds || []).map((candidate) => (
            field(candidate, 'locationName', 'location_name')
          ))
        });
        await tx.insertRound(nextRound);
        const updated = await updateTransition(tx, {
          game,
          sessionId,
          gameId,
          gameValues: {
            currentRoundNumber: nextRoundNumber,
            currentPhase: 'reveal',
            currentRevealIndex: 0,
            currentDeadlineAt: null,
            currentAccusedPlayerId: null,
            currentWinner: null,
            currentReason: null
          },
          roundValues: null,
          now: transitionTime
        });
        return snapshotEnvelope(sanitizeGameSnapshot(updated), transitionTime);
      }

      throw validationError('Unsupported game action.', 400, { field: 'type' });
    }
  });
}

async function deleteWithinTransaction(tx, values) {
  if (typeof tx.deleteGameWithinTransaction === 'function') {
    return tx.deleteGameWithinTransaction(values);
  }
  if (typeof tx.deleteGame === 'function') return tx.deleteGame(values);
  throw new TypeError('The store does not implement game deletion.');
}

async function deleteGame({ store, sessionId, gameId, now } = {}) {
  if (!store) throw new TypeError('A game store is required.');
  try {
    const result = await transactionFor(store, (tx) => deleteWithinTransaction(tx, {
      sessionId,
      gameId,
      now
    }));
    if (!result || result.notFound) throw new NotFoundError();
    return result;
  } catch (error) {
    if (error instanceof NotFoundError) throw error;
    if (error && error.status === 404) throw new NotFoundError();
    throw error;
  }
}

function sanitizeRoundHistoryItem(round, players) {
  const playerRecords = Array.isArray(players) ? players.map(playerIdentity) : [];
  const accusedPlayer = findPlayer(
    playerRecords,
    field(round, 'accusedPlayerId', 'accused_player_id')
  );
  const spyPlayers = assignmentList(round)
    .filter((assignment) => Boolean(field(assignment, 'isSpy', 'is_spy')))
    .map((assignment) => findPlayer(playerRecords, field(assignment, 'playerId', 'player_id')))
    .filter(Boolean);
  return {
    roundNumber: Number(field(round, 'roundNumber', 'round_number')),
    secretMode: secretModeForRecord(round),
    completedAt: isoOrNull(field(round, 'completedAt', 'completed_at')),
    winner: field(round, 'winner', 'winner') ?? null,
    reason: field(round, 'reason', 'reason') ?? null,
    location: field(round, 'locationName', 'location_name') == null
      ? null
      : String(field(round, 'locationName', 'location_name')),
    category: field(round, 'locationCategory', 'location_category') == null
      ? null
      : String(field(round, 'locationCategory', 'location_category')),
    spyPlayers,
    accusedPlayer: accusedPlayer || null,
    guess: field(round, 'guess', 'guess') == null ? null : String(field(round, 'guess', 'guess')),
    guesses: guessesForRound(round).map((entry) => {
      const guesser = findPlayer(playerRecords, field(entry, 'playerId', 'player_id'));
      return {
        player: guesser || null,
        location: field(entry, 'location', 'location') == null
          ? null
          : String(field(entry, 'location', 'location')),
        correct: Boolean(field(entry, 'correct', 'correct'))
      };
    }).filter((entry) => entry.player),
    roundPoints: roundPointsForPlayers(round, playerRecords).map((entry) => ({
      player: entry.player,
      points: entry.points
    }))
  };
}

async function listRoundHistory({ store, sessionId, gameId, limit, cursor } = {}) {
  if (!store) throw new TypeError('A game store is required.');
  const options = validateRoundListOptions({ limit, cursor });
  let result;
  if (typeof store.listRoundHistory === 'function') {
    result = await store.listRoundHistory({ sessionId, gameId, ...options });
  } else if (typeof store.getGameForSession === 'function') {
    const game = await store.getGameForSession(sessionId, gameId);
    if (game) {
      const rounds = (game.rounds || [])
        .filter((round) => field(round, 'completedAt', 'completed_at'))
        .sort((left, right) => Number(field(right, 'roundNumber', 'round_number'))
          - Number(field(left, 'roundNumber', 'round_number')));
      const afterCursor = options.cursor
        ? rounds.filter((round) => Number(field(round, 'roundNumber', 'round_number')) < options.cursor.roundNumber)
        : rounds;
      const page = afterCursor.slice(0, options.limit + 1);
      const items = page.slice(0, options.limit);
      result = {
        items,
        players: game.players,
        nextCursor: page.length > options.limit && items.length > 0
          ? encodeRoundCursor({ roundNumber: Number(field(items.at(-1), 'roundNumber', 'round_number')) })
          : null
      };
    }
  }
  if (!result) throw new NotFoundError();
  const players = result.players || [];
  return {
    items: (result.items || []).map((round) => sanitizeRoundHistoryItem(round, players)),
    nextCursor: result.nextCursor || null
  };
}

module.exports = {
  NotFoundError,
  buildGameRecord,
  applyCardAction,
  applyGameAction,
  createGame,
  deleteGame,
  getGameSnapshot,
  listGames,
  listRoundHistory,
  sanitizeGameSnapshot,
  serializeGameSnapshot: sanitizeGameSnapshot
};
