'use strict';

const { readConfig } = require('../../server/config.js');
const {
  parseJsonBody,
  sendJson,
  HttpError
} = require('../../server/http.js');
const {
  buildSessionCookie,
  getOrCreateSession,
  resolveNow
} = require('../../server/session.js');
const {
  headerValue,
  validateCreateRequest,
  validateIdempotencyKey,
  validateListOptions,
  validateMutationHeaders
} = require('../../server/validation.js');
const { PostgresStore } = require('../../server/postgres-store.js');
const { createGame, listGames } = require('../../server/game-service.js');
const {
  DEFAULT_RATE_LIMIT_WINDOW_MS,
  GAME_CREATION_RATE_LIMIT,
  PUBLIC_GAMES_RATE_LIMIT,
  createRateLimiter,
  getClientIp
} = require('../../server/rate-limit.js');

let cachedDefaultStore = null;
let cachedDefaultStoreKey = '';
const defaultRateLimiter = createRateLimiter();

function resolveConfig(env) {
  if (env && Object.prototype.hasOwnProperty.call(env, 'appOrigin')) return env;
  return readConfig(env);
}

function resolveStore(options, config) {
  if (options && options.store) return options.store;
  if (options && typeof options.storeFactory === 'function') return options.storeFactory(config);
  const key = `${config.databaseUrl}|${config.appOrigin}|${config.isProduction}`;
  if (!cachedDefaultStore || cachedDefaultStoreKey !== key) {
    cachedDefaultStore = new PostgresStore({ env: config });
    cachedDefaultStoreKey = key;
  }
  return cachedDefaultStore;
}

function requestUrl(request) {
  return request && request.url ? request.url : '/api/games';
}

function queryOptions(request) {
  const url = new URL(requestUrl(request), 'http://spy.local');
  return validateListOptions({
    limit: url.searchParams.get('limit'),
    cursor: url.searchParams.get('cursor')
  });
}

function sendError(response, error) {
  const safeError = error instanceof HttpError
    ? error
    : new HttpError(
      Number.isInteger(error && error.status) ? error.status : 500,
      error && error.code ? error.code : 'INTERNAL_ERROR',
      error && error.status && error.message ? error.message : 'Request failed.',
      error && error.details ? error.details : {}
    );
  sendJson(response, safeError.status, safeError, { 'Cache-Control': 'no-store' });
}

function enforceRateLimit(request, limiter, method) {
  const clientIp = getClientIp(request);
  const general = limiter.check(clientIp, {
    limit: PUBLIC_GAMES_RATE_LIMIT,
    windowMs: DEFAULT_RATE_LIMIT_WINDOW_MS
  });
  if (!general.allowed) return general;
  if (method !== 'POST') return null;
  const creation = limiter.check(`create:${clientIp}`, {
    limit: GAME_CREATION_RATE_LIMIT,
    windowMs: DEFAULT_RATE_LIMIT_WINDOW_MS
  });
  return creation.allowed ? null : creation;
}

function sendRateLimitError(response, result) {
  const error = new HttpError(429, 'RATE_LIMITED', 'Too many requests. Try again later.', {});
  sendJson(response, error.status, error, {
    'Cache-Control': 'no-store',
    'Retry-After': String(result.retryAfterSeconds || 1)
  });
}

async function handleRequest(request, response, options = {}) {
  const method = String((request && request.method) || 'GET').toUpperCase();
  let config;
  let store;
  let now;
  try {
    if (method === 'GET' || method === 'POST') {
      const limiter = options.rateLimiter || defaultRateLimiter;
      const limited = enforceRateLimit(request, limiter, method);
      if (limited) {
        sendRateLimitError(response, limited);
        return;
      }
    }
    config = resolveConfig(options.env);
    store = resolveStore(options, config);
    now = resolveNow(options.now);
    if (method === 'GET') {
      const { session, rawToken } = await getOrCreateSession({
        request,
        store,
        env: config,
        now
      });
      const result = await listGames({
        store,
        sessionId: session.id,
        now,
        ...queryOptions(request)
      });
      const headers = { 'Cache-Control': 'no-store' };
      if (rawToken) headers['Set-Cookie'] = buildSessionCookie(rawToken, { env: config, now });
      sendJson(response, 200, {
        data: result,
        meta: { serverNow: now.toISOString() }
      }, headers);
      return;
    }

    if (method !== 'POST') {
      sendJson(response, 405, {
        error: {
          code: 'METHOD_NOT_ALLOWED',
          message: 'Only GET and POST are supported.',
          details: {}
        }
      }, { Allow: 'GET, POST', 'Cache-Control': 'no-store' });
      return;
    }

    validateMutationHeaders({ request, env: config, requireJson: true });
    const idempotencyKey = validateIdempotencyKey(
      headerValue(request.headers, 'idempotency-key'),
      'Idempotency-Key'
    );
    const input = validateCreateRequest(await parseJsonBody(request));
    const { session, rawToken } = await getOrCreateSession({
      request,
      store,
      env: config,
      now
    });
    const snapshot = await createGame({
      store,
      sessionId: session.id,
      ...input,
      idempotencyKey,
      now
    });
    const headers = { 'Cache-Control': 'no-store' };
    if (rawToken) headers['Set-Cookie'] = buildSessionCookie(rawToken, { env: config, now });
    sendJson(response, 201, {
      data: snapshot,
      meta: {
        serverNow: now.toISOString(),
        revision: snapshot.revision
      }
    }, headers);
  } catch (error) {
    sendError(response, error);
  }
}

function createHandler(options = {}) {
  const handlerOptions = Object.prototype.hasOwnProperty.call(options, 'rateLimiter')
    ? options
    : { ...options, rateLimiter: createRateLimiter() };
  return (request, response) => handleRequest(request, response, handlerOptions);
}

async function handler(request, response, options) {
  return handleRequest(request, response, options || {});
}

handler.createHandler = createHandler;
handler.handleRequest = handleRequest;

module.exports = handler;
