'use strict';

const { readConfig } = require('../server/config.js');
const { sendJson } = require('../server/http.js');
const { PostgresStore } = require('../server/postgres-store.js');

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

function methodNotAllowed(response) {
  sendJson(response, 405, {
    error: {
      code: 'METHOD_NOT_ALLOWED',
      message: 'Only GET is supported.',
      details: {}
    }
  }, { Allow: 'GET', 'Cache-Control': 'no-store' });
}

async function handleRequest(request, response, options = {}) {
  const method = String((request && request.method) || 'GET').toUpperCase();
  if (method !== 'GET') {
    methodNotAllowed(response);
    return;
  }

  try {
    const config = resolveConfig(options.env);
    if (config.isProduction
      && (!config.databaseUrl || !config.sessionSecret || !config.cronSecret || !config.appOrigin)) {
      throw new Error('Required production configuration is incomplete.');
    }
    const store = resolveStore(options, config);
    if (!store || typeof store.ping !== 'function') throw new Error('Readiness ping unavailable.');
    const reachable = await store.ping();
    if (reachable === false) throw new Error('Readiness ping failed.');
    sendJson(response, 200, { data: { ok: true } }, { 'Cache-Control': 'no-store' });
  } catch (error) {
    // Readiness is intentionally opaque: configuration and database details
    // belong in platform logs, not in a public response body.
    sendJson(response, 503, {
      error: {
        code: 'NOT_READY',
        message: 'Service is not ready.',
        details: {}
      }
    }, { 'Cache-Control': 'no-store' });
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
