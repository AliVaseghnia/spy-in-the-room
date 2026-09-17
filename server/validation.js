'use strict';

const crypto = require('node:crypto');

const { validatePlayers } = require('../game-logic.js');
const { HttpError, validationError } = require('./http.js');

const MAX_BODY_BYTES = 65536;
const MAX_IDEMPOTENCY_KEY_BYTES = 256;
const DEFAULT_LIST_LIMIT = 20;
const MAX_LIST_LIMIT = 100;
const MAX_ROUND_NUMBER = 2147483647;
const MAX_CUSTOM_SECRET_LENGTH = 80;
const SUPPORTED_SECRET_MODES = Object.freeze(['deck', 'custom']);
const SUPPORTED_TIMER_SECONDS = Object.freeze([180, 300, 480]);
const SUPPORTED_CARD_ACTIONS = Object.freeze(['reveal', 'hide']);
const SUPPORTED_GAME_ACTIONS = Object.freeze([
  'end-round',
  'accuse',
  'call-guess',
  'guess',
  'replay'
]);
const GAME_UPDATE_FIELDS = Object.freeze({
  sessionId: 'session_id',
  session_id: 'session_id',
  timerSeconds: 'timer_seconds',
  timer_seconds: 'timer_seconds',
  roundLimit: 'round_limit',
  round_limit: 'round_limit',
  currentRoundNumber: 'current_round_number',
  current_round_number: 'current_round_number',
  currentPhase: 'current_phase',
  current_phase: 'current_phase',
  currentRevealIndex: 'current_reveal_index',
  current_reveal_index: 'current_reveal_index',
  currentDeadlineAt: 'current_deadline_at',
  current_deadline_at: 'current_deadline_at',
  currentAccusedPlayerId: 'current_accused_player_id',
  current_accused_player_id: 'current_accused_player_id',
  currentWinner: 'current_winner',
  current_winner: 'current_winner',
  currentReason: 'current_reason',
  current_reason: 'current_reason',
  revision: 'revision',
  updatedAt: 'updated_at',
  updated_at: 'updated_at'
});
const ROUND_UPDATE_FIELDS = Object.freeze({
  phase: 'phase',
  revealIndex: 'reveal_index',
  reveal_index: 'reveal_index',
  deadlineAt: 'deadline_at',
  deadline_at: 'deadline_at',
  accusedPlayerId: 'accused_player_id',
  accused_player_id: 'accused_player_id',
  guess: 'guess',
  guesses: 'guesses',
  guessOrder: 'guess_order',
  guess_order: 'guess_order',
  points: 'points',
  winner: 'winner',
  reason: 'reason',
  completedAt: 'completed_at',
  completed_at: 'completed_at'
});

function isPlainObject(value) {
  return value !== null
    && typeof value === 'object'
    && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function canonicalize(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError('Cannot hash a non-finite number.');
    }
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }

  if (isPlainObject(value)) {
    return Object.keys(value)
      .sort()
      .reduce((result, key) => {
        const child = value[key];
        if (child !== undefined) {
          result[key] = canonicalize(child);
        }
        return result;
      }, {});
  }

  throw new TypeError('Cannot hash this value.');
}

function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

function hashRequest(value) {
  return crypto.createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex');
}

function headerValue(headers, name) {
  const source = headers || {};
  const lowerName = name.toLowerCase();
  for (const [key, value] of Object.entries(source)) {
    if (key.toLowerCase() !== lowerName) continue;
    if (Array.isArray(value)) return value[0] || '';
    return value === undefined || value === null ? '' : String(value);
  }
  return '';
}

function environmentValue(env, lowerName, upperName, fallback = '') {
  const source = env || {};
  const value = source[lowerName] ?? source[upperName];
  return value === undefined || value === null ? fallback : String(value).trim();
}

function contentTypeIsJson(contentType) {
  return /^application\/json(?:\s*;|\s*$)/i.test(contentType || '');
}

function validateMutationHeaders({ request, headers, env, requireJson = true } = {}) {
  const source = headers || (request && request.headers) || {};
  const origin = headerValue(source, 'origin');
  const appOrigin = environmentValue(env, 'appOrigin', 'APP_ORIGIN', 'http://localhost:3000');

  // Browsers can omit Origin for same-origin navigations and some non-browser
  // clients. When it is present, accepting anything other than the configured
  // origin would turn a state-changing route into a CSRF target.
  if (origin && origin !== appOrigin) {
    throw new HttpError(403, 'ORIGIN_MISMATCH', 'Request origin is not allowed.', {});
  }

  const contentType = headerValue(source, 'content-type');
  if (requireJson && !contentTypeIsJson(contentType)) {
    throw validationError('Content-Type must be application/json.', 415, {
      field: 'content-type'
    });
  }
  if (!requireJson && contentType && !contentTypeIsJson(contentType)) {
    throw validationError('Content-Type must be application/json.', 415, {
      field: 'content-type'
    });
  }

  return { origin, contentType };
}

function validateIdempotencyKey(value, field = 'Idempotency-Key') {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw validationError(`${field} is required.`, 400, { field: field.toLowerCase() });
  }
  const normalized = value.trim();
  if (Buffer.byteLength(normalized, 'utf8') > MAX_IDEMPOTENCY_KEY_BYTES) {
    throw validationError(`${field} is too long.`, 400, {
      field: field.toLowerCase(),
      maxBytes: MAX_IDEMPOTENCY_KEY_BYTES
    });
  }
  return normalized;
}

function normalizeCustomSecret(value, field = 'customSecret') {
  if (typeof value !== 'string') {
    throw validationError(`${field} is required.`, 400, { field });
  }
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (normalized.length === 0) {
    throw validationError(`${field} cannot be empty.`, 400, { field });
  }
  if (normalized.length > MAX_CUSTOM_SECRET_LENGTH) {
    throw validationError(`${field} is too long.`, 400, {
      field,
      maxLength: MAX_CUSTOM_SECRET_LENGTH
    });
  }
  return normalized;
}

function validateCreateRequest(body) {
  if (!isPlainObject(body)) {
    throw validationError('Request body must be a JSON object.', 400);
  }

  const unknownFields = Object.keys(body).filter((key) => (
    !['players', 'timerSeconds', 'secretMode', 'customSecret'].includes(key)
  ));
  if (unknownFields.length > 0) {
    throw validationError('Request contains unknown fields.', 400, { fields: unknownFields.sort() });
  }

  const playerResult = validatePlayers(body.players);
  if (!playerResult.ok) {
    throw validationError(playerResult.error, 400, { field: 'players' });
  }

  if (!Number.isInteger(body.timerSeconds) || !SUPPORTED_TIMER_SECONDS.includes(body.timerSeconds)) {
    throw validationError('Timer must be 3, 5, or 8 minutes.', 400, {
      field: 'timerSeconds',
      allowed: SUPPORTED_TIMER_SECONDS
    });
  }

  const secretMode = body.secretMode === undefined ? 'deck' : body.secretMode;
  if (!SUPPORTED_SECRET_MODES.includes(secretMode)) {
    throw validationError('Secret mode must be deck or custom.', 400, {
      field: 'secretMode',
      allowed: SUPPORTED_SECRET_MODES
    });
  }

  const hasCustomSecret = body.customSecret !== undefined;
  if (secretMode === 'custom') {
    if (!hasCustomSecret) normalizeCustomSecret(undefined);
  } else if (hasCustomSecret) {
    throw validationError('customSecret is only valid for custom secret mode.', 400, {
      field: 'customSecret'
    });
  }

  const result = {
    players: playerResult.names,
    timerSeconds: body.timerSeconds,
    secretMode
  };
  if (secretMode === 'custom') {
    result.customSecret = normalizeCustomSecret(body.customSecret);
  }

  return result;
}

function validateExpectedRevision(value) {
  if (!Number.isInteger(value) || value < 1) {
    throw validationError('expectedRevision must be a positive integer.', 400, {
      field: 'expectedRevision'
    });
  }
  return value;
}

function normalizeActionRequest(body) {
  if (!isPlainObject(body)) {
    throw validationError('Request body must be a JSON object.', 400);
  }

  const type = typeof body.type === 'string' ? body.type.trim() : '';
  const idempotencyKey = typeof body.idempotencyKey === 'string'
    ? body.idempotencyKey.trim()
    : '';
  const normalized = { type };

  if (body.playerId !== undefined) {
    normalized.playerId = typeof body.playerId === 'string' ? body.playerId.trim() : body.playerId;
  }
  if (body.location !== undefined) {
    normalized.location = typeof body.location === 'string' ? body.location.trim() : body.location;
  }
  if (body.customSecret !== undefined) {
    normalized.customSecret = body.customSecret;
  }
  if (body.expectedRevision !== undefined) {
    normalized.expectedRevision = body.expectedRevision;
  }
  normalized.idempotencyKey = idempotencyKey;

  const allowed = new Set([
    'type',
    'playerId',
    'location',
    'customSecret',
    'expectedRevision',
    'idempotencyKey'
  ]);
  const unknownFields = Object.keys(body).filter((key) => !allowed.has(key));
  if (unknownFields.length > 0) {
    throw validationError('Request contains unknown fields.', 400, { fields: unknownFields.sort() });
  }
  return normalized;
}

function normalizeCardRequest(body) {
  if (!isPlainObject(body)) {
    throw validationError('Request body must be a JSON object.', 400);
  }

  const allowed = new Set(['action', 'expectedRevision', 'idempotencyKey']);
  const unknownFields = Object.keys(body).filter((key) => !allowed.has(key));
  if (unknownFields.length > 0) {
    throw validationError('Request contains unknown fields.', 400, { fields: unknownFields.sort() });
  }

  return {
    action: typeof body.action === 'string' ? body.action.trim() : '',
    expectedRevision: body.expectedRevision,
    idempotencyKey: typeof body.idempotencyKey === 'string'
      ? body.idempotencyKey.trim()
      : ''
  };
}

function validateCardRequest(body) {
  const normalized = normalizeCardRequest(body);
  if (!SUPPORTED_CARD_ACTIONS.includes(normalized.action)) {
    throw validationError('Unsupported card action.', 400, {
      field: 'action',
      allowed: SUPPORTED_CARD_ACTIONS
    });
  }
  return {
    ...normalized,
    expectedRevision: validateExpectedRevision(normalized.expectedRevision),
    idempotencyKey: validateIdempotencyKey(normalized.idempotencyKey, 'idempotencyKey')
  };
}

function validateActionRequest(body) {
  const normalized = normalizeActionRequest(body);
  if (!SUPPORTED_GAME_ACTIONS.includes(normalized.type)) {
    throw validationError('Unsupported game action.', 400, {
      field: 'type',
      allowed: SUPPORTED_GAME_ACTIONS
    });
  }

  const result = {
    ...normalized,
    expectedRevision: validateExpectedRevision(normalized.expectedRevision),
    idempotencyKey: validateIdempotencyKey(normalized.idempotencyKey, 'idempotencyKey')
  };

  if (result.type === 'accuse') {
    if (typeof result.playerId !== 'string' || result.playerId.length === 0) {
      throw validationError('playerId is required for an accusation.', 400, { field: 'playerId' });
    }
    if (result.location !== undefined) {
      throw validationError('location is not valid for an accusation.', 400, { field: 'location' });
    }
  }

  if (result.type === 'guess') {
    if (typeof result.location !== 'string' || result.location.length === 0) {
      throw validationError('location is required for a spy guess.', 400, { field: 'location' });
    }
    if (result.playerId !== undefined
      && (typeof result.playerId !== 'string' || result.playerId.length === 0)) {
      throw validationError('playerId must be a non-empty string for a spy guess.', 400, {
        field: 'playerId'
      });
    }
  }

  if (result.type === 'replay' && result.customSecret !== undefined) {
    result.customSecret = normalizeCustomSecret(result.customSecret);
  }

  if (result.type !== 'replay' && result.customSecret !== undefined) {
    throw validationError('customSecret is only valid for replay.', 400, {
      field: 'customSecret'
    });
  }

  if (result.type === 'call-guess') {
    if (typeof result.playerId !== 'string' || result.playerId.length === 0) {
      throw validationError('playerId is required when calling for a spy guess.', 400, {
        field: 'playerId'
      });
    }
    if (result.location !== undefined) {
      throw validationError('location is not valid when calling for a spy guess.', 400, {
        field: 'location'
      });
    }
  }

  if (['end-round', 'replay'].includes(result.type)
    && (result.playerId !== undefined || result.location !== undefined)) {
    throw validationError(`${result.type} does not accept a playerId or location.`, 400);
  }

  return result;
}

function encodeCursor(value) {
  return Buffer.from(canonicalJson(value), 'utf8').toString('base64url');
}

function decodeCursor(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || value.length > 512 || !/^[A-Za-z0-9_-]+$/.test(value)) {
    throw validationError('Cursor is invalid.', 400, { field: 'cursor' });
  }
  let parsed;
  try {
    parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
  } catch (error) {
    throw validationError('Cursor is invalid.', 400, { field: 'cursor' });
  }
  const parsedDate = isPlainObject(parsed) && typeof parsed.updatedAt === 'string'
    ? new Date(parsed.updatedAt)
    : null;
  if (!isPlainObject(parsed)
    || typeof parsed.gameId !== 'string'
    || parsed.gameId.length === 0
    || typeof parsed.updatedAt !== 'string'
    || !parsedDate
    || Number.isNaN(parsedDate.getTime())) {
    throw validationError('Cursor is invalid.', 400, { field: 'cursor' });
  }
  return { gameId: parsed.gameId, updatedAt: parsed.updatedAt };
}

function validateListOptions({ limit, cursor } = {}) {
  let normalizedLimit = limit === undefined || limit === null || limit === ''
    ? DEFAULT_LIST_LIMIT
    : Number(limit);
  if (!Number.isInteger(normalizedLimit) || normalizedLimit < 1 || normalizedLimit > MAX_LIST_LIMIT) {
    throw validationError(`limit must be between 1 and ${MAX_LIST_LIMIT}.`, 400, { field: 'limit' });
  }
  return { limit: normalizedLimit, cursor: decodeCursor(cursor) };
}

function decodeRoundCursor(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || value.length > 512 || !/^[A-Za-z0-9_-]+$/.test(value)) {
    throw validationError('Cursor is invalid.', 400, { field: 'cursor' });
  }
  let parsed;
  try {
    parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
  } catch (error) {
    throw validationError('Cursor is invalid.', 400, { field: 'cursor' });
  }
  if (!isPlainObject(parsed)
    || typeof parsed.roundNumber !== 'number'
    || !Number.isSafeInteger(parsed.roundNumber)
    || parsed.roundNumber < 1
    || parsed.roundNumber > MAX_ROUND_NUMBER
    || Object.keys(parsed).some((key) => key !== 'roundNumber')) {
    throw validationError('Cursor is invalid.', 400, { field: 'cursor' });
  }
  return { roundNumber: parsed.roundNumber };
}

function encodeRoundCursor(value) {
  if (!value
    || typeof value.roundNumber !== 'number'
    || !Number.isSafeInteger(value.roundNumber)
    || value.roundNumber < 1
    || value.roundNumber > MAX_ROUND_NUMBER) {
    throw new TypeError('A positive round number is required for a history cursor.');
  }
  return Buffer.from(canonicalJson({ roundNumber: Number(value.roundNumber) }), 'utf8')
    .toString('base64url');
}

function validateRoundListOptions({ limit, cursor } = {}) {
  let normalizedLimit = limit === undefined || limit === null || limit === ''
    ? DEFAULT_LIST_LIMIT
    : Number(limit);
  if (!Number.isInteger(normalizedLimit) || normalizedLimit < 1 || normalizedLimit > MAX_LIST_LIMIT) {
    throw validationError(`limit must be between 1 and ${MAX_LIST_LIMIT}.`, 400, { field: 'limit' });
  }
  return { limit: normalizedLimit, cursor: decodeRoundCursor(cursor) };
}

module.exports = {
  DEFAULT_LIST_LIMIT,
  GAME_UPDATE_FIELDS,
  ROUND_UPDATE_FIELDS,
  MAX_BODY_BYTES,
  MAX_IDEMPOTENCY_KEY_BYTES,
  MAX_LIST_LIMIT,
  MAX_ROUND_NUMBER,
  MAX_CUSTOM_SECRET_LENGTH,
  SUPPORTED_CARD_ACTIONS,
  SUPPORTED_GAME_ACTIONS,
  SUPPORTED_SECRET_MODES,
  SUPPORTED_TIMER_SECONDS,
  canonicalize,
  canonicalJson,
  contentTypeIsJson,
  decodeCursor,
  decodeRoundCursor,
  encodeCursor,
  encodeRoundCursor,
  hashRequest,
  headerValue,
  isPlainObject,
  normalizeCustomSecret,
  normalizeCardRequest,
  normalizeActionRequest,
  validateCreateRequest,
  validateActionRequest,
  validateCardRequest,
  validateExpectedRevision,
  validateIdempotencyKey,
  validateListOptions,
  validateRoundListOptions,
  validateMutationHeaders
};
