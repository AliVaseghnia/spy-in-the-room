'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { Readable } = require('node:stream');

const { MemoryStore } = require('../server/memory-store.js');
const { PostgresStore, PostgresTransaction } = require('../server/postgres-store.js');
const { createSession } = require('../server/session.js');
const { createGame, deleteGame, listGames } = require('../server/game-service.js');

const ENV = {
  NODE_ENV: 'test',
  APP_ORIGIN: 'http://localhost:3000',
  SESSION_SECRET: 'backend-hardening-test-secret'
};

const NOW = new Date('2026-09-15T12:00:00.000Z');

async function createTestSession(store) {
  return createSession({ store, env: ENV, now: NOW });
}

function request({ method = 'GET', url = '/api/games', headers = {}, body = '' } = {}) {
  const stream = Readable.from(body === '' ? [] : [body]);
  stream.method = method;
  stream.url = url;
  stream.headers = headers;
  return stream;
}

function response() {
  return {
    headers: {},
    statusCode: 200,
    body: '',
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    end(body) {
      this.body = body || '';
    }
  };
}

function gameInput(idempotencyKey) {
  return {
    players: ['Ana', 'Bea', 'Cy', 'Dee'],
    timerSeconds: 300,
    random: () => 0,
    now: NOW,
    idempotencyKey
  };
}

test('game creation enforces a per-session saved-game cap without breaking idempotent replay', async () => {
  const store = new MemoryStore();
  const session = await createTestSession(store);

  const first = await createGame({
    store,
    sessionId: session.session.id,
    maxGames: 2,
    ...gameInput('cap-first')
  });
  const second = await createGame({
    store,
    sessionId: session.session.id,
    maxGames: 2,
    ...gameInput('cap-second')
  });

  const replay = await createGame({
    store,
    sessionId: session.session.id,
    maxGames: 2,
    ...gameInput('cap-first')
  });
  assert.deepEqual(replay, first);

  await assert.rejects(
    createGame({
      store,
      sessionId: session.session.id,
      maxGames: 2,
      ...gameInput('cap-third')
    }),
    (error) => error.status === 409
      && error.code === 'GAME_LIMIT_REACHED'
      && error.details.maxGames === 2
  );
  assert.equal(store.games.size, 2);
  assert.notEqual(first.gameId, second.gameId);
});

test('memory game counts are scoped to live games owned by one session', async () => {
  const store = new MemoryStore();
  const owner = await createTestSession(store);
  const other = await createTestSession(store);

  await createGame({ store, sessionId: owner.session.id, ...gameInput('count-owner') });
  await createGame({ store, sessionId: other.session.id, ...gameInput('count-other') });

  assert.equal(typeof store.countGamesForSession, 'function');
  assert.equal(await store.countGamesForSession(owner.session.id), 1);
});

test('memory resume summaries omit round secrets and assignments', async () => {
  const store = new MemoryStore();
  const session = await createTestSession(store);
  const created = await createGame({
    store,
    sessionId: session.session.id,
    ...gameInput('summary-memory')
  });

  assert.equal(typeof store.listGameSummaries, 'function');
  const result = await store.listGameSummaries({ sessionId: session.session.id, limit: 20 });
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].id, created.gameId);
  assert.equal(result.items[0].players.length, 4);
  assert.equal('rounds' in result.items[0], false);
  assert.equal('assignments' in result.items[0], false);
  assert.equal('locationName' in result.items[0], false);
});

test('game-service listing returns compact public summaries without result payloads', async () => {
  const store = new MemoryStore();
  const session = await createTestSession(store);
  await createGame({
    store,
    sessionId: session.session.id,
    ...gameInput('summary-service')
  });

  const result = await listGames({ store, sessionId: session.session.id, limit: 20 });
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].phase, 'reveal');
  assert.equal(result.items[0].players.length, 4);
  assert.equal('outcome' in result.items[0], false);
  assert.equal('deadlineAt' in result.items[0], true);
});

test('Postgres store exposes a connectivity ping and a parameterized game count', async () => {
  const calls = [];
  const client = {
    async query(sql, parameters) {
      calls.push({ sql, parameters });
      if (sql === 'SELECT 1 AS ready') return { rows: [{ ready: 1 }], rowCount: 1 };
      if (sql.includes('COUNT(*)')) return { rows: [{ count: '3' }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    }
  };
  const store = new PostgresStore({ databaseUrl: 'postgres://example.test/spy', client });

  assert.equal(typeof store.ping, 'function');
  assert.equal(typeof store.countGamesForSession, 'function');
  assert.equal(await store.ping(), true);
  assert.equal(await store.countGamesForSession('session-1'), 3);
  assert.deepEqual(calls, [
    { sql: 'SELECT 1 AS ready', parameters: undefined },
    {
      sql: 'SELECT COUNT(*)::int AS count FROM games WHERE session_id = $1',
      parameters: ['session-1']
    }
  ]);
});

test('Postgres resume summaries use one compact parameterized query', async () => {
  const calls = [];
  const client = {
    async query(sql, parameters) {
      calls.push({ sql, parameters });
      if (sql.includes('FROM games')) {
        return {
          rows: [{
            id: 'game-1',
            session_id: 'session-1',
            timer_seconds: 300,
            secret_mode: 'deck',
            round_limit: 5,
            current_round_number: 1,
            current_phase: 'reveal',
            current_reveal_index: 0,
            current_deadline_at: new Date('2026-09-15T12:05:00.000Z'),
            current_accused_player_id: null,
            current_winner: null,
            current_reason: null,
            revision: 1,
            created_at: NOW,
            updated_at: NOW,
            players: [{ id: 'player-1', gameId: 'game-1', seat: 0, displayName: 'Ana' }]
          }],
          rowCount: 1
        };
      }
      return { rows: [], rowCount: 0 };
    }
  };
  const store = new PostgresStore({ databaseUrl: 'postgres://example.test/spy', client });

  assert.equal(typeof store.listGameSummaries, 'function');
  const result = await store.listGameSummaries({ sessionId: 'session-1', limit: 10 });
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].id, 'game-1');
  assert.equal(result.items[0].players[0].displayName, 'Ana');
  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /json_agg/i);
  assert.doesNotMatch(calls[0].sql, /FROM rounds/i);
  assert.deepEqual(calls[0].parameters, ['session-1', 11]);
});

test('public games route enforces a rejected request from its configured limiter', async () => {
  const calls = [];
  const limiter = {
    check(key, policy) {
      calls.push({ key, policy });
      return { allowed: false, retryAfterSeconds: 7 };
    }
  };
  const route = require('../api/games/index.js').createHandler({
    store: new MemoryStore(),
    env: ENV,
    now: NOW,
    rateLimiter: limiter
  });
  const result = response();

  await route(request({ headers: { 'x-forwarded-for': '198.51.100.10' } }), result);

  assert.equal(result.statusCode, 429);
  assert.equal(JSON.parse(result.body).error.code, 'RATE_LIMITED');
  assert.equal(result.headers['retry-after'], '7');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].key, '198.51.100.10');
});

test('public game creation uses a stricter second limiter bucket after the general bucket', async () => {
  const calls = [];
  const limiter = {
    check(key, policy) {
      calls.push({ key, policy });
      return { allowed: !key.startsWith('create:') };
    }
  };
  const route = require('../api/games/index.js').createHandler({
    store: new MemoryStore(),
    env: ENV,
    now: NOW,
    rateLimiter: limiter
  });
  const result = response();

  await route(request({
    method: 'POST',
    headers: { 'x-forwarded-for': '198.51.100.11' }
  }), result);

  assert.equal(result.statusCode, 429);
  assert.deepEqual(calls.map((call) => call.key), [
    '198.51.100.11',
    'create:198.51.100.11'
  ]);
  assert.ok(calls[1].policy.limit < calls[0].policy.limit);
});

test('memory cleanup removes expired sessions with their games and expired tombstones', async () => {
  const store = new MemoryStore();
  const expiredSession = {
    id: 'expired-session',
    tokenHash: 'expired-token-hash',
    createdAt: new Date('2026-09-14T12:00:00.000Z'),
    expiresAt: new Date('2026-09-15T11:59:00.000Z')
  };
  await store.insertSession(expiredSession);
  const created = await createGame({
    store,
    sessionId: expiredSession.id,
    ...gameInput('cleanup-game'),
    now: new Date('2026-09-15T11:58:00.000Z')
  });
  const liveSession = await createTestSession(store);
  const tombstoneGame = await createGame({
    store,
    sessionId: liveSession.session.id,
    ...gameInput('cleanup-tombstone')
  });
  await deleteGame({
    store,
    sessionId: liveSession.session.id,
    gameId: tombstoneGame.gameId,
    now: new Date('2026-06-01T12:00:00.000Z')
  });

  assert.equal(typeof store.cleanupExpiredData, 'function');
  if (typeof store.cleanupExpiredData !== 'function') return;
  const result = await store.cleanupExpiredData({
    now: NOW,
    batchSize: 10,
    maxBatches: 2
  });

  assert.deepEqual(result, { sessionsDeleted: 1, tombstonesDeleted: 1 });
  assert.equal(store.sessionsById.has(expiredSession.id), false);
  assert.equal(store.games.has(created.gameId), false);
  assert.equal(store.tombstones.has(tombstoneGame.gameId), false);
  assert.equal(store.sessionsById.has(liveSession.session.id), true);
});

test('memory cleanup honors the maximum number of expired-session batches', async () => {
  const store = new MemoryStore();
  for (let index = 0; index < 3; index += 1) {
    await store.insertSession({
      id: `expired-batch-${index}`,
      tokenHash: `expired-batch-token-${index}`,
      createdAt: new Date('2026-09-14T12:00:00.000Z'),
      expiresAt: new Date('2026-09-15T11:00:00.000Z')
    });
  }

  assert.equal(typeof store.cleanupExpiredSessions, 'function');
  if (typeof store.cleanupExpiredSessions !== 'function') return;
  const deleted = await store.cleanupExpiredSessions({
    now: NOW,
    batchSize: 1,
    maxBatches: 2
  });

  assert.equal(deleted, 2);
  assert.equal(store.sessionsById.size, 1);
});

test('cleanup endpoint protects configured cron secrets and returns cleanup counts', async () => {
  let cleanup;
  try {
    cleanup = require('../api/maintenance/cleanup.js');
  } catch (error) {
    cleanup = {};
  }
  assert.equal(typeof cleanup, 'function');
  if (typeof cleanup !== 'function') return;

  const store = new MemoryStore();
  await store.insertSession({
    id: 'route-expired-session',
    tokenHash: 'route-expired-token',
    createdAt: new Date('2026-09-14T12:00:00.000Z'),
    expiresAt: new Date('2026-09-15T11:59:00.000Z')
  });
  const route = cleanup.createHandler({
    store,
    env: { ...ENV, CRON_SECRET: 'cron-test-secret' },
    now: NOW,
    batchSize: 1,
    maxBatches: 1
  });

  const unauthorized = response();
  await route(request(), unauthorized);
  assert.equal(unauthorized.statusCode, 401);
  assert.equal(unauthorized.body.includes('cron-test-secret'), false);

  const authorized = response();
  await route(request({ headers: { authorization: 'Bearer cron-test-secret' } }), authorized);
  assert.equal(authorized.statusCode, 200);
  assert.deepEqual(JSON.parse(authorized.body).data, {
    sessionsDeleted: 1,
    tombstonesDeleted: 0
  });
});

test('cleanup endpoint remains available without a cron secret in local configuration', async () => {
  let cleanup;
  try {
    cleanup = require('../api/maintenance/cleanup.js');
  } catch (error) {
    cleanup = {};
  }
  assert.equal(typeof cleanup, 'function');
  if (typeof cleanup !== 'function') return;

  const route = cleanup.createHandler({ store: new MemoryStore(), env: ENV, now: NOW });
  const result = response();
  await route(request(), result);
  assert.equal(result.statusCode, 200);
  assert.deepEqual(JSON.parse(result.body).data, {
    sessionsDeleted: 0,
    tombstonesDeleted: 0
  });
});

test('cleanup endpoint fails closed when production cron configuration is missing', async () => {
  const cleanup = require('../api/maintenance/cleanup.js');
  let cleanupCalled = false;
  const route = cleanup.createHandler({
    store: {
      async cleanupExpiredData() {
        cleanupCalled = true;
        return { sessionsDeleted: 0, tombstonesDeleted: 0 };
      }
    },
    env: {
      NODE_ENV: 'production',
      DATABASE_URL: 'postgres://example.test/spy',
      SESSION_SECRET: 'production-session-secret',
      APP_ORIGIN: 'https://spy.example.com'
    },
    now: NOW
  });
  const result = response();

  await route(request(), result);

  assert.equal(result.statusCode, 503);
  assert.deepEqual(JSON.parse(result.body), {
    error: {
      code: 'NOT_READY',
      message: 'Service is not ready.',
      details: {}
    }
  });
  assert.equal(cleanupCalled, false);
});

test('ready endpoint reports healthy injected storage and hides configuration or ping failures', async () => {
  let ready;
  try {
    ready = require('../api/ready.js');
  } catch (error) {
    ready = {};
  }
  assert.equal(typeof ready, 'function');
  if (typeof ready !== 'function') return;

  const healthyRoute = ready.createHandler({ store: new MemoryStore(), env: ENV, now: NOW });
  const healthy = response();
  await healthyRoute(request({ url: '/api/ready' }), healthy);
  assert.equal(healthy.statusCode, 200);
  assert.deepEqual(JSON.parse(healthy.body).data, { ok: true });

  const failingRoute = ready.createHandler({
    store: { ping: async () => { throw new Error('DATABASE_URL=do-not-leak'); } },
    env: ENV,
    now: NOW
  });
  const failing = response();
  await failingRoute(request({ url: '/api/ready' }), failing);
  assert.equal(failing.statusCode, 503);
  assert.deepEqual(JSON.parse(failing.body), {
    error: {
      code: 'NOT_READY',
      message: 'Service is not ready.',
      details: {}
    }
  });
  assert.equal(failing.body.includes('DATABASE_URL'), false);
});

test('ready endpoint rejects an incomplete normalized production configuration', async () => {
  const ready = require('../api/ready.js');
  const route = ready.createHandler({
    store: { ping: async () => true },
    env: {
      appOrigin: 'https://spy.example.com',
      isProduction: true,
      databaseUrl: 'postgres://example.test/spy',
      sessionSecret: 'normalized-session-secret',
      cronSecret: ''
    },
    now: NOW
  });
  const result = response();

  await route(request({ url: '/api/ready' }), result);

  assert.equal(result.statusCode, 503);
  assert.deepEqual(JSON.parse(result.body).error, {
    code: 'NOT_READY',
    message: 'Service is not ready.',
    details: {}
  });
});

test('process-local limiter uses the first forwarded address and evicts entries to stay bounded', () => {
  const {
    createRateLimiter,
    getClientIp
  } = require('../server/rate-limit.js');
  let now = 0;
  const limiter = createRateLimiter({ now: () => now, windowMs: 1000, maxEntries: 2 });

  assert.equal(getClientIp({
    headers: { 'x-forwarded-for': '203.0.113.7, 10.0.0.4' }
  }), '203.0.113.7');
  assert.equal(limiter.check('first', { limit: 2 }).allowed, true);
  assert.equal(limiter.check('first', { limit: 2 }).allowed, true);
  assert.equal(limiter.check('first', { limit: 2 }).allowed, false);
  limiter.check('second', { limit: 1 });
  limiter.check('third', { limit: 1 });
  assert.equal(limiter.size(), 2);

  now = 1001;
  assert.equal(limiter.check('new-window', { limit: 1 }).allowed, true);
});

test('Postgres cleanup uses parameterized, bounded delete batches', async () => {
  const calls = [];
  let sessionBatch = 0;
  const transaction = new PostgresTransaction({
    async query(sql, parameters) {
      calls.push({ sql, parameters });
      if (sql.includes('DELETE FROM sessions')) {
        sessionBatch += 1;
        return { rows: [], rowCount: sessionBatch === 1 ? 2 : 1 };
      }
      if (sql.includes('DELETE FROM game_tombstones')) return { rows: [], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    }
  });

  const result = await transaction.cleanupExpiredDataWithinTransaction({
    now: NOW,
    batchSize: 2,
    maxBatches: 2
  });

  assert.deepEqual(result, { sessionsDeleted: 3, tombstonesDeleted: 1 });
  assert.equal(calls.length, 3);
  for (const call of calls) {
    assert.match(call.sql, /LIMIT \$2/);
    assert.deepEqual(call.parameters, [NOW, 2]);
    assert.doesNotMatch(call.sql, /2026-09-15/);
  }
});

test('Postgres command-receipt lookup emits one valid FROM clause', async () => {
  let captured = null;
  const transaction = new PostgresTransaction({
    async query(sql, parameters) {
      captured = { sql, parameters };
      return { rows: [], rowCount: 0 };
    }
  });

  assert.equal(await transaction.getCommandReceipt('session-1', 'game-1', 'retry-key'), null);
  assert.equal((captured.sql.match(/\bFROM command_receipts\b/g) || []).length, 1);
  assert.deepEqual(captured.parameters, ['session-1', 'game-1', 'retry-key']);
});
