'use strict';

const {
  ConfigurationError,
  DEFAULT_CLEANUP_BATCH_SIZE,
  DEFAULT_CLEANUP_MAX_BATCHES,
  MAX_CLEANUP_BATCH_SIZE,
  MAX_CLEANUP_MAX_BATCHES
} = require('./config.js');
const { HttpError } = require('./http.js');
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

function asDate(value) {
  if (value === undefined || value === null) return null;
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function rowsOf(result) {
  return result && Array.isArray(result.rows) ? result.rows : [];
}

function mapSession(row) {
  if (!row) return null;
  return {
    id: row.id,
    tokenHash: row.token_hash ?? row.tokenHash,
    createdAt: asDate(row.created_at ?? row.createdAt),
    expiresAt: asDate(row.expires_at ?? row.expiresAt)
  };
}

function mapGame(row) {
  if (!row) return null;
  return {
    id: row.id,
    sessionId: row.session_id ?? row.sessionId,
    timerSeconds: Number(row.timer_seconds ?? row.timerSeconds),
    secretMode: row.secret_mode ?? row.secretMode ?? 'deck',
    roundLimit: Number(row.round_limit ?? row.roundLimit ?? 5),
    currentRoundNumber: Number(row.current_round_number ?? row.currentRoundNumber),
    currentPhase: row.current_phase ?? row.currentPhase,
    currentRevealIndex: Number(row.current_reveal_index ?? row.currentRevealIndex),
    currentDeadlineAt: asDate(row.current_deadline_at ?? row.currentDeadlineAt),
    currentAccusedPlayerId: row.current_accused_player_id ?? row.currentAccusedPlayerId ?? null,
    currentWinner: row.current_winner ?? row.currentWinner ?? null,
    currentReason: row.current_reason ?? row.currentReason ?? null,
    revision: Number(row.revision),
    createdAt: asDate(row.created_at ?? row.createdAt),
    updatedAt: asDate(row.updated_at ?? row.updatedAt),
    players: [],
    rounds: []
  };
}

function mapPlayer(row) {
  return {
    id: row.id,
    gameId: row.game_id ?? row.gameId,
    seat: Number(row.seat),
    displayName: row.display_name ?? row.displayName
  };
}

function mapRound(row) {
  return {
    id: row.id,
    gameId: row.game_id ?? row.gameId,
    roundNumber: Number(row.round_number ?? row.roundNumber),
    secretMode: row.secret_mode ?? row.secretMode ?? 'deck',
    locationName: row.location_name ?? row.locationName,
    locationCategory: row.location_category ?? row.locationCategory,
    phase: row.phase,
    revealIndex: Number(row.reveal_index ?? row.revealIndex),
    deadlineAt: asDate(row.deadline_at ?? row.deadlineAt),
    accusedPlayerId: row.accused_player_id ?? row.accusedPlayerId ?? null,
    guess: row.guess ?? null,
    guesses: jsonValue(row.guesses) || [],
    guessOrder: jsonValue(row.guess_order ?? row.guessOrder) || [],
    points: jsonValue(row.points) || [],
    winner: row.winner ?? null,
    reason: row.reason ?? null,
    startedAt: asDate(row.started_at ?? row.startedAt),
    completedAt: asDate(row.completed_at ?? row.completedAt),
    assignments: []
  };
}

function mapAssignment(row) {
  return {
    roundId: row.round_id ?? row.roundId,
    playerId: row.player_id ?? row.playerId,
    isSpy: Boolean(row.is_spy ?? row.isSpy)
  };
}

function jsonValue(value) {
  if (typeof value !== 'string') return clone(value);
  try {
    return JSON.parse(value);
  } catch (error) {
    return value;
  }
}

function notFound() {
  return new HttpError(404, 'NOT_FOUND', 'Game not found.', {});
}

function mutationDate(value) {
  const candidate = value === undefined || value === null
    ? new Date()
    : (typeof value === 'function' ? value() : value);
  const date = candidate instanceof Date ? new Date(candidate.getTime()) : new Date(candidate);
  if (Number.isNaN(date.getTime())) throw new TypeError('now must be a valid date.');
  return date;
}

function isExpiredRound(game, now) {
  if (!game || game.currentPhase !== 'round') return false;
  const currentRound = (game.rounds || []).find((round) => (
    Number(round.roundNumber) === Number(game.currentRoundNumber)
  ));
  const deadline = game.currentDeadlineAt || (currentRound && currentRound.deadlineAt);
  return Boolean(deadline && asDate(deadline) && asDate(deadline).getTime() <= now.getTime());
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

function mapDatabaseError(error) {
  if (!error || error.status || error instanceof HttpError) return error;
  if (error.code === '23505') {
    return new HttpError(409, 'CONFLICT', 'The request conflicts with existing game data.', {});
  }
  if (error.code === '23503' || error.code === '23514') {
    return new HttpError(400, 'VALIDATION_ERROR', 'Game data failed database validation.', {});
  }
  if (error.code === '22P02') {
    return notFound();
  }
  return error;
}

class PostgresTransaction {
  constructor(client) {
    this.client = client;
  }

  query(sql, parameters) {
    return this.client.query(sql, parameters);
  }

  async lockSession(sessionId) {
    const result = await this.query(
      `SELECT id, token_hash, created_at, expires_at
       FROM sessions
       WHERE id = $1
       FOR UPDATE`,
      [sessionId]
    );
    return rowsOf(result).length > 0 ? mapSession(rowsOf(result)[0]) : null;
  }

  async ping() {
    await this.query('SELECT 1 AS ready');
    return true;
  }

  async countGamesForSession(sessionId) {
    const result = await this.query(
      'SELECT COUNT(*)::int AS count FROM games WHERE session_id = $1',
      [sessionId]
    );
    return Number(rowsOf(result)[0] && rowsOf(result)[0].count || 0);
  }

  async countActiveGames(sessionId) {
    return this.countGamesForSession(sessionId);
  }

  async cleanupExpiredSessionsWithinTransaction(options = {}) {
    const currentTime = mutationDate(options.now);
    const bounds = cleanupBounds(options);
    let deleted = 0;

    for (let batch = 0; batch < bounds.maxBatches; batch += 1) {
      const result = await this.query(
        `WITH expired_sessions AS (
           SELECT id
           FROM sessions
           WHERE expires_at <= $1
           ORDER BY expires_at ASC, id ASC
           LIMIT $2
         )
         DELETE FROM sessions
         WHERE id IN (SELECT id FROM expired_sessions)`,
        [currentTime, bounds.batchSize]
      );
      const batchDeleted = Number(result && result.rowCount) || 0;
      deleted += batchDeleted;
      if (batchDeleted < bounds.batchSize) break;
    }
    return deleted;
  }

  async cleanupExpiredTombstonesWithinTransaction(options = {}) {
    const currentTime = mutationDate(options.now);
    const bounds = cleanupBounds(options);
    let deleted = 0;

    for (let batch = 0; batch < bounds.maxBatches; batch += 1) {
      const result = await this.query(
        `WITH expired_tombstones AS (
           SELECT game_id
           FROM game_tombstones
           WHERE retained_until <= $1
           ORDER BY retained_until ASC, game_id ASC
           LIMIT $2
         )
         DELETE FROM game_tombstones
         WHERE game_id IN (SELECT game_id FROM expired_tombstones)`,
        [currentTime, bounds.batchSize]
      );
      const batchDeleted = Number(result && result.rowCount) || 0;
      deleted += batchDeleted;
      if (batchDeleted < bounds.batchSize) break;
    }
    return deleted;
  }

  async cleanupExpiredDataWithinTransaction(options = {}) {
    const sessionsDeleted = await this.cleanupExpiredSessionsWithinTransaction(options);
    const tombstonesDeleted = await this.cleanupExpiredTombstonesWithinTransaction(options);
    return { sessionsDeleted, tombstonesDeleted };
  }

  async cleanupExpiredSessions(options) {
    return this.cleanupExpiredSessionsWithinTransaction(options);
  }

  async cleanupExpiredTombstones(options) {
    return this.cleanupExpiredTombstonesWithinTransaction(options);
  }

  async cleanupExpiredData(options) {
    return this.cleanupExpiredDataWithinTransaction(options);
  }

  async cleanupExpired(options) {
    return this.cleanupExpiredData(options);
  }

  async getCreationReceipt(sessionId, idempotencyKey) {
    const result = await this.query(
      `SELECT session_id, idempotency_key, request_hash, game_id, response_json, created_at
       FROM creation_receipts
       WHERE session_id = $1 AND idempotency_key = $2`,
      [sessionId, idempotencyKey]
    );
    if (rowsOf(result).length === 0) return null;
    const row = rowsOf(result)[0];
    return {
      sessionId: row.session_id,
      idempotencyKey: row.idempotency_key,
      requestHash: row.request_hash,
      gameId: row.game_id,
      response: jsonValue(row.response_json),
      createdAt: asDate(row.created_at)
    };
  }

  async findCreationReceipt(sessionId, idempotencyKey) {
    return this.getCreationReceipt(sessionId, idempotencyKey);
  }

  async insertCreationReceipt({ sessionId, idempotencyKey, requestHash, gameId, response, createdAt } = {}) {
    await this.query(
      `INSERT INTO creation_receipts
       (session_id, idempotency_key, request_hash, game_id, response_json, created_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6)`,
      [sessionId, idempotencyKey, requestHash, gameId, JSON.stringify(response), createdAt || new Date()]
    );
    return { sessionId, idempotencyKey, requestHash, gameId, response: clone(response), createdAt };
  }

  async insertGame(record) {
    await this.query(
      `INSERT INTO games
       (id, session_id, timer_seconds, secret_mode, round_limit, current_round_number, current_phase,
        current_reveal_index, current_deadline_at, current_accused_player_id,
        current_winner, current_reason, revision, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
      [
        record.id,
        record.sessionId,
        record.timerSeconds,
        record.secretMode || 'deck',
        record.roundLimit || 5,
        record.currentRoundNumber,
        record.currentPhase,
        record.currentRevealIndex,
        record.currentDeadlineAt,
        record.currentAccusedPlayerId,
        record.currentWinner,
        record.currentReason,
        record.revision,
        record.createdAt,
        record.updatedAt
      ]
    );

    for (const player of record.players || []) {
      await this.query(
        `INSERT INTO players (id, game_id, seat, display_name)
         VALUES ($1, $2, $3, $4)`,
        [player.id, record.id, player.seat, player.displayName]
      );
    }

    for (const round of record.rounds || []) {
      await this.query(
        `INSERT INTO rounds
         (id, game_id, round_number, secret_mode, location_name, location_category, phase,
          reveal_index, deadline_at, accused_player_id, guess, guesses, guess_order,
          points, winner, reason, started_at, completed_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13::jsonb,
                 $14::jsonb, $15, $16, $17, $18)`,
        [
          round.id,
          record.id,
          round.roundNumber,
          round.secretMode || record.secretMode || 'deck',
          round.locationName,
          round.locationCategory,
          round.phase,
          round.revealIndex,
          round.deadlineAt,
          round.accusedPlayerId,
          round.guess,
          JSON.stringify(round.guesses || []),
          JSON.stringify(round.guessOrder || []),
          JSON.stringify(round.points || []),
          round.winner,
          round.reason,
          round.startedAt,
          round.completedAt
        ]
      );
      for (const assignment of round.assignments || []) {
        await this.query(
          `INSERT INTO assignments (round_id, player_id, is_spy)
           VALUES ($1, $2, $3)`,
          [round.id, assignment.playerId, assignment.isSpy]
        );
      }
    }
    return clone(record);
  }

  async createGameRecord(record) {
    return this.insertGame(record);
  }

  async insertRound(round) {
    await this.query(
      `INSERT INTO rounds
       (id, game_id, round_number, secret_mode, location_name, location_category, phase,
        reveal_index, deadline_at, accused_player_id, guess, guesses, guess_order,
        points, winner, reason, started_at, completed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13::jsonb,
               $14::jsonb, $15, $16, $17, $18)`,
      [
        round.id,
        round.gameId,
        round.roundNumber,
        round.secretMode || 'deck',
        round.locationName,
        round.locationCategory,
        round.phase,
        round.revealIndex,
        round.deadlineAt,
        round.accusedPlayerId,
        round.guess,
        JSON.stringify(round.guesses || []),
        JSON.stringify(round.guessOrder || []),
        JSON.stringify(round.points || []),
        round.winner,
        round.reason,
        round.startedAt,
        round.completedAt
      ]
    );
    for (const assignment of round.assignments || []) {
      await this.query(
        `INSERT INTO assignments (round_id, player_id, is_spy)
         VALUES ($1, $2, $3)`,
        [round.id, assignment.playerId, assignment.isSpy]
      );
    }
    return clone(round);
  }

  async fetchGame(gameId, sessionId, { forUpdate = false } = {}) {
    const ownership = sessionId === undefined ? '' : ' AND session_id = $2';
    const parameters = sessionId === undefined ? [gameId] : [gameId, sessionId];
    const lock = forUpdate ? ' FOR UPDATE' : '';
    const result = await this.query(
      `SELECT id, session_id, timer_seconds, secret_mode, round_limit, current_round_number, current_phase,
              current_reveal_index, current_deadline_at, current_accused_player_id,
              current_winner, current_reason, revision, created_at, updated_at
       FROM games
       WHERE id = $1${ownership}${lock}`,
      parameters
    );
    if (rowsOf(result).length === 0) return null;
    const game = mapGame(rowsOf(result)[0]);
    const players = await this.query(
      `SELECT id, game_id, seat, display_name
       FROM players
       WHERE game_id = $1
       ORDER BY seat ASC`,
      [game.id]
    );
    game.players = rowsOf(players).map(mapPlayer);
    const rounds = await this.query(
      `SELECT id, game_id, round_number, secret_mode, location_name, location_category, phase,
              reveal_index, deadline_at, accused_player_id, guess, guesses, guess_order,
              points, winner, reason,
              started_at, completed_at
       FROM rounds
       WHERE game_id = $1
       ORDER BY round_number ASC`,
      [game.id]
    );
    game.rounds = [];
    for (const row of rowsOf(rounds)) {
      const round = mapRound(row);
      const assignments = await this.query(
        `SELECT round_id, player_id, is_spy
         FROM assignments
         WHERE round_id = $1`,
        [round.id]
      );
      round.assignments = rowsOf(assignments).map(mapAssignment);
      game.rounds.push(round);
    }
    return game;
  }

  async getGameForSession(sessionId, gameId) {
    return this.fetchGame(gameId, sessionId);
  }

  async lockOwnedGame(sessionId, gameId) {
    return this.fetchGame(gameId, sessionId, { forUpdate: true });
  }

  async lockGame(gameId) {
    return this.fetchGame(gameId, undefined, { forUpdate: true });
  }

  async listGameSummaries({ sessionId, limit = 20, cursor = null } = {}) {
    const cursorValue = typeof cursor === 'string' ? decodeCursor(cursor) : cursor;
    const parameters = [sessionId];
    let where = 'g.session_id = $1';
    if (cursorValue) {
      parameters.push(new Date(cursorValue.updatedAt), cursorValue.gameId);
      where += ` AND (g.updated_at, g.id) < ($${parameters.length - 1}, $${parameters.length})`;
    }
    parameters.push(Number(limit) + 1);
    const result = await this.query(
      `SELECT g.id, g.session_id, g.timer_seconds, g.secret_mode, g.round_limit,
              g.current_round_number, g.current_phase, g.current_reveal_index,
              g.current_deadline_at, g.current_accused_player_id,
              g.current_winner, g.current_reason, g.revision,
              g.created_at, g.updated_at,
              COALESCE(
                (SELECT json_agg(
                   json_build_object(
                     'id', p.id,
                     'gameId', p.game_id,
                     'seat', p.seat,
                     'displayName', p.display_name
                   ) ORDER BY p.seat ASC
                 )
                 FROM players p
                 WHERE p.game_id = g.id),
                '[]'::json
              ) AS players
       FROM games g
       WHERE ${where}
       ORDER BY g.updated_at DESC, g.id DESC
       LIMIT $${parameters.length}`,
      parameters
    );
    const items = rowsOf(result).slice(0, Number(limit) + 1).map((row) => {
      const game = mapGame(row);
      const players = jsonValue(row.players);
      game.players = Array.isArray(players) ? players.map(mapPlayer) : [];
      return game;
    });
    const hasMore = items.length > Number(limit);
    const page = items.slice(0, Number(limit));
    const last = page[page.length - 1];
    return {
      items: page,
      nextCursor: hasMore && last
        ? encodeCursor({ updatedAt: last.updatedAt.toISOString(), gameId: last.id })
        : null
    };
  }

  async listRoundHistory({ sessionId, gameId, limit = 20, cursor = null } = {}) {
    const cursorValue = typeof cursor === 'string' ? decodeRoundCursor(cursor) : cursor;
    const ownedGame = await this.query(
      `SELECT id
       FROM games
       WHERE id = $1 AND session_id = $2`,
      [gameId, sessionId]
    );
    if (rowsOf(ownedGame).length === 0) return null;

    const playersResult = await this.query(
      `SELECT id, game_id, seat, display_name
       FROM players
       WHERE game_id = $1
       ORDER BY seat ASC`,
      [gameId]
    );
    const parameters = [gameId];
    let cursorClause = '';
    if (cursorValue) {
      parameters.push(Number(cursorValue.roundNumber));
      cursorClause = ` AND round_number < $${parameters.length}`;
    }
    parameters.push(Number(limit) + 1);
    const roundsResult = await this.query(
      `SELECT id, game_id, round_number, secret_mode, location_name, location_category, phase,
              reveal_index, deadline_at, accused_player_id, guess, guesses, guess_order,
              points, winner, reason,
              started_at, completed_at
       FROM rounds
       WHERE game_id = $1 AND completed_at IS NOT NULL${cursorClause}
       ORDER BY round_number DESC
       LIMIT $${parameters.length}`,
      parameters
    );
    const rows = rowsOf(roundsResult);
    const items = [];
    for (const row of rows) {
      const round = mapRound(row);
      const assignments = await this.query(
        `SELECT round_id, player_id, is_spy
         FROM assignments
         WHERE round_id = $1`,
        [round.id]
      );
      round.assignments = rowsOf(assignments).map(mapAssignment);
      items.push(round);
    }
    const hasMore = items.length > Number(limit);
    const page = items.slice(0, Number(limit));
    const last = page[page.length - 1];
    return {
      items: page,
      players: rowsOf(playersResult).map(mapPlayer),
      nextCursor: hasMore && last
        ? encodeRoundCursor({ roundNumber: last.roundNumber })
        : null
    };
  }

  async getCommandReceipt(sessionId, gameId, idempotencyKey) {
    const result = await this.query(
      `SELECT session_id, game_id, idempotency_key, request_hash, response_json, created_at
       FROM command_receipts
       WHERE session_id = $1 AND game_id = $2 AND idempotency_key = $3`,
      [sessionId, gameId, idempotencyKey]
    );
    if (rowsOf(result).length === 0) return null;
    const row = rowsOf(result)[0];
    return {
      sessionId: row.session_id,
      gameId: row.game_id,
      idempotencyKey: row.idempotency_key,
      requestHash: row.request_hash,
      response: jsonValue(row.response_json),
      createdAt: asDate(row.created_at)
    };
  }

  async insertCommandReceipt({ sessionId, gameId, idempotencyKey, requestHash, response, createdAt } = {}) {
    await this.query(
      `INSERT INTO command_receipts
       (session_id, game_id, idempotency_key, request_hash, response_json, created_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6)`,
      [sessionId, gameId, idempotencyKey, requestHash, JSON.stringify(response), createdAt || new Date()]
    );
    return { sessionId, gameId, idempotencyKey, requestHash, response: clone(response), createdAt };
  }

  async deleteGameWithinTransaction({ sessionId, gameId, now } = {}) {
    // Lock by ID first so a foreign session receives the same not-found result
    // as an unknown ID without learning whether a tombstone is present.
    const liveResult = await this.query(
      `SELECT id, session_id
       FROM games
       WHERE id = $1
       FOR UPDATE`,
      [gameId]
    );
    const liveRows = rowsOf(liveResult);
    if (liveRows.length === 0) {
      const tombstone = await this.query(
        `SELECT game_id, session_id, deleted_at
         FROM game_tombstones
         WHERE game_id = $1`,
        [gameId]
      );
      if (rowsOf(tombstone).length > 0 && rowsOf(tombstone)[0].session_id === sessionId) {
        return { deleted: false, repeated: true };
      }
      throw notFound();
    }
    if (liveRows[0].session_id !== sessionId) throw notFound();

    const deletedAt = now || new Date();
    await this.query(
      `INSERT INTO game_tombstones (game_id, session_id, deleted_at)
       VALUES ($1, $2, $3)`,
      [gameId, sessionId, deletedAt]
    );
    await this.query(
      `DELETE FROM assignments
       WHERE round_id IN (SELECT id FROM rounds WHERE game_id = $1)`,
      [gameId]
    );
    await this.query('DELETE FROM rounds WHERE game_id = $1', [gameId]);
    await this.query('DELETE FROM players WHERE game_id = $1', [gameId]);
    await this.query('DELETE FROM command_receipts WHERE game_id = $1', [gameId]);
    await this.query('DELETE FROM creation_receipts WHERE game_id = $1', [gameId]);
    await this.query('DELETE FROM games WHERE id = $1 AND session_id = $2', [gameId, sessionId]);
    return { deleted: true, repeated: false };
  }

  async updateGame(gameId, values) {
    const normalizedValues = [];
    const seenColumns = new Set();
    for (const [column, value] of Object.entries(values || {})) {
      const sqlColumn = GAME_UPDATE_FIELDS[column];
      if (!sqlColumn) {
        throw new HttpError(400, 'VALIDATION_ERROR', 'Unsupported game update field.', {
          field: column
        });
      }
      if (seenColumns.has(sqlColumn)) {
        throw new HttpError(400, 'VALIDATION_ERROR', 'Duplicate game update field.', {
          field: column
        });
      }
      seenColumns.add(sqlColumn);
      normalizedValues.push({ sqlColumn, value });
    }
    if (normalizedValues.length === 0) return;
    const parameters = [gameId, ...normalizedValues.map(({ value }) => value)];
    const assignments = normalizedValues.map(({ sqlColumn }, index) => (
      `${sqlColumn} = $${index + 2}`
    ));
    if (!seenColumns.has('updated_at')) assignments.push('updated_at = now()');
    await this.query(
      `UPDATE games SET ${assignments.join(', ')} WHERE id = $1`,
      parameters
    );
  }

  async updateRound(roundId, values) {
    const normalizedValues = [];
    const seenColumns = new Set();
    for (const [column, value] of Object.entries(values || {})) {
      const sqlColumn = ROUND_UPDATE_FIELDS[column];
      if (!sqlColumn) {
        throw new HttpError(400, 'VALIDATION_ERROR', 'Unsupported round update field.', {
          field: column
        });
      }
      if (seenColumns.has(sqlColumn)) {
        throw new HttpError(400, 'VALIDATION_ERROR', 'Duplicate round update field.', {
          field: column
        });
      }
      seenColumns.add(sqlColumn);
      normalizedValues.push({ sqlColumn, value });
    }
    if (normalizedValues.length === 0) return;
    const jsonColumns = new Set(['guesses', 'guess_order', 'points']);
    const parameters = [roundId, ...normalizedValues.map(({ sqlColumn, value }) => (
      jsonColumns.has(sqlColumn) ? JSON.stringify(value || []) : value
    ))];
    const assignments = normalizedValues.map(({ sqlColumn }, index) => (
      `${sqlColumn} = $${index + 2}${jsonColumns.has(sqlColumn) ? '::jsonb' : ''}`
    ));
    await this.query(
      `UPDATE rounds SET ${assignments.join(', ')} WHERE id = $1`,
      parameters
    );
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
    game.currentPhase = 'accuse';
    game.currentDeadlineAt = null;
    game.revision = Number(game.revision) + 1;
    game.updatedAt = currentTime;
    currentRound.phase = 'accuse';
    currentRound.deadlineAt = null;
    return game;
  }
}

class PostgresStore {
  constructor({ databaseUrl, env, Client, client, clientFactory, releaseClient } = {}) {
    const source = env || {};
    this.databaseUrl = databaseUrl ?? source.databaseUrl ?? source.DATABASE_URL ?? '';
    this.Client = Client || null;
    this.client = client || null;
    this.clientFactory = clientFactory || null;
    this.releaseClient = releaseClient || null;
  }

  requireDatabaseUrl() {
    if (typeof this.databaseUrl !== 'string' || !this.databaseUrl.trim()) {
      throw new ConfigurationError('DATABASE_URL is required for Postgres game storage.', {
        missing: ['DATABASE_URL']
      });
    }
    return this.databaseUrl.trim();
  }

  loadClient() {
    if (this.Client) return this.Client;
    try {
      this.Client = require('@neondatabase/serverless').Client;
      return this.Client;
    } catch (error) {
      const dependencyError = new Error(
        'The Postgres driver is not installed. Run npm install before using the game API.'
      );
      dependencyError.code = 'MISSING_POSTGRES_DRIVER';
      dependencyError.cause = error;
      throw dependencyError;
    }
  }

  async acquireClient() {
    if (this.client) {
      return {
        client: this.client,
        release: this.releaseClient || (() => {})
      };
    }
    if (this.clientFactory) {
      const created = await this.clientFactory({ connectionString: this.requireDatabaseUrl() });
      if (created && created.client) {
        return {
          client: created.client,
          release: created.release
            || (typeof created.client.release === 'function'
              ? () => created.client.release()
              : (() => {}))
        };
      }
      if (created && typeof created.connect === 'function') await created.connect();
      return {
        client: created,
        release: created && typeof created.release === 'function'
          ? () => created.release()
          : (() => {})
      };
    }
    const connectionString = this.requireDatabaseUrl();
    const Client = this.loadClient();
    const client = new Client({ connectionString });
    if (typeof client.connect === 'function') await client.connect();
    return {
      client,
      release: async () => {
        if (typeof client.end === 'function') await client.end();
      }
    };
  }

  async withClient(work) {
    const connection = await this.acquireClient();
    try {
      return await work(connection.client);
    } catch (error) {
      throw mapDatabaseError(error);
    } finally {
      await connection.release();
    }
  }

  /**
   * Run work on one checked-out client. All state-changing repository methods
   * use this boundary so BEGIN, COMMIT, ROLLBACK, row locks, and receipts share
   * one Postgres transaction rather than independent pooled statements.
   */
  async withTransaction(work) {
    if (typeof work !== 'function') throw new TypeError('A transaction callback is required.');
    const connection = await this.acquireClient();
    const client = connection.client;
    try {
      await client.query('BEGIN');
      const transaction = new PostgresTransaction(client);
      const result = await work(transaction);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        error.rollbackError = rollbackError;
      }
      throw mapDatabaseError(error);
    } finally {
      await connection.release();
    }
  }

  async createSession(record) {
    return this.withTransaction(async (tx) => {
      await tx.query(
        `INSERT INTO sessions (id, token_hash, created_at, expires_at)
         VALUES ($1, $2, $3, $4)`,
        [record.id, record.tokenHash, record.createdAt, record.expiresAt]
      );
      return clone(record);
    });
  }

  async insertSession(record) {
    return this.createSession(record);
  }

  async getSessionByTokenHash(tokenHash) {
    return this.withClient(async (client) => {
      const result = await client.query(
        `SELECT id, token_hash, created_at, expires_at
         FROM sessions
         WHERE token_hash = $1
         LIMIT 1`,
        [tokenHash]
      );
      return rowsOf(result).length > 0 ? mapSession(rowsOf(result)[0]) : null;
    });
  }

  async findSessionByTokenHash(tokenHash) {
    return this.getSessionByTokenHash(tokenHash);
  }

  async ping() {
    return this.withClient((client) => new PostgresTransaction(client).ping());
  }

  async countGamesForSession(sessionId) {
    return this.withClient((client) => new PostgresTransaction(client).countGamesForSession(sessionId));
  }

  async countActiveGames(sessionId) {
    return this.countGamesForSession(sessionId);
  }

  async cleanupExpiredSessions(options) {
    return this.withTransaction((tx) => tx.cleanupExpiredSessions(options));
  }

  async cleanupExpiredTombstones(options) {
    return this.withTransaction((tx) => tx.cleanupExpiredTombstones(options));
  }

  async cleanupExpiredData(options) {
    return this.withTransaction((tx) => tx.cleanupExpiredData(options));
  }

  async cleanupExpired(options) {
    return this.cleanupExpiredData(options);
  }

  async insertGame(record) {
    return this.withTransaction((tx) => tx.insertGame(record));
  }

  async createGameRecord(record) {
    return this.insertGame(record);
  }

  async getGameForSession(sessionId, gameId) {
    return this.withClient(async (client) => {
      return new PostgresTransaction(client).getGameForSession(sessionId, gameId);
    });
  }

  async getGame(gameId) {
    return this.withClient(async (client) => {
      return new PostgresTransaction(client).fetchGame(gameId);
    });
  }

  async listGameSummaries({ sessionId, limit = 20, cursor = null } = {}) {
    return this.withClient(async (client) => {
      return new PostgresTransaction(client).listGameSummaries({ sessionId, limit, cursor });
    });
  }

  async listGames({ sessionId, limit = 20, cursor = null } = {}) {
    const cursorValue = typeof cursor === 'string' ? decodeCursor(cursor) : cursor;
    return this.withClient(async (client) => {
      const parameters = [sessionId];
      let where = 'session_id = $1';
      if (cursorValue) {
        parameters.push(new Date(cursorValue.updatedAt), cursorValue.gameId);
        where += ` AND (updated_at, id) < ($${parameters.length - 1}, $${parameters.length})`;
      }
      parameters.push(Number(limit) + 1);
      const result = await client.query(
        `SELECT id, session_id, timer_seconds, secret_mode, round_limit, current_round_number, current_phase,
                current_reveal_index, current_deadline_at, current_accused_player_id,
                current_winner, current_reason, revision, created_at, updated_at
         FROM games
         WHERE ${where}
         ORDER BY updated_at DESC, id DESC
         LIMIT $${parameters.length}`,
        parameters
      );
      const transaction = new PostgresTransaction(client);
      const rows = [];
      for (const row of rowsOf(result).slice(0, limit + 1)) {
        const game = mapGame(row);
        const hydrated = await transaction.fetchGame(game.id, sessionId);
        rows.push(hydrated || game);
      }
      const hasMore = rows.length > limit;
      const items = rows.slice(0, limit);
      const last = items[items.length - 1];
      return {
        items,
        nextCursor: hasMore && last
          ? encodeCursor({ updatedAt: last.updatedAt.toISOString(), gameId: last.id })
          : null
      };
    });
  }

  async listRoundHistory({ sessionId, gameId, limit = 20, cursor = null } = {}) {
    return this.withClient(async (client) => {
      const transaction = new PostgresTransaction(client);
      return transaction.listRoundHistory({ sessionId, gameId, limit, cursor });
    });
  }

  async deleteGame(values) {
    return this.withTransaction((tx) => tx.deleteGameWithinTransaction(values));
  }

  async reconcileExpiredRound({ sessionId, gameId, now } = {}) {
    return this.withTransaction(async (tx) => {
      const game = await tx.lockOwnedGame(sessionId, gameId);
      if (!game) return null;
      return tx.reconcileExpiredRoundWithinTransaction(game, now);
    });
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
      // The receipt lookup deliberately precedes the revision check. A retry
      // of a committed intent must replay even when the caller's UI is stale.
      const game = await tx.lockOwnedGame(sessionId, gameId);
      if (!game) throw notFound();
      const currentTime = mutationDate(now);
      const originalRevision = Number(game.revision);
      const reconciledGame = await tx.reconcileExpiredRoundWithinTransaction(game, currentTime);
      const didReconcile = Number(reconciledGame.revision) !== originalRevision;
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
}

module.exports = {
  createPostgresStore: (options) => new PostgresStore(options),
  PostgresStore,
  PostgresTransaction,
  mapDatabaseError
};
