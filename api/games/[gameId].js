'use strict';

const { readConfig } = require('../../server/config.js');
const { assertEmptyBody, sendJson, HttpError } = require('../../server/http.js');
const { getSessionFromRequest, resolveNow } = require('../../server/session.js');
const { headerValue, validateMutationHeaders } = require('../../server/validation.js');
const { PostgresStore } = require('../../server/postgres-store.js');
const {
  NotFoundError,
  deleteGame,
  getGameSnapshot
} = require('../../server/game-service.js');

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

function extractGameId(request) {
  const queryValue = request && request.query ? request.query.gameId : null;
  if (Array.isArray(queryValue)) return queryValue[0] || '';
  if (queryValue) return String(queryValue);
  const rawUrl = request && request.url ? String(request.url) : '';
  const pathname = new URL(rawUrl || '/', 'http://spy.local').pathname;
  const marker = '/api/games/';
  const markerIndex = pathname.indexOf(marker);
  if (markerIndex < 0) return '';
  const value = pathname.slice(markerIndex + marker.length).split('/')[0];
  try {
    return decodeURIComponent(value);
  } catch (error) {
    return '';
  }
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

function sendNoContent(response) {
  response.statusCode = 204;
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Content-Length', '0');
  response.end();
}

async function handleRequest(request, response, options = {}) {
  const method = String((request && request.method) || 'GET').toUpperCase();
  let config;
  let store;
  let now;
  try {
    config = resolveConfig(options.env);
    store = resolveStore(options, config);
    now = resolveNow(options.now);
    const gameId = extractGameId(request);
    if (!gameId) throw new NotFoundError();

    if (method === 'GET') {
      const session = await getSessionFromRequest(request, store, config, now);
      if (!session) throw new NotFoundError();
      const snapshot = await getGameSnapshot({
        store,
        sessionId: session.id,
        gameId,
        now
      });
      if (!snapshot) throw new NotFoundError();
      sendJson(response, 200, {
        data: snapshot,
        meta: { serverNow: now.toISOString(), revision: snapshot.revision }
      }, { 'Cache-Control': 'no-store' });
      return;
    }

    if (method === 'DELETE') {
      validateMutationHeaders({ request, env: config, requireJson: false });
      await assertEmptyBody(request);
      const session = await getSessionFromRequest(request, store, config, now);
      if (!session) throw new NotFoundError();
      await deleteGame({ store, sessionId: session.id, gameId, now });
      sendNoContent(response);
      return;
    }

    sendJson(response, 405, {
      error: {
        code: 'METHOD_NOT_ALLOWED',
        message: 'Only GET and DELETE are supported.',
        details: {}
      }
    }, { Allow: 'GET, DELETE', 'Cache-Control': 'no-store' });
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
handler.extractGameId = extractGameId;
handler.headerValue = headerValue;

module.exports = handler;
