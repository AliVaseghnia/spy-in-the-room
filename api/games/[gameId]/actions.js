'use strict';

const { readConfig } = require('../../../server/config.js');
const { parseJsonBody, sendJson, HttpError } = require('../../../server/http.js');
const { getSessionFromRequest, resolveNow } = require('../../../server/session.js');
const {
  hashRequest,
  validateActionRequest,
  validateMutationHeaders
} = require('../../../server/validation.js');
const { PostgresStore } = require('../../../server/postgres-store.js');
const { applyGameAction, NotFoundError } = require('../../../server/game-service.js');
const { extractGameId } = require('../[gameId].js');

let cachedDefaultStore = null;
let cachedDefaultStoreKey = '';

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

async function handleRequest(request, response, options = {}) {
  const method = String((request && request.method) || 'GET').toUpperCase();
  try {
    const config = resolveConfig(options.env);
    const store = resolveStore(options, config);
    const now = resolveNow(options.now);
    const gameId = extractGameId(request);
    if (!gameId) throw new NotFoundError();

    if (method !== 'POST') {
      sendJson(response, 405, {
        error: {
          code: 'METHOD_NOT_ALLOWED',
          message: 'Only POST is supported.',
          details: {}
        }
      }, { Allow: 'POST', 'Cache-Control': 'no-store' });
      return;
    }

    validateMutationHeaders({ request, env: config, requireJson: true });
    const input = validateActionRequest(await parseJsonBody(request));
    const session = await getSessionFromRequest(request, store, config, now);
    if (!session) throw new NotFoundError();
    const hashInput = {
      type: input.type,
      expectedRevision: input.expectedRevision
    };
    if (input.playerId !== undefined) hashInput.playerId = input.playerId;
    if (input.location !== undefined) hashInput.location = input.location;
    if (input.customSecret !== undefined) hashInput.customSecret = input.customSecret;
    const responseBody = await applyGameAction({
      store,
      sessionId: session.id,
      gameId,
      command: input,
      expectedRevision: input.expectedRevision,
      idempotencyKey: input.idempotencyKey,
      requestHash: hashRequest(hashInput),
      now
    });
    sendJson(response, 200, responseBody, { 'Cache-Control': 'no-store' });
  } catch (error) {
    sendError(response, error);
  }
}

function createHandler(options = {}) {
  return (request, response) => handleRequest(request, response, options);
}

async function handler(request, response, options) {
  return handleRequest(request, response, options || {});
}

handler.createHandler = createHandler;
handler.handleRequest = handleRequest;

module.exports = handler;
