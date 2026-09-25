'use strict';

const { HttpError } = require('./http.js');
const {
  DEFAULT_CLEANUP_BATCH_SIZE,
  DEFAULT_CLEANUP_MAX_BATCHES,
  MAX_CLEANUP_BATCH_SIZE,
  MAX_CLEANUP_MAX_BATCHES
} = require('./config.js');
const {
  decodeCursor,
  decodeRoundCursor,
  encodeCursor,
  encodeRoundCursor,
  GAME_UPDATE_FIELDS,
  ROUND_UPDATE_FIELDS
} = require('./validation.js');

function clone(value) {
  if (value instanceof Date) return new Date(value.getTime());
  if (Array.isArray(value)) return value.map(clone);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, clone(child)]));
  }
  return value;
}

function cloneMap(map) {
  return new Map([...map.entries()].map(([key, value]) => [key, clone(value)]));
}

function dateValue(value) {
  const result = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(result.getTime())) throw new TypeError('A valid date is required.');
  return result;
}

function notFound(message = 'Game not found.') {
  return new HttpError(404, 'NOT_FOUND', message, {});
}

function gameSummary(game) {
  return clone({
    id: game.id,
    sessionId: game.sessionId,
    timerSeconds: game.timerSeconds,
    secretMode: game.secretMode,
    roundLimit: game.roundLimit,
    currentRoundNumber: game.currentRoundNumber,
    currentPhase: game.currentPhase,
    currentRevealIndex: game.currentRevealIndex,
    currentDeadlineAt: game.currentDeadlineAt,
    currentAccusedPlayerId: game.currentAccusedPlayerId,
    currentWinner: game.currentWinner,
    currentReason: game.currentReason,
    revision: game.revision,
    createdAt: game.createdAt,
    updatedAt: game.updatedAt,
    players: game.players || []
  });
}

function mutationDate(value) {
  const candidate = value === undefined || value === null ? new Date() : value;
  return dateValue(typeof candidate === 'function' ? candidate() : candidate);
}

function isExpiredRound(game, now) {
  if (!game || game.currentPhase !== 'round') return false;
  const currentRound = (game.rounds || []).find((round) => (
    Number(round.roundNumber) === Number(game.currentRoundNumber)
  ));
  const deadline = game.currentDeadlineAt || (currentRound && currentRound.deadlineAt);
  if (!deadline) return false;
  return dateValue(deadline).getTime() <= now.getTime();
}

function revisionConflict(expectedRevision, actualRevision, currentRecord) {
  const error = new HttpError(409, 'REVISION_CONFLICT', 'Game revision is stale.', {
    expectedRevision,
    actualRevision
  });
  Object.defineProperty(error, 'currentRecord', {
    configurable: true,
    enumerable: false,
    value: clone(currentRecord)
  });
  return error;
}

function postCommitError(error) {
  return { __postCommitError: true, error };
}

function cleanupBounds({ batchSize, maxBatches } = {}) {
  const requestedBatchSize = Number(batchSize);
  const requestedMaxBatches = Number(maxBatches);
  return {
    batchSize: Number.isSafeInteger(requestedBatchSize) && requestedBatchSize > 0
      ? Math.min(requestedBatchSize, MAX_CLEANUP_BATCH_SIZE)
      : DEFAULT_CLEANUP_BATCH_SIZE,
    maxBatches: Number.isSafeInteger(requestedMaxBatches) && requestedMaxBatches > 0
      ? Math.min(requestedMaxBatches, MAX_CLEANUP_MAX_BATCHES)
      : DEFAULT_CLEANUP_MAX_BATCHES
  };
}

function tombstoneRetainedUntil(tombstone) {
  if (tombstone && tombstone.retainedUntil) return dateValue(tombstone.retainedUntil);
  const deletedAt = dateValue(tombstone && tombstone.deletedAt);
  return new Date(deletedAt.getTime() + 90 * 24 * 60 * 60 * 1000);
}

class MemoryStore {
  constructor() {
    this.sessionsById = new Map();
    this.sessionsByHash = new Map();
    this.games = new Map();
    this.players = new Map();
    this.rounds = new Map();
    this.assignments = new Map();
    this.commandReceipts = new Map();
    this.creationReceipts = new Map();
    this.tombstones = new Map();
    this._transactionTail = Promise.resolve();
  }

  get sessions() {
    return [...this.sessionsById.values()].map(clone);
  }

  async withTransaction(work) {
    if (typeof work !== 'function') throw new TypeError('A transaction callback is required.');
    const run = () => this._runTransaction(work);
    const result = this._transactionTail.then(run, run);
    // A failed transaction must not poison the queue for later independent
    // requests. The result promise still carries the original failure.
    this._transactionTail = result.then(() => undefined, () => undefined);
    return result;
  }

  async _runTransaction(work) {

    const backup = {
      sessionsById: cloneMap(this.sessionsById),
      sessionsByHash: cloneMap(this.sessionsByHash),
      games: cloneMap(this.games),
      players: cloneMap(this.players),
      rounds: cloneMap(this.rounds),
      assignments: cloneMap(this.assignments),
      commandReceipts: cloneMap(this.commandReceipts),
      creationReceipts: cloneMap(this.creationReceipts),
      tombstones: cloneMap(this.tombstones)
    };

    try {
      return await work(this);
    } catch (error) {
      this.sessionsById = backup.sessionsById;
      this.sessionsByHash = backup.sessionsByHash;
      this.games = backup.games;
      this.players = backup.players;
      this.rounds = backup.rounds;
      this.assignments = backup.assignments;
      this.commandReceipts = backup.commandReceipts;
      this.creationReceipts = backup.creationReceipts;
      this.tombstones = backup.tombstones;
      throw error;
    }
  }

  async createSession(record) {
    return this.insertSession(record);
  }

  async insertSession(record) {
    if (!record || !record.id || !record.tokenHash) {
      throw new TypeError('A session ID and token hash are required.');
    }
    const session = {
      id: String(record.id),
      tokenHash: String(record.tokenHash),
      createdAt: dateValue(record.createdAt),
      expiresAt: dateValue(record.expiresAt)
    };
    if (this.sessionsById.has(session.id) || this.sessionsByHash.has(session.tokenHash)) {
      throw new HttpError(409, 'CONFLICT', 'Session already exists.', {});
    }
    this.sessionsById.set(session.id, session);
    this.sessionsByHash.set(session.tokenHash, session.id);
    return clone(session);
  }

  async getSessionByTokenHash(tokenHash) {
    const id = this.sessionsByHash.get(tokenHash);
    return id ? clone(this.sessionsById.get(id)) : null;
  }

  async findSessionByTokenHash(tokenHash) {
    return this.getSessionByTokenHash(tokenHash);
  }

  async lockSession(sessionId) {
    return clone(this.sessionsById.get(sessionId) || null);
  }

  async ping() {
    return true;
  }

  async insertGame(record) {
    if (!record || !record.id || !record.sessionId) {
      throw new TypeError('A game ID and session ID are required.');
    }
    if (!this.sessionsById.has(record.sessionId)) {
      throw notFound('Session not found.');
    }
    if (this.games.has(record.id)) {
      throw new HttpError(409, 'CONFLICT', 'Game already exists.', {});
    }

    const game = clone(record);
    game.createdAt = dateValue(game.createdAt);
    game.updatedAt = dateValue(game.updatedAt);
    game.secretMode = game.secretMode === 'custom' ? 'custom' : 'deck';
    game.boardLocations = Array.isArray(game.boardLocations) ? game.boardLocations : null;
    game.players = (game.players || []).map((player) => ({
      id: String(player.id),
      seat: Number(player.seat),
      displayName: String(player.displayName)
    }));
    game.rounds = (game.rounds || []).map((round) => ({
      ...clone(round),
      secretMode: round.secretMode === 'custom' || round.secretMode === 'deck'
        ? round.secretMode
        : game.secretMode,
      startedAt: dateValue(round.startedAt),
      deadlineAt: round.deadlineAt ? dateValue(round.deadlineAt) : null,
      completedAt: round.completedAt ? dateValue(round.completedAt) : null,
      guesses: Array.isArray(round.guesses) ? clone(round.guesses) : [],
      guessOrder: Array.isArray(round.guessOrder) ? clone(round.guessOrder) : [],
      points: Array.isArray(round.points) ? clone(round.points) : [],
      assignments: (round.assignments || []).map((assignment) => ({
        playerId: String(assignment.playerId),
        isSpy: Boolean(assignment.isSpy),
        role: assignment.role == null ? null : String(assignment.role)
      }))
    }));
    this.games.set(game.id, game);
    for (const player of game.players) this.players.set(player.id, { ...clone(player), gameId: game.id });
    for (const round of game.rounds) {
      this.rounds.set(round.id, { ...clone(round), gameId: game.id });
      for (const assignment of round.assignments) {
        this.assignments.set(`${round.id}:${assignment.playerId}`, {
          ...clone(assignment),
          roundId: round.id
        });
      }
    }
    return clone(game);
  }

  async createGameRecord(record) {
    return this.insertGame(record);
  }

  async insertRound(record) {
    if (!record || !record.id || !record.gameId) {
      throw new TypeError('A round ID and game ID are required.');
    }
    const game = this.games.get(record.gameId);
    if (!game) throw notFound();
    if (this.rounds.has(record.id)
      || game.rounds.some((round) => Number(round.roundNumber) === Number(record.roundNumber))) {
      throw new HttpError(409, 'CONFLICT', 'Round already exists.', {});
    }
    const round = {
      ...clone(record),
      id: String(record.id),
      gameId: String(record.gameId),
      roundNumber: Number(record.roundNumber),
      secretMode: record.secretMode === 'custom' || record.secretMode === 'deck'
        ? record.secretMode
        : (game.secretMode === 'custom' ? 'custom' : 'deck'),
      revealIndex: Number(record.revealIndex),
      deadlineAt: record.deadlineAt ? dateValue(record.deadlineAt) : null,
      startedAt: dateValue(record.startedAt),
      completedAt: record.completedAt ? dateValue(record.completedAt) : null,
      guesses: Array.isArray(record.guesses) ? clone(record.guesses) : [],
      guessOrder: Array.isArray(record.guessOrder) ? clone(record.guessOrder) : [],
      points: Array.isArray(record.points) ? clone(record.points) : [],
      assignments: (record.assignments || []).map((assignment) => ({
        roundId: String(record.id),
        playerId: String(assignment.playerId),
        isSpy: Boolean(assignment.isSpy),
        role: assignment.role == null ? null : String(assignment.role)
      }))
    };
    this.rounds.set(round.id, clone(round));
    game.rounds.push(clone(round));
    for (const assignment of round.assignments) {
      this.assignments.set(`${round.id}:${assignment.playerId}`, clone(assignment));
    }
    return clone(round);
  }

  async getGame(gameId) {
    return clone(this.games.get(gameId) || null);
  }

  async getGameForSession(sessionId, gameId) {
    const game = this.games.get(gameId);
    return game && game.sessionId === sessionId ? clone(game) : null;
  }

  async lockOwnedGame(sessionId, gameId) {
    return this.getGameForSession(sessionId, gameId);
  }

  async countGamesForSession(sessionId) {
    let count = 0;
    for (const game of this.games.values()) {
      if (game.sessionId === sessionId) count += 1;
    }
    return count;
  }

  async countActiveGames(sessionId) {
    return this.countGamesForSession(sessionId);
  }

  async cleanupExpiredSessions(options) {
    return this.withTransaction((tx) => tx.cleanupExpiredSessionsWithinTransaction(options));
  }

  async cleanupExpiredTombstones(options) {
    return this.withTransaction((tx) => tx.cleanupExpiredTombstonesWithinTransaction(options));
  }

  async cleanupExpiredData(options) {
    return this.withTransaction((tx) => tx.cleanupExpiredDataWithinTransaction(options));
  }

  async cleanupExpired(options) {
    return this.cleanupExpiredData(options);
  }

  async listGameSummaries({ sessionId, limit = 20, cursor = null } = {}) {
    const cursorValue = typeof cursor === 'string' ? decodeCursor(cursor) : cursor;
    const owned = [...this.games.values()]
      .filter((game) => game.sessionId === sessionId)
      .sort((left, right) => {
        const updatedDifference = right.updatedAt.getTime() - left.updatedAt.getTime();
        return updatedDifference || right.id.localeCompare(left.id);
      });

    const afterCursor = cursorValue
      ? owned.filter((game) => {
        const updatedAt = game.updatedAt.toISOString();
        return updatedAt < cursorValue.updatedAt
          || (updatedAt === cursorValue.updatedAt && game.id < cursorValue.gameId);
      })
      : owned;
    const page = afterCursor.slice(0, limit + 1);
    const hasMore = page.length > limit;
    const items = page.slice(0, limit).map(gameSummary);
    const last = items[items.length - 1];
    return {
      items,
      nextCursor: hasMore && last
        ? encodeCursor({ updatedAt: last.updatedAt.toISOString(), gameId: last.id })
        : null
    };
  }

  async listGames({ sessionId, limit = 20, cursor = null } = {}) {
    const cursorValue = typeof cursor === 'string' ? decodeCursor(cursor) : cursor;
    const owned = [...this.games.values()]
      .filter((game) => game.sessionId === sessionId)
      .sort((left, right) => {
        const updatedDifference = right.updatedAt.getTime() - left.updatedAt.getTime();
        return updatedDifference || right.id.localeCompare(left.id);
      });

    const afterCursor = cursorValue
      ? owned.filter((game) => {
        const updatedAt = game.updatedAt.toISOString();
        return updatedAt < cursorValue.updatedAt
          || (updatedAt === cursorValue.updatedAt && game.id < cursorValue.gameId);
      })
      : owned;
    const page = afterCursor.slice(0, limit + 1);
    const hasMore = page.length > limit;
    const items = page.slice(0, limit).map(clone);
    const last = items[items.length - 1];
    return {
      items,
      nextCursor: hasMore && last
        ? encodeCursor({ updatedAt: last.updatedAt.toISOString(), gameId: last.id })
        : null
    };
  }

  async listRoundHistory({ sessionId, gameId, limit = 20, cursor = null } = {}) {
    const game = this.games.get(gameId);
    if (!game || game.sessionId !== sessionId) return null;
    const cursorValue = cursor && typeof cursor === 'string'
      ? decodeRoundCursor(cursor)
      : cursor;
    const completed = (game.rounds || [])
      .filter((round) => round.completedAt)
      .sort((left, right) => Number(right.roundNumber) - Number(left.roundNumber));
    const afterCursor = cursorValue
      ? completed.filter((round) => Number(round.roundNumber) < Number(cursorValue.roundNumber))
      : completed;
    const page = afterCursor.slice(0, Number(limit) + 1);
    const items = page.slice(0, Number(limit)).map(clone);
    const last = items[items.length - 1];
    return {
      items,
      players: clone(game.players || []),
      nextCursor: page.length > Number(limit) && last
        ? encodeRoundCursor({ roundNumber: Number(last.roundNumber) })
        : null
    };
  }

  async getCreationReceipt(sessionId, idempotencyKey) {
    return clone(this.creationReceipts.get(`${sessionId}:${idempotencyKey}`) || null);
  }

  async findCreationReceipt(sessionId, idempotencyKey) {
    return this.getCreationReceipt(sessionId, idempotencyKey);
  }

  async insertCreationReceipt({ sessionId, idempotencyKey, requestHash, response, gameId, createdAt } = {}) {
    const key = `${sessionId}:${idempotencyKey}`;
    if (this.creationReceipts.has(key)) {
      throw new HttpError(409, 'CONFLICT', 'Creation receipt already exists.', {});
    }
    const receipt = {
      sessionId,
      idempotencyKey,
      requestHash,
      gameId,
      response: clone(response),
      createdAt: dateValue(createdAt || new Date())
    };
    this.creationReceipts.set(key, receipt);
    return clone(receipt);
  }

  async lockGame(gameId) {
    return clone(this.games.get(gameId) || null);
  }

  async updateGame(gameId, values = {}) {
    const game = this.games.get(gameId);
    if (!game) throw notFound();
    const normalizedValues = [];
    for (const [key, value] of Object.entries(values)) {
      const column = GAME_UPDATE_FIELDS[key];
      if (!column) {
        throw new HttpError(400, 'VALIDATION_ERROR', 'Unsupported game update field.', {
          field: key
        });
      }
      const target = {
        session_id: 'sessionId',
        timer_seconds: 'timerSeconds',
        round_limit: 'roundLimit',
        current_round_number: 'currentRoundNumber',
        current_phase: 'currentPhase',
        current_reveal_index: 'currentRevealIndex',
        current_deadline_at: 'currentDeadlineAt',
        current_accused_player_id: 'currentAccusedPlayerId',
        current_winner: 'currentWinner',
        current_reason: 'currentReason',
        revision: 'revision',
        updated_at: 'updatedAt'
      }[column];
      normalizedValues.push({ target, value });
    }
    for (const { target, value } of normalizedValues) {
      if (target === 'updatedAt') {
        game[target] = dateValue(value);
      } else {
        game[target] = clone(value);
      }
    }
    return clone(game);
  }

  async updateRound(roundId, values = {}) {
    const round = this.rounds.get(roundId);
    if (!round) throw notFound();
    const normalizedValues = [];
    const seenColumns = new Set();
    for (const [key, value] of Object.entries(values)) {
      const column = ROUND_UPDATE_FIELDS[key];
      if (!column) {
        throw new HttpError(400, 'VALIDATION_ERROR', 'Unsupported round update field.', {
          field: key
        });
      }
      if (seenColumns.has(column)) {
        throw new HttpError(400, 'VALIDATION_ERROR', 'Duplicate round update field.', {
          field: key
        });
      }
      seenColumns.add(column);
      const target = {
        phase: 'phase',
        reveal_index: 'revealIndex',
        deadline_at: 'deadlineAt',
        accused_player_id: 'accusedPlayerId',
        guess: 'guess',
        guesses: 'guesses',
        guess_order: 'guessOrder',
        guessOrder: 'guessOrder',
        points: 'points',
        winner: 'winner',
        reason: 'reason',
        completed_at: 'completedAt'
      }[column];
      normalizedValues.push({ target, value });
    }

    const applyValues = (targetRound) => {
      for (const { target, value } of normalizedValues) {
        if (['deadlineAt', 'completedAt'].includes(target)) {
          targetRound[target] = value === null || value === undefined ? null : dateValue(value);
        } else {
          targetRound[target] = clone(value);
        }
      }
    };
    applyValues(round);
    const game = this.games.get(round.gameId);
    if (game && Array.isArray(game.rounds)) {
      const nested = game.rounds.find((candidate) => candidate.id === roundId);
      if (nested) applyValues(nested);
    }
    return clone(round);
  }

  async reconcileExpiredRoundWithinTransaction(game, now) {
    const currentTime = mutationDate(now);
    if (!isExpiredRound(game, currentTime)) return game;
    const currentRound = (game.rounds || []).find((round) => (
      Number(round.roundNumber) === Number(game.currentRoundNumber)
    ));
    if (!currentRound) throw new HttpError(500, 'INTERNAL_ERROR', 'Current round is missing.', {});

    await this.updateRound(currentRound.id, {
      phase: 'accuse',
      deadlineAt: null
    });
    await this.updateGame(game.id, {
      currentPhase: 'accuse',
      currentDeadlineAt: null,
      revision: Number(game.revision) + 1,
      updatedAt: currentTime
    });
    return this.getGame(game.id);
  }

  async reconcileExpiredRound({ sessionId, gameId, now } = {}) {
    return this.withTransaction(async (tx) => {
      const game = await tx.lockOwnedGame(sessionId, gameId);
      if (!game) return null;
      return tx.reconcileExpiredRoundWithinTransaction(game, now);
    });
  }

  async deleteGame({ sessionId, gameId, now } = {}) {
    return this.withTransaction((tx) => tx.deleteGameWithinTransaction({ sessionId, gameId, now }));
  }

  removeGameData(gameId) {
    const game = this.games.get(gameId);
    if (!game) return false;
    for (const player of game.players || []) this.players.delete(player.id);
    for (const round of game.rounds || []) {
      this.rounds.delete(round.id);
      for (const assignment of round.assignments || []) {
        this.assignments.delete(`${round.id}:${assignment.playerId}`);
      }
    }
    this.commandReceipts.forEach((receipt, key) => {
      if (receipt.gameId === gameId) this.commandReceipts.delete(key);
    });
    this.creationReceipts.forEach((receipt, key) => {
      if (receipt.gameId === gameId) this.creationReceipts.delete(key);
    });
    this.games.delete(gameId);
    return true;
  }

  async cleanupExpiredSessionsWithinTransaction(options = {}) {
    const currentTime = mutationDate(options.now);
    const bounds = cleanupBounds(options);
    let deleted = 0;

    for (let batch = 0; batch < bounds.maxBatches; batch += 1) {
      const expired = [...this.sessionsById.values()]
        .filter((session) => session.expiresAt.getTime() <= currentTime.getTime())
        .sort((left, right) => left.expiresAt.getTime() - right.expiresAt.getTime()
          || left.id.localeCompare(right.id))
        .slice(0, bounds.batchSize);
      if (expired.length === 0) break;

      for (const session of expired) {
        for (const game of [...this.games.values()]) {
          if (game.sessionId === session.id) this.removeGameData(game.id);
        }
        this.sessionsById.delete(session.id);
        if (this.sessionsByHash.get(session.tokenHash) === session.id) {
          this.sessionsByHash.delete(session.tokenHash);
        }
        deleted += 1;
      }
      if (expired.length < bounds.batchSize) break;
    }
    return deleted;
  }

  async cleanupExpiredTombstonesWithinTransaction(options = {}) {
    const currentTime = mutationDate(options.now);
    const bounds = cleanupBounds(options);
    let deleted = 0;

    for (let batch = 0; batch < bounds.maxBatches; batch += 1) {
      const expired = [...this.tombstones.values()]
        .filter((tombstone) => tombstoneRetainedUntil(tombstone).getTime() <= currentTime.getTime())
        .sort((left, right) => tombstoneRetainedUntil(left).getTime()
          - tombstoneRetainedUntil(right).getTime()
          || left.gameId.localeCompare(right.gameId))
        .slice(0, bounds.batchSize);
      if (expired.length === 0) break;
      for (const tombstone of expired) {
        this.tombstones.delete(tombstone.gameId);
        deleted += 1;
      }
      if (expired.length < bounds.batchSize) break;
    }
    return deleted;
  }

  async cleanupExpiredDataWithinTransaction(options = {}) {
    const sessionsDeleted = await this.cleanupExpiredSessionsWithinTransaction(options);
    const tombstonesDeleted = await this.cleanupExpiredTombstonesWithinTransaction(options);
    return { sessionsDeleted, tombstonesDeleted };
  }

  async deleteGameWithinTransaction({ sessionId, gameId, now } = {}) {
    const game = this.games.get(gameId);
    if (!game) {
      const tombstone = this.tombstones.get(gameId);
      if (tombstone && tombstone.sessionId === sessionId) {
        return { deleted: false, repeated: true };
      }
      throw notFound();
    }
    if (game.sessionId !== sessionId) throw notFound();

    const deletedAt = dateValue(now || new Date());
    this.tombstones.set(gameId, { gameId, sessionId, deletedAt });
    this.removeGameData(gameId);
    return { deleted: true, repeated: false };
  }

  async runMutationTransaction({
    gameId,
    sessionId,
    expectedRevision,
    idempotencyKey,
    requestHash,
    apply,
    now
  } = {}) {
    const result = await this.withTransaction(async (tx) => {
      const game = await tx.lockOwnedGame(sessionId, gameId);
      if (!game) throw notFound();
      const currentTime = mutationDate(now);
      const reconciledGame = await tx.reconcileExpiredRoundWithinTransaction(game, currentTime);
      const didReconcile = reconciledGame.revision !== game.revision;
      const receipt = await tx.getCommandReceipt(sessionId, gameId, idempotencyKey);
      if (receipt) {
        if (receipt.requestHash !== requestHash) {
          const error = new HttpError(400, 'VALIDATION_ERROR', 'Idempotency key was reused for a different request.', {});
          if (didReconcile) return postCommitError(error);
          throw error;
        }
        return clone(receipt.response);
      }
      if (reconciledGame.revision !== expectedRevision) {
        return postCommitError(revisionConflict(
          expectedRevision,
          reconciledGame.revision,
          reconciledGame
        ));
      }
      let response;
      try {
        response = await apply(tx, reconciledGame, currentTime);
      } catch (error) {
        if (didReconcile && ['INVALID_PHASE', 'INVALID_STATE', 'VALIDATION_ERROR'].includes(error && error.code)) {
          return postCommitError(error);
        }
        throw error;
      }
      await tx.insertCommandReceipt({
        sessionId,
        gameId,
        idempotencyKey,
        requestHash,
        response,
        createdAt: currentTime
      });
      return response;
    });
    if (result && result.__postCommitError) throw result.error;
    return result;
  }

  async getCommandReceipt(sessionId, gameId, idempotencyKey) {
    return clone(this.commandReceipts.get(`${gameId}:${idempotencyKey}`) || null);
  }

  async insertCommandReceipt({ sessionId, gameId, idempotencyKey, requestHash, response, createdAt } = {}) {
    const key = `${gameId}:${idempotencyKey}`;
    if (this.commandReceipts.has(key)) {
      throw new HttpError(409, 'CONFLICT', 'Command receipt already exists.', {});
    }
    const receipt = {
      sessionId,
      gameId,
      idempotencyKey,
      requestHash,
      response: clone(response),
      createdAt: dateValue(createdAt || new Date())
    };
    this.commandReceipts.set(key, receipt);
    return clone(receipt);
  }
}

function createMemoryStore(options) {
  return new MemoryStore(options);
}

module.exports = {
  InMemoryStore: MemoryStore,
  MemoryStore,
  createMemoryStore,
  clone
};
