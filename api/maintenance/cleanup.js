'use strict';

const crypto = require('node:crypto');

const {
  DEFAULT_CLEANUP_BATCH_SIZE,
  DEFAULT_CLEANUP_MAX_BATCHES,
  readConfig
} = require('../../server/config.js');
const { HttpError, sendJson } = require('../../server/http.js');
const { PostgresStore } = require('../../server/postgres-store.js');
const { resolveNow } = require('../../server/session.js');
const { headerValue } = require('../../server/validation.js');

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

function environmentValue(env, lowerName, upperName) {
  const source = env || process.env;
  const value = source[lowerName] ?? source[upperName];
  return value === undefined || value === null ? '' : String(value).trim();
}

function configuredCronSecret(env) {
  return environmentValue(env, 'cronSecret', 'CRON_SECRET');
}

function suppliedCronSecret(request) {
  const authorization = headerValue(request && request.headers, 'authorization').trim();
  if (/^bearer\s+/i.test(authorization)) return authorization.replace(/^bearer\s+/i, '').trim();
  return headerValue(request && request.headers, 'x-cron-secret').trim();
}

function secretMatches(expected, supplied) {
  if (!expected || supplied.length > 4096) return false;
  const expectedDigest = crypto.createHash('sha256').update(expected, 'utf8').digest();
  const suppliedDigest = crypto.createHash('sha256').update(supplied, 'utf8').digest();
  return crypto.timingSafeEqual(expectedDigest, suppliedDigest);
}

function sendError(response) {
  const error = new HttpError(500, 'INTERNAL_ERROR', 'Request failed.', {});
  sendJson(response, error.status, error, { 'Cache-Control': 'no-store' });
}

function sendNotReady(response) {
  sendJson(response, 503, {
    error: {
      code: 'NOT_READY',
      message: 'Service is not ready.',
      details: {}
    }
  }, { 'Cache-Control': 'no-store' });
}

async function runCleanup(store, options) {
  const cleanupOptions = {
    now: options.now,
    batchSize: options.batchSize ?? DEFAULT_CLEANUP_BATCH_SIZE,
    maxBatches: options.maxBatches ?? DEFAULT_CLEANUP_MAX_BATCHES
  };
  if (typeof store.cleanupExpiredData === 'function') {
    return store.cleanupExpiredData(cleanupOptions);
  }
  if (typeof store.cleanupExpiredSessions !== 'function'
    || typeof store.cleanupExpiredTombstones !== 'function') {
    throw new Error('Cleanup is unavailable.');
  }
  const sessionsDeleted = await store.cleanupExpiredSessions(cleanupOptions);
  const tombstonesDeleted = await store.cleanupExpiredTombstones(cleanupOptions);
  return { sessionsDeleted, tombstonesDeleted };
}

async function handleRequest(request, response, options = {}) {
  const method = String((request && request.method) || 'GET').toUpperCase();
  let config;

  if (method !== 'GET') {
    sendJson(response, 405, {
      error: {
        code: 'METHOD_NOT_ALLOWED',
        message: 'Only GET is supported.',
        details: {}
      }
    }, { Allow: 'GET', 'Cache-Control': 'no-store' });
    return;
  }

  try {
    config = resolveConfig(options.env);
  } catch (error) {
    sendNotReady(response);
    return;
  }

  const expectedSecret = config.cronSecret || configuredCronSecret(options.env);
  if (config.isProduction && !expectedSecret) {
    sendNotReady(response);
    return;
  }
  if (expectedSecret && !secretMatches(expectedSecret, suppliedCronSecret(request))) {
    const error = new HttpError(401, 'UNAUTHORIZED', 'Unauthorized.', {});
    sendJson(response, error.status, error, {
      'Cache-Control': 'no-store',
      'WWW-Authenticate': 'Bearer'
    });
    return;
  }

  try {
    const store = resolveStore(options, config);
    const now = resolveNow(options.now);
    const data = await runCleanup(store, {
      now,
      batchSize: options.batchSize,
      maxBatches: options.maxBatches
    });
    sendJson(response, 200, {
      data,
      meta: { serverNow: now.toISOString() }
    }, { 'Cache-Control': 'no-store' });
  } catch (error) {
    sendError(response);
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
