const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const test = require('node:test');

const {
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE,
  buildSessionCookie,
  createSession,
  getSessionFromRequest,
  hashToken
} = require('../server/session.js');
const {
  canonicalJson,
  decodeRoundCursor,
  encodeRoundCursor,
  hashRequest,
  MAX_CUSTOM_SECRET_LENGTH,
  validateCreateRequest,
  validateMutationHeaders
} = require('../server/validation.js');
const { MemoryStore } = require('../server/memory-store.js');
const { HttpError } = require('../server/http.js');
const {
  createGame,
  deleteGame,
  getGameSnapshot,
  listGames,
  listRoundHistory,
  NotFoundError,
  applyCardAction,
  applyGameAction
} = require('../server/game-service.js');
const { PostgresStore, PostgresTransaction } = require('../server/postgres-store.js');

const ENV = {
  NODE_ENV: 'test',
  APP_ORIGIN: 'http://localhost:3000',
  SESSION_SECRET: 'test-session-secret'
};

function nowAt(value = '2026-09-07T12:00:00.000Z') {
  return new Date(value);
}

function fakeResponse() {
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

function request({ method = 'GET', url = '/api/games', headers = {}, body = '' } = {}) {
  const stream = Readable.from(body === '' ? [] : [body]);
  stream.method = method;
  stream.url = url;
  stream.headers = headers;
  return stream;
}

function assertActiveSnapshotIsSanitized(snapshot) {
  assert.deepEqual(Object.keys(snapshot).sort(), [
    'accusedPlayer',
    'currentPlayer',
    'deadlineAt',
    'gameId',
    'outcome',
    'phase',
    'players',
    ' revealIndex'.trim(),
    'revision',
    'roundNumber',
    'secretMode',
    'timerSeconds'
  ].sort());
  const serialized = JSON.stringify(snapshot);
  for (const secretField of [
    '"location"',
    '"category"',
    '"isSpy"',
    '"spyPlayers"',
    '"assignments"',
    '"card"',
    '"customSecret"'
  ]) {
    assert.equal(serialized.includes(secretField), false, `snapshot leaked ${secretField}`);
  }
}

function assertGameSummaryIsCompact(summary) {
  assert.deepEqual(Object.keys(summary).sort(), [
    'currentPlayer',
    'deadlineAt',
    'gameId',
    'phase',
    'players',
    'revealIndex',
    'revision',
    'roundNumber',
    'secretMode',
    'timerSeconds'
  ].sort());
  assert.equal('outcome' in summary, false);
  assert.equal('assignments' in summary, false);
  assert.equal('location' in summary, false);
}

async function createRoundGame({
  timerSeconds = 300,
  now = nowAt(),
  players = ['Ana', 'Bea', 'Cy', 'Dee'],
  random = () => 0,
  secretMode,
  customSecret
} = {}) {
  const store = new MemoryStore();
  const session = await createSession({ store, env: ENV, now });
  const created = await createGame({
    store,
    sessionId: session.session.id,
    players,
    timerSeconds,
    secretMode,
    customSecret,
    random,
    now
  });
  let revision = created.revision;
  for (let index = 0; index < players.length; index += 1) {
    await applyCardAction({
      store,
      sessionId: session.session.id,
      gameId: created.gameId,
      action: 'reveal',
      expectedRevision: revision,
      idempotencyKey: `reveal-${index}`,
      now
    });
    const hidden = await applyCardAction({
      store,
      sessionId: session.session.id,
      gameId: created.gameId,
      action: 'hide',
      expectedRevision: revision,
      idempotencyKey: `hide-${index}`,
      now
    });
    revision = hidden.meta.revision;
  }
  return { store, session, created, revision, now, round: store.games.get(created.gameId).rounds[0] };
}

function gameSpyAndNonSpy(store, gameId) {
  const game = store.games.get(gameId);
  const round = game.rounds.find((candidate) => candidate.roundNumber === game.currentRoundNumber);
  const spyAssignment = round.assignments.find((assignment) => assignment.isSpy);
  const nonSpyAssignment = round.assignments.find((assignment) => !assignment.isSpy);
  return {
    game,
    round,
    spyId: spyAssignment.playerId,
    nonSpyId: nonSpyAssignment.playerId
  };
}

test('session tokens are hashed and cookies have aligned 30-day expiry', async () => {
  const store = new MemoryStore();
  const now = nowAt();
  const created = await createSession({ store, env: ENV, now });

  assert.match(created.rawToken, /^[A-Za-z0-9_-]{40,}$/);
  assert.equal(created.session.expiresAt.toISOString(), '2026-10-07T12:00:00.000Z');
  assert.equal(store.sessionsById.get(created.session.id).tokenHash, hashToken(created.rawToken, ENV.SESSION_SECRET));
  assert.notEqual(store.sessionsById.get(created.session.id).tokenHash, created.rawToken);

  const cookie = buildSessionCookie(created.rawToken, { env: ENV, now });
  assert.match(cookie, new RegExp(`^${SESSION_COOKIE_NAME}=`));
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
  assert.match(cookie, /Path=\//);
  assert.match(cookie, new RegExp(`Max-Age=${SESSION_MAX_AGE}`));
  assert.match(cookie, /Expires=Wed, 07 Oct 2026 12:00:00 GMT/);

  const found = await getSessionFromRequest(
    { headers: { cookie } },
    store,
    ENV,
    now
  );
  assert.equal(found.id, created.session.id);
  assert.equal(
    await getSessionFromRequest({ headers: { cookie: 'spy_session=not-a-token' } }, store, ENV, now),
    null
  );
});

test('canonical request hashes normalize object key order and create input', () => {
  assert.equal(canonicalJson({ b: 2, a: 1 }), '{"a":1,"b":2}');
  assert.equal(
    hashRequest(validateCreateRequest({ timerSeconds: 300, players: [' Ana ', 'Bea', 'Cy', 'Dee'] })),
    hashRequest(validateCreateRequest({ players: ['Ana', 'Bea', 'Cy', 'Dee'], timerSeconds: 300 }))
  );
  assert.deepEqual(
    validateCreateRequest({ players: [' Ana ', 'Bea', 'Cy', 'Dee'], timerSeconds: 300 }),
    { players: ['Ana', 'Bea', 'Cy', 'Dee'], timerSeconds: 300, secretMode: 'deck' }
  );
});

test('round cursors stay within positive PostgreSQL-safe 32-bit integer range', () => {
  const maximum = 2147483647;
  const cursor = encodeRoundCursor({ roundNumber: maximum });
  assert.deepEqual(decodeRoundCursor(cursor), { roundNumber: maximum });

  for (const roundNumber of [0, -1, 2147483648, Number.MAX_SAFE_INTEGER + 1, 1.5, '2']) {
    assert.throws(
      () => encodeRoundCursor({ roundNumber }),
      (error) => error instanceof TypeError
    );
  }

  const outOfRangeCursor = Buffer.from(JSON.stringify({ roundNumber: 2147483648 }), 'utf8')
    .toString('base64url');
  assert.throws(
    () => decodeRoundCursor(outOfRangeCursor),
    (error) => error.code === 'VALIDATION_ERROR' && error.status === 400
  );
});

test('createGame handles 4/8/9/12 players and never exposes active secrets', async () => {
  const rosters = [4, 8, 9, 12].map((count) =>
    Array.from({ length: count }, (_, index) => `Player ${index + 1}`)
  );

  for (const players of rosters) {
    const store = new MemoryStore();
    const session = await createSession({ store, env: ENV, now: nowAt() });
    const snapshot = await createGame({
      store,
      sessionId: session.session.id,
      players,
      timerSeconds: 300,
      random: () => 0,
      now: nowAt()
    });

    assert.equal(snapshot.phase, 'reveal');
    assert.equal(snapshot.players.length, players.length);
    assert.equal(snapshot.currentPlayer.displayName, players[0]);
    assert.equal(snapshot.revealIndex, 0);
    assert.equal(snapshot.revision, 1);
    assertActiveSnapshotIsSanitized(snapshot);
  }
});

test('create validation rejects invalid names and timers', () => {
  assert.throws(
    () => validateCreateRequest({ players: ['Ana', 'Bea', 'Cy'], timerSeconds: 300 }),
    (error) => error.code === 'VALIDATION_ERROR'
  );
  assert.throws(
    () => validateCreateRequest({ players: ['Ana', 'ana', 'Cy', 'Dee'], timerSeconds: 300 }),
    (error) => error.code === 'VALIDATION_ERROR'
  );
  assert.throws(
    () => validateCreateRequest({ players: ['Ana', 'Bea', 'Cy', 'Dee'], timerSeconds: 301 }),
    (error) => error.code === 'VALIDATION_ERROR'
  );
});

test('custom create validation normalizes and bounds the per-round secret', async () => {
  const normalized = validateCreateRequest({
    players: [' Ana ', 'Bea', 'Cy', 'Dee'],
    timerSeconds: 300,
    secretMode: 'custom',
    customSecret: '  Moon\t\nBase  '
  });
  assert.deepEqual(normalized, {
    players: ['Ana', 'Bea', 'Cy', 'Dee'],
    timerSeconds: 300,
    secretMode: 'custom',
    customSecret: 'Moon Base'
  });
  assert.throws(
    () => validateCreateRequest({
      players: ['Ana', 'Bea', 'Cy', 'Dee'],
      timerSeconds: 300,
      secretMode: 'custom'
    }),
    (error) => error.code === 'VALIDATION_ERROR' && error.details.field === 'customSecret'
  );
  assert.throws(
    () => validateCreateRequest({
      players: ['Ana', 'Bea', 'Cy', 'Dee'],
      timerSeconds: 300,
      secretMode: 'custom',
      customSecret: ' \t\n '
    }),
    (error) => error.code === 'VALIDATION_ERROR' && error.details.field === 'customSecret'
  );
  assert.throws(
    () => validateCreateRequest({
      players: ['Ana', 'Bea', 'Cy', 'Dee'],
      timerSeconds: 300,
      secretMode: 'custom',
      customSecret: 'x'.repeat(MAX_CUSTOM_SECRET_LENGTH + 1)
    }),
    (error) => error.code === 'VALIDATION_ERROR' && error.details.field === 'customSecret'
  );
  assert.throws(
    () => validateCreateRequest({
      players: ['Ana', 'Bea', 'Cy', 'Dee'],
      timerSeconds: 300,
      secretMode: 'deck',
      customSecret: 'Should not be accepted'
    }),
    (error) => error.code === 'VALIDATION_ERROR' && error.details.field === 'customSecret'
  );

  const store = new MemoryStore();
  const session = await createSession({ store, env: ENV, now: nowAt() });
  const snapshot = await createGame({
    store,
    sessionId: session.session.id,
    players: ['Ana', 'Bea', 'Cy', 'Dee'],
    timerSeconds: 300,
    secretMode: 'custom',
    customSecret: '  Moon\t\nBase  ',
    random: () => 0,
    now: nowAt()
  });
  const persisted = store.games.get(snapshot.gameId);
  assert.equal(snapshot.secretMode, 'custom');
  assert.equal(persisted.secretMode, 'custom');
  assert.equal(persisted.rounds[0].secretMode, 'custom');
  assert.equal(persisted.rounds[0].locationName, 'Moon Base');
  assert.equal(persisted.rounds[0].locationCategory, 'Custom');
  assertActiveSnapshotIsSanitized(snapshot);
  assert.equal(JSON.stringify(snapshot).includes('Moon Base'), false);
});

test('creation receipts are session-scoped and replay only an identical canonical request', async () => {
  const store = new MemoryStore();
  const session = await createSession({ store, env: ENV, now: nowAt() });
  const first = await createGame({
    store,
    sessionId: session.session.id,
    players: ['Ana', 'Bea', 'Cy', 'Dee'],
    timerSeconds: 300,
    random: () => 0,
    now: nowAt(),
    idempotencyKey: 'create-1'
  });
  const replay = await createGame({
    store,
    sessionId: session.session.id,
    players: [' Ana ', 'Bea', 'Cy', 'Dee'],
    timerSeconds: 300,
    random: () => 0.9,
    now: nowAt(),
    idempotencyKey: 'create-1'
  });

  assert.deepEqual(replay, first);
  assert.equal(store.games.size, 1);
  await assert.rejects(
    createGame({
      store,
      sessionId: session.session.id,
      players: ['Ana', 'Bea', 'Cy', 'Dee'],
      timerSeconds: 480,
      idempotencyKey: 'create-1',
      now: nowAt()
    }),
    (error) => error.code === 'VALIDATION_ERROR'
  );
});

test('list and snapshot access are owned by the session and omit active secrets', async () => {
  const store = new MemoryStore();
  const owner = await createSession({ store, env: ENV, now: nowAt() });
  const other = await createSession({ store, env: ENV, now: nowAt() });
  const created = await createGame({
    store,
    sessionId: owner.session.id,
    players: ['Ana', 'Bea', 'Cy', 'Dee'],
    timerSeconds: 180,
    random: () => 0,
    now: nowAt(),
    idempotencyKey: 'create-owned'
  });

  const ownerSnapshot = await getGameSnapshot({
    store,
    sessionId: owner.session.id,
    gameId: created.gameId,
    now: nowAt('2026-09-07T12:01:00.000Z')
  });
  assertActiveSnapshotIsSanitized(ownerSnapshot);
  assert.equal(
    await getGameSnapshot({ store, sessionId: other.session.id, gameId: created.gameId, now: nowAt() }),
    null
  );

  const listed = await listGames({ store, sessionId: owner.session.id, limit: 10 });
  assert.equal(listed.items.length, 1);
  assert.equal(listed.items[0].gameId, created.gameId);
  assertGameSummaryIsCompact(listed.items[0]);
  assert.deepEqual(await listGames({ store, sessionId: other.session.id, limit: 10 }), {
    items: [],
    nextCursor: null
  });
});

test('getGameSnapshot reconciles an expired persisted round before returning it', async () => {
  const store = new MemoryStore();
  const session = await createSession({ store, env: ENV, now: nowAt() });
  const created = await createGame({
    store,
    sessionId: session.session.id,
    players: ['Ana', 'Bea', 'Cy', 'Dee'],
    timerSeconds: 300,
    random: () => 0,
    now: nowAt()
  });
  const game = store.games.get(created.gameId);
  game.currentPhase = 'round';
  game.currentDeadlineAt = nowAt('2026-09-07T11:59:00.000Z');
  game.rounds[0].phase = 'round';
  game.rounds[0].deadlineAt = game.currentDeadlineAt;
  const snapshot = await getGameSnapshot({
    store,
    sessionId: session.session.id,
    gameId: created.gameId,
    now: nowAt('2026-09-07T12:01:00.000Z')
  });
  assert.equal(snapshot.phase, 'accuse');
  assert.equal(snapshot.deadlineAt, null);
  assert.equal(snapshot.revision, 2);
  assert.equal(store.games.get(created.gameId).currentPhase, 'accuse');
});

test('deletion removes live data, retains a minimal tombstone, and hides ownership', async () => {
  const store = new MemoryStore();
  const owner = await createSession({ store, env: ENV, now: nowAt() });
  const other = await createSession({ store, env: ENV, now: nowAt() });
  const created = await createGame({
    store,
    sessionId: owner.session.id,
    players: ['Ana', 'Bea', 'Cy', 'Dee'],
    timerSeconds: 300,
    now: nowAt(),
    idempotencyKey: 'delete-me'
  });

  await assert.rejects(
    deleteGame({ store, sessionId: other.session.id, gameId: created.gameId }),
    (error) => error instanceof NotFoundError && error.status === 404
  );
  await assert.rejects(
    deleteGame({ store, sessionId: other.session.id, gameId: 'unknown-game' }),
    (error) => error instanceof NotFoundError && error.status === 404
  );

  const deleted = await deleteGame({
    store,
    sessionId: owner.session.id,
    gameId: created.gameId,
    now: nowAt('2026-09-07T12:02:00.000Z')
  });
  assert.equal(deleted.deleted, true);
  assert.equal(store.games.has(created.gameId), false);
  assert.deepEqual(store.tombstones.get(created.gameId), {
    gameId: created.gameId,
    sessionId: owner.session.id,
    deletedAt: nowAt('2026-09-07T12:02:00.000Z')
  });

  const repeated = await deleteGame({ store, sessionId: owner.session.id, gameId: created.gameId });
  assert.equal(repeated.repeated, true);
  await assert.rejects(
    deleteGame({ store, sessionId: other.session.id, gameId: created.gameId }),
    (error) => error.status === 404
  );
});

test('mutation headers enforce matching Origin and JSON content type', () => {
  assert.doesNotThrow(() => validateMutationHeaders({
    headers: { origin: ENV.APP_ORIGIN, 'content-type': 'application/json; charset=utf-8' },
    env: ENV,
    requireJson: true
  }));
  assert.throws(
    () => validateMutationHeaders({
      headers: { origin: 'https://evil.example', 'content-type': 'application/json' },
      env: ENV,
      requireJson: true
    }),
    (error) => error.status === 403
  );
  assert.throws(
    () => validateMutationHeaders({
      headers: { origin: ENV.APP_ORIGIN, 'content-type': 'text/plain' },
      env: ENV,
      requireJson: true
    }),
    (error) => error.status === 415
  );
});

test('Postgres transactions use a checked-out client and roll back failures', async () => {
  const calls = [];
  const client = {
    async query(sql, parameters) {
      calls.push({ sql, parameters });
      if (sql === 'SELECT 1 AS marker') return { rows: [{ marker: 1 }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    }
  };
  const store = new PostgresStore({
    databaseUrl: 'postgres://example.test/spy',
    client
  });
  const result = await store.withTransaction(async (tx) => tx.query('SELECT 1 AS marker'));
  assert.equal(result.rows[0].marker, 1);
  assert.deepEqual(calls.map((call) => call.sql), ['BEGIN', 'SELECT 1 AS marker', 'COMMIT']);

  const failure = new Error('boom');
  await assert.rejects(
    store.withTransaction(async () => { throw failure; }),
    failure
  );
  assert.equal(calls.at(-1).sql, 'ROLLBACK');
});

test('Postgres game updates whitelist internal fields and map camelCase to SQL columns', async () => {
  const calls = [];
  const transaction = new PostgresTransaction({
    async query(sql, parameters) {
      calls.push({ sql, parameters });
      return { rows: [], rowCount: 0 };
    }
  });

  await assert.rejects(
    transaction.updateGame('game-1', { currentPhase: 'round', attackerColumn: 'injected' }),
    (error) => error.code === 'VALIDATION_ERROR'
  );
  assert.equal(calls.length, 0, 'unknown fields must be rejected before SQL construction');

  await transaction.updateGame('game-1', {
    currentPhase: 'round',
    currentRevealIndex: 2,
    revision: 3
  });
  assert.match(calls[0].sql, /current_phase = \$2/);
  assert.match(calls[0].sql, /current_reveal_index = \$3/);
  assert.match(calls[0].sql, /revision = \$4/);
  assert.doesNotMatch(calls[0].sql, /currentPhase|currentRevealIndex|attackerColumn/);
  assert.deepEqual(calls[0].parameters, ['game-1', 'round', 2, 3]);
});

test('Postgres mutation commits expiry reconciliation before returning a stale revision conflict', async () => {
  const calls = [];
  let applied = false;
  const client = {
    async query(sql, parameters) {
      calls.push({ sql, parameters });
      if (sql.includes('FROM games')) {
        return {
          rows: [{
            id: 'game-1',
            session_id: 'session-1',
            timer_seconds: 300,
            current_round_number: 1,
            current_phase: 'round',
            current_reveal_index: 4,
            current_deadline_at: nowAt('2026-09-07T11:59:00.000Z'),
            current_accused_player_id: null,
            current_winner: null,
            current_reason: null,
            revision: 5,
            created_at: nowAt(),
            updated_at: nowAt()
          }],
          rowCount: 1
        };
      }
      if (sql.includes('FROM players')) {
        return {
          rows: [0, 1, 2, 3].map((seat) => ({
            id: `player-${seat}`,
            game_id: 'game-1',
            seat,
            display_name: `Player ${seat + 1}`
          })),
          rowCount: 4
        };
      }
      if (sql.includes('FROM rounds')) {
        return {
          rows: [{
            id: 'round-1',
            game_id: 'game-1',
            round_number: 1,
            location_name: 'Airport',
            location_category: 'Travel',
            phase: 'round',
            reveal_index: 4,
            deadline_at: nowAt('2026-09-07T11:59:00.000Z'),
            accused_player_id: null,
            guess: null,
            winner: null,
            reason: null,
            started_at: nowAt(),
            completed_at: null
          }],
          rowCount: 1
        };
      }
      if (sql.includes('FROM assignments')) {
        return {
          rows: [
            { round_id: 'round-1', player_id: 'player-0', is_spy: true },
            { round_id: 'round-1', player_id: 'player-1', is_spy: false },
            { round_id: 'round-1', player_id: 'player-2', is_spy: false },
            { round_id: 'round-1', player_id: 'player-3', is_spy: false }
          ],
          rowCount: 4
        };
      }
      if (sql.includes('FROM command_receipts')) return { rows: [], rowCount: 0 };
      return { rows: [], rowCount: 0 };
    }
  };
  const store = new PostgresStore({ databaseUrl: 'postgres://example.test/spy', client });

  await assert.rejects(
    store.runMutationTransaction({
      sessionId: 'session-1',
      gameId: 'game-1',
      expectedRevision: 5,
      idempotencyKey: 'stale-postgres',
      requestHash: 'hash',
      now: nowAt('2026-09-07T12:01:00.000Z'),
      apply: async () => {
        applied = true;
      }
    }),
    (error) => error.status === 409
      && error.code === 'REVISION_CONFLICT'
      && error.details.actualRevision === 6
  );
  assert.equal(applied, false);
  assert.equal(calls[0].sql, 'BEGIN');
  assert.equal(calls.at(-1).sql, 'COMMIT');
  assert.equal(calls.some((call) => call.sql.includes('UPDATE rounds SET phase')), true);
  assert.equal(calls.some((call) => call.sql.includes('UPDATE games SET')), true);
  assert.equal(calls.some((call) => call.sql.includes('FROM command_receipts')), true);
  assert.equal(calls.some((call) => call.sql === 'ROLLBACK'), false);

  const illegalAfterExpiry = new HttpError(
    409,
    'INVALID_PHASE',
    'Cannot end-round while the game is in accuse.',
    { phase: 'accuse' }
  );
  let observedPhase = null;
  await assert.rejects(
    store.runMutationTransaction({
      sessionId: 'session-1',
      gameId: 'game-1',
      expectedRevision: 6,
      idempotencyKey: 'illegal-post-expiry',
      requestHash: 'illegal-hash',
      now: nowAt('2026-09-07T12:01:00.000Z'),
      apply: async (_tx, reconciledGame) => {
        observedPhase = reconciledGame.currentPhase;
        throw illegalAfterExpiry;
      }
    }),
    (error) => error === illegalAfterExpiry
  );
  assert.equal(observedPhase, 'accuse');
  assert.equal(calls.at(-1).sql, 'COMMIT');
  assert.equal(calls.filter((call) => call.sql === 'COMMIT').length, 2);
  assert.equal(calls.filter((call) => call.sql === 'ROLLBACK').length, 0);
});

test('games routes bootstrap sessions, require create idempotency, and mark responses no-store', async () => {
  const gamesRoute = require('../api/games/index.js').createHandler({
    store: new MemoryStore(),
    env: ENV,
    now: nowAt()
  });
  const bootstrapResponse = fakeResponse();
  const bootstrapRequest = request({ headers: {} });
  await gamesRoute(bootstrapRequest, bootstrapResponse);
  assert.equal(bootstrapResponse.statusCode, 200);
  assert.match(bootstrapResponse.headers['set-cookie'], /Max-Age=2592000/);
  assert.equal(bootstrapResponse.headers['cache-control'], 'no-store');
  const sessionCookie = bootstrapResponse.headers['set-cookie'].split(';')[0];

  const missingKeyResponse = fakeResponse();
  await gamesRoute(
    request({
      method: 'POST',
      headers: { cookie: sessionCookie, origin: ENV.APP_ORIGIN, 'content-type': 'application/json' },
      body: JSON.stringify({ players: ['Ana', 'Bea', 'Cy', 'Dee'], timerSeconds: 300 })
    }),
    missingKeyResponse
  );
  assert.equal(missingKeyResponse.statusCode, 400);
  assert.equal(missingKeyResponse.headers['cache-control'], 'no-store');

  const createResponse = fakeResponse();
  await gamesRoute(
    request({
      method: 'POST',
      headers: {
        cookie: sessionCookie,
        origin: ENV.APP_ORIGIN,
        'content-type': 'application/json',
        'idempotency-key': 'route-create-1'
      },
      body: JSON.stringify({ players: ['Ana', 'Bea', 'Cy', 'Dee'], timerSeconds: 300 })
    }),
    createResponse
  );
  assert.equal(createResponse.statusCode, 201);
  assert.equal(createResponse.headers['cache-control'], 'no-store');
  assert.equal(JSON.parse(createResponse.body).data.phase, 'reveal');
});

test('game snapshot and deletion routes authorize the cookie owner and return no-store responses', async () => {
  const store = new MemoryStore();
  const indexRoute = require('../api/games/index.js').createHandler({ store, env: ENV, now: nowAt() });
  const gameRoute = require('../api/games/[gameId].js').createHandler({ store, env: ENV, now: nowAt() });

  const bootstrapResponse = fakeResponse();
  await indexRoute(request(), bootstrapResponse);
  const ownerCookie = bootstrapResponse.headers['set-cookie'].split(';')[0];
  const createResponse = fakeResponse();
  await indexRoute(request({
    method: 'POST',
    headers: {
      cookie: ownerCookie,
      origin: ENV.APP_ORIGIN,
      'content-type': 'application/json',
      'idempotency-key': 'route-game'
    },
    body: JSON.stringify({ players: ['Ana', 'Bea', 'Cy', 'Dee'], timerSeconds: 300 })
  }), createResponse);
  const gameId = JSON.parse(createResponse.body).data.gameId;

  const ownerGet = fakeResponse();
  await gameRoute(request({
    url: `/api/games/${gameId}`,
    headers: { cookie: ownerCookie }
  }), ownerGet);
  assert.equal(ownerGet.statusCode, 200);
  assert.equal(ownerGet.headers['cache-control'], 'no-store');
  assertActiveSnapshotIsSanitized(JSON.parse(ownerGet.body).data);

  const foreignGet = fakeResponse();
  await gameRoute(request({
    url: `/api/games/${gameId}`,
    headers: { cookie: 'spy_session=foreign-token' }
  }), foreignGet);
  assert.equal(foreignGet.statusCode, 404);
  assert.equal(foreignGet.headers['cache-control'], 'no-store');

  const deleteResponse = fakeResponse();
  await gameRoute(request({
    method: 'DELETE',
    url: `/api/games/${gameId}`,
    headers: { cookie: ownerCookie, origin: ENV.APP_ORIGIN }
  }), deleteResponse);
  assert.equal(deleteResponse.statusCode, 204);
  assert.equal(deleteResponse.body, '');
  assert.equal(deleteResponse.headers['cache-control'], 'no-store');

  const repeatResponse = fakeResponse();
  await gameRoute(request({
    method: 'DELETE',
    url: `/api/games/${gameId}`,
    headers: { cookie: ownerCookie, origin: ENV.APP_ORIGIN }
  }), repeatResponse);
  assert.equal(repeatResponse.statusCode, 204);
});

test('create route rejects missing JSON headers, bad origins, and bodies over 64 KiB', async () => {
  const route = require('../api/games/index.js').createHandler({
    store: new MemoryStore(),
    env: ENV,
    now: nowAt()
  });
  const body = JSON.stringify({ players: ['Ana', 'Bea', 'Cy', 'Dee'], timerSeconds: 300 });
  for (const headers of [
    { origin: ENV.APP_ORIGIN, 'idempotency-key': 'missing-content-type' },
    { origin: 'https://evil.example', 'content-type': 'application/json', 'idempotency-key': 'bad-origin' }
  ]) {
    const response = fakeResponse();
    await route(request({ method: 'POST', headers, body }), response);
    assert.ok([403, 415].includes(response.statusCode));
    assert.equal(response.headers['cache-control'], 'no-store');
  }

  const oversized = fakeResponse();
  await route(request({
    method: 'POST',
    headers: {
      origin: ENV.APP_ORIGIN,
      'content-type': 'application/json',
      'idempotency-key': 'oversized'
    },
    body: `{"players":["Ana","Bea","Cy","Dee"],"timerSeconds":300,"padding":"${'x'.repeat(66000)}"}`
  }), oversized);
  assert.equal(oversized.statusCode, 413);
  assert.equal(JSON.parse(oversized.body).error.code, 'VALIDATION_ERROR');
});

test('DELETE route rejects non-empty bodies even when content length is absent', async () => {
  const store = new MemoryStore();
  const session = await createSession({ store, env: ENV, now: nowAt() });
  const created = await createGame({
    store,
    sessionId: session.session.id,
    players: ['Ana', 'Bea', 'Cy', 'Dee'],
    timerSeconds: 300,
    now: nowAt(),
    idempotencyKey: 'delete-body-small'
  });
  const route = require('../api/games/[gameId].js').createHandler({ store, env: ENV, now: nowAt() });
  const cookie = buildSessionCookie(session.rawToken, { env: ENV, now: nowAt() }).split(';')[0];

  const smallBody = fakeResponse();
  await route(request({
    method: 'DELETE',
    url: `/api/games/${created.gameId}`,
    headers: { cookie, origin: ENV.APP_ORIGIN },
    body: '{}'
  }), smallBody);
  assert.equal(smallBody.statusCode, 400);
  assert.equal(JSON.parse(smallBody.body).error.code, 'VALIDATION_ERROR');
  assert.equal(store.games.has(created.gameId), true);

  const oversizedGame = await createGame({
    store,
    sessionId: session.session.id,
    players: ['Ena', 'Fay', 'Gia', 'Hal'],
    timerSeconds: 300,
    now: nowAt(),
    idempotencyKey: 'delete-body-large'
  });
  const largeBody = fakeResponse();
  await route(request({
    method: 'DELETE',
    url: `/api/games/${oversizedGame.gameId}`,
    headers: { cookie, origin: ENV.APP_ORIGIN },
    body: 'x'.repeat(65537)
  }), largeBody);
  assert.equal(largeBody.statusCode, 413);
  assert.equal(JSON.parse(largeBody.body).error.code, 'VALIDATION_ERROR');
  assert.equal(store.games.has(oversizedGame.gameId), true);
});

test('reveal returns one private card, while hide advances a sanitized snapshot once', async () => {
  const store = new MemoryStore();
  const session = await createSession({ store, env: ENV, now: nowAt() });
  const created = await createGame({
    store,
    sessionId: session.session.id,
    players: ['Ana', 'Bea', 'Cy', 'Dee'],
    timerSeconds: 300,
    random: () => 0,
    now: nowAt()
  });

  const revealed = await applyCardAction({
    store,
    sessionId: session.session.id,
    gameId: created.gameId,
    action: 'reveal',
    expectedRevision: 1,
    idempotencyKey: 'card-reveal-1',
    now: nowAt()
  });
  assert.equal(revealed.meta.revision, 1);
  assert.deepEqual(Object.keys(revealed.data), ['card']);
  assert.deepEqual(Object.keys(revealed.data.card).sort(), [
    'category',
    'isSpy',
    'location',
    'player'
  ]);
  assert.equal(revealed.data.card.player.displayName, 'Ana');
  assert.equal(typeof revealed.data.card.isSpy, 'boolean');
  assert.equal(JSON.stringify(revealed.data).includes('assignments'), false);
  assert.equal(store.games.get(created.gameId).revision, 1);

  const hidden = await applyCardAction({
    store,
    sessionId: session.session.id,
    gameId: created.gameId,
    action: 'hide',
    expectedRevision: 1,
    idempotencyKey: 'card-hide-1',
    now: nowAt()
  });
  assert.equal(hidden.meta.revision, 2);
  assert.equal(hidden.data.phase, 'reveal');
  assert.equal(hidden.data.revealIndex, 1);
  assert.equal(hidden.data.currentPlayer.displayName, 'Bea');
  assertActiveSnapshotIsSanitized(hidden.data);

  const replayedHide = await applyCardAction({
    store,
    sessionId: session.session.id,
    gameId: created.gameId,
    action: 'hide',
    expectedRevision: 1,
    idempotencyKey: 'card-hide-1',
    now: nowAt('2026-09-07T12:04:00.000Z')
  });
  assert.deepEqual(replayedHide, hidden);
  assert.equal(store.games.get(created.gameId).revision, 2);
});

test('hiding the final card starts the round with an absolute deadline and one revision increment', async () => {
  const startedAt = nowAt('2026-09-07T12:00:00.000Z');
  const game = await createRoundGame({ timerSeconds: 300, now: startedAt });
  const snapshot = await getGameSnapshot({
    store: game.store,
    sessionId: game.session.session.id,
    gameId: game.created.gameId,
    now: nowAt('2026-09-07T12:01:00.000Z')
  });

  assert.equal(game.revision, 5);
  assert.equal(snapshot.revision, 5);
  assert.equal(snapshot.phase, 'round');
  assert.equal(snapshot.currentPlayer, null);
  assert.equal(snapshot.deadlineAt, '2026-09-07T12:05:00.000Z');
  assert.equal(game.store.games.get(game.created.gameId).rounds[0].deadlineAt.toISOString(), '2026-09-07T12:05:00.000Z');
  assertActiveSnapshotIsSanitized(snapshot);
});

test('expired rounds reconcile on reads and commit before a stale mutation conflict', async () => {
  const game = await createRoundGame({ now: nowAt('2026-09-07T12:00:00.000Z') });
  const persisted = game.store.games.get(game.created.gameId);
  persisted.currentDeadlineAt = nowAt('2026-09-07T11:59:00.000Z');
  persisted.rounds[0].deadlineAt = nowAt('2026-09-07T11:59:00.000Z');

  const snapshot = await getGameSnapshot({
    store: game.store,
    sessionId: game.session.session.id,
    gameId: game.created.gameId,
    now: nowAt('2026-09-07T12:01:00.000Z')
  });
  assert.equal(snapshot.phase, 'accuse');
  assert.equal(snapshot.deadlineAt, null);
  assert.equal(snapshot.revision, 6);
  assert.equal(game.store.games.get(game.created.gameId).currentPhase, 'accuse');

  const second = await createRoundGame({ now: nowAt('2026-09-07T12:00:00.000Z') });
  const secondPersisted = second.store.games.get(second.created.gameId);
  secondPersisted.currentDeadlineAt = nowAt('2026-09-07T11:59:00.000Z');
  secondPersisted.rounds[0].deadlineAt = nowAt('2026-09-07T11:59:00.000Z');
  await assert.rejects(
    applyGameAction({
      store: second.store,
      sessionId: second.session.session.id,
      gameId: second.created.gameId,
      command: { type: 'end-round' },
      expectedRevision: 5,
      idempotencyKey: 'expired-stale-end',
      now: nowAt('2026-09-07T12:01:00.000Z')
    }),
    (error) => error.status === 409
      && error.code === 'REVISION_CONFLICT'
      && error.details.actualRevision === 6
  );
  assert.equal(second.store.games.get(second.created.gameId).currentPhase, 'accuse');
  assert.equal(second.store.games.get(second.created.gameId).revision, 6);
});

test('an illegal command after expiry still commits the authoritative accuse transition', async () => {
  const game = await createRoundGame({ now: nowAt('2026-09-07T12:00:00.000Z') });
  const persisted = game.store.games.get(game.created.gameId);
  persisted.currentDeadlineAt = nowAt('2026-09-07T11:59:00.000Z');
  persisted.rounds[0].deadlineAt = nowAt('2026-09-07T11:59:00.000Z');

  await assert.rejects(
    applyGameAction({
      store: game.store,
      sessionId: game.session.session.id,
      gameId: game.created.gameId,
      command: { type: 'end-round' },
      expectedRevision: 6,
      idempotencyKey: 'expired-illegal-command',
      now: nowAt('2026-09-07T12:01:00.000Z')
    }),
    (error) => error.status === 409 && error.code === 'INVALID_PHASE'
  );
  assert.equal(game.store.games.get(game.created.gameId).currentPhase, 'accuse');
  assert.equal(game.store.games.get(game.created.gameId).revision, 6);
});

test('end-round opens accusation and a wrong accusation immediately gives spies the win', async () => {
  const game = await createRoundGame();
  const ended = await applyGameAction({
    store: game.store,
    sessionId: game.session.session.id,
    gameId: game.created.gameId,
    command: { type: 'end-round' },
    expectedRevision: game.revision,
    idempotencyKey: 'end-round-wrong-path',
    now: nowAt()
  });
  assert.equal(ended.data.phase, 'accuse');
  assert.equal(ended.meta.revision, 6);

  const { nonSpyId, round } = gameSpyAndNonSpy(game.store, game.created.gameId);
  const result = await applyGameAction({
    store: game.store,
    sessionId: game.session.session.id,
    gameId: game.created.gameId,
    command: { type: 'accuse', playerId: nonSpyId },
    expectedRevision: ended.meta.revision,
    idempotencyKey: 'wrong-accusation',
    now: nowAt()
  });
  assert.equal(result.data.phase, 'result');
  assert.equal(result.data.outcome.winner, 'spies');
  assert.equal(result.data.outcome.reason, 'wrong-accusation');
  assert.equal(result.data.outcome.location, round.locationName);
  assert.equal(result.data.outcome.category, round.locationCategory);
  assert.equal(result.data.outcome.accusedPlayer.id, nonSpyId);
  assert.equal(result.data.outcome.spyPlayers.length, 1);
  assert.equal(result.meta.revision, 7);
});

test('a correct accusation opens one spy guess, and both guess outcomes resolve the result', async () => {
  for (const [guess, expectedWinner, expectedReason] of [
    ['Airport', 'spies', 'correct-guess'],
    ['Bank', 'group', 'wrong-guess']
  ]) {
    const game = await createRoundGame();
    const ended = await applyGameAction({
      store: game.store,
      sessionId: game.session.session.id,
      gameId: game.created.gameId,
      command: { type: 'end-round' },
      expectedRevision: game.revision,
      idempotencyKey: `end-round-${guess}`,
      now: nowAt()
    });
    const { spyId, round } = gameSpyAndNonSpy(game.store, game.created.gameId);
    const accused = await applyGameAction({
      store: game.store,
      sessionId: game.session.session.id,
      gameId: game.created.gameId,
      command: { type: 'accuse', playerId: spyId },
      expectedRevision: ended.meta.revision,
      idempotencyKey: `correct-accusation-${guess}`,
      now: nowAt()
    });
    assert.equal(accused.data.phase, 'spy-guess');
    assert.equal(accused.data.accusedPlayer.id, spyId);
    assert.equal(accused.meta.revision, 7);

    const result = await applyGameAction({
      store: game.store,
      sessionId: game.session.session.id,
      gameId: game.created.gameId,
      command: { type: 'guess', location: guess },
      expectedRevision: accused.meta.revision,
      idempotencyKey: `guess-${guess}`,
      now: nowAt()
    });
    assert.equal(result.data.phase, 'result');
    assert.equal(result.data.outcome.winner, expectedWinner);
    assert.equal(result.data.outcome.reason, expectedReason);
    assert.equal(result.data.outcome.location, round.locationName);
    assert.equal(result.data.outcome.guess, guess);
    assert.equal(result.meta.revision, 8);
  }
});

test('custom guesses are free text and normalize case and whitespace on the server', async () => {
  const game = await createRoundGame({
    secretMode: 'custom',
    customSecret: '  Moon\t\nBase  '
  });
  const active = await getGameSnapshot({
    store: game.store,
    sessionId: game.session.session.id,
    gameId: game.created.gameId,
    now: nowAt()
  });
  assert.equal(active.secretMode, 'custom');
  assert.equal(JSON.stringify(active).includes('Moon Base'), false);

  const ended = await applyGameAction({
    store: game.store,
    sessionId: game.session.session.id,
    gameId: game.created.gameId,
    command: { type: 'end-round' },
    expectedRevision: game.revision,
    idempotencyKey: 'custom-end-round',
    now: nowAt()
  });
  const { spyId } = gameSpyAndNonSpy(game.store, game.created.gameId);
  const accused = await applyGameAction({
    store: game.store,
    sessionId: game.session.session.id,
    gameId: game.created.gameId,
    command: { type: 'accuse', playerId: spyId },
    expectedRevision: ended.meta.revision,
    idempotencyKey: 'custom-accuse',
    now: nowAt()
  });
  assert.equal(accused.data.phase, 'spy-guess');
  assert.equal(accused.data.secretMode, 'custom');
  assert.equal(JSON.stringify(accused.data).includes('Moon Base'), false);

  const result = await applyGameAction({
    store: game.store,
    sessionId: game.session.session.id,
    gameId: game.created.gameId,
    command: {
      type: 'guess',
      playerId: spyId,
      location: '  moon\nBASE  '
    },
    expectedRevision: accused.meta.revision,
    idempotencyKey: 'custom-guess',
    now: nowAt()
  });
  assert.equal(result.data.phase, 'result');
  assert.equal(result.data.outcome.winner, 'spies');
  assert.equal(result.data.outcome.reason, 'correct-guess');
  assert.equal(result.data.outcome.location, 'Moon Base');
  assert.equal(result.data.outcome.category, 'Custom');
  assert.equal(JSON.stringify(result.data).includes('Moon Base'), true);
});

test('deck guesses remain restricted to the public location deck', async () => {
  const game = await createRoundGame();
  const ended = await applyGameAction({
    store: game.store,
    sessionId: game.session.session.id,
    gameId: game.created.gameId,
    command: { type: 'end-round' },
    expectedRevision: game.revision,
    idempotencyKey: 'deck-invalid-guess-end',
    now: nowAt()
  });
  const { spyId } = gameSpyAndNonSpy(game.store, game.created.gameId);
  const accused = await applyGameAction({
    store: game.store,
    sessionId: game.session.session.id,
    gameId: game.created.gameId,
    command: { type: 'accuse', playerId: spyId },
    expectedRevision: ended.meta.revision,
    idempotencyKey: 'deck-invalid-guess-accuse',
    now: nowAt()
  });
  await assert.rejects(
    applyGameAction({
      store: game.store,
      sessionId: game.session.session.id,
      gameId: game.created.gameId,
      command: { type: 'guess', playerId: spyId, location: 'Moon Base' },
      expectedRevision: accused.meta.revision,
      idempotencyKey: 'deck-invalid-guess',
      now: nowAt()
    }),
    (error) => error.code === 'VALIDATION_ERROR' && error.details.field === 'location'
  );
});

test('custom replay requires a fresh secret and hashes it for service idempotency', async () => {
  const game = await createRoundGame({
    secretMode: 'custom',
    customSecret: 'First Secret'
  });
  const ended = await applyGameAction({
    store: game.store,
    sessionId: game.session.session.id,
    gameId: game.created.gameId,
    command: { type: 'end-round' },
    expectedRevision: game.revision,
    idempotencyKey: 'custom-replay-end',
    now: nowAt()
  });
  const { nonSpyId } = gameSpyAndNonSpy(game.store, game.created.gameId);
  const result = await applyGameAction({
    store: game.store,
    sessionId: game.session.session.id,
    gameId: game.created.gameId,
    command: { type: 'accuse', playerId: nonSpyId },
    expectedRevision: ended.meta.revision,
    idempotencyKey: 'custom-replay-result',
    now: nowAt()
  });
  await assert.rejects(
    applyGameAction({
      store: game.store,
      sessionId: game.session.session.id,
      gameId: game.created.gameId,
      command: { type: 'replay' },
      expectedRevision: result.meta.revision,
      idempotencyKey: 'custom-replay-missing-secret',
      now: nowAt()
    }),
    (error) => error.code === 'VALIDATION_ERROR' && error.details.field === 'customSecret'
  );
  assert.equal(game.store.games.get(game.created.gameId).rounds.length, 1);

  const first = await applyGameAction({
    store: game.store,
    sessionId: game.session.session.id,
    gameId: game.created.gameId,
    command: { type: 'replay', customSecret: '  Second\tSecret  ' },
    expectedRevision: result.meta.revision,
    idempotencyKey: 'custom-replay-idempotency',
    now: nowAt()
  });
  assert.equal(first.data.secretMode, 'custom');
  assert.equal(JSON.stringify(first.data).includes('Second Secret'), false);
  assert.equal(game.store.games.get(game.created.gameId).rounds[1].locationName, 'Second Secret');

  await assert.rejects(
    applyGameAction({
      store: game.store,
      sessionId: game.session.session.id,
      gameId: game.created.gameId,
      command: { type: 'replay', customSecret: 'Third Secret' },
      expectedRevision: result.meta.revision,
      idempotencyKey: 'custom-replay-idempotency',
      now: nowAt()
    }),
    (error) => error.code === 'VALIDATION_ERROR'
  );
  assert.equal(game.store.games.get(game.created.gameId).rounds.length, 2);
});

test('the action route includes custom replay secrets in its idempotency hash', async () => {
  const game = await createRoundGame({
    secretMode: 'custom',
    customSecret: 'Route First Secret'
  });
  const ended = await applyGameAction({
    store: game.store,
    sessionId: game.session.session.id,
    gameId: game.created.gameId,
    command: { type: 'end-round' },
    expectedRevision: game.revision,
    idempotencyKey: 'route-custom-end',
    now: nowAt()
  });
  const { nonSpyId } = gameSpyAndNonSpy(game.store, game.created.gameId);
  const result = await applyGameAction({
    store: game.store,
    sessionId: game.session.session.id,
    gameId: game.created.gameId,
    command: { type: 'accuse', playerId: nonSpyId },
    expectedRevision: ended.meta.revision,
    idempotencyKey: 'route-custom-result',
    now: nowAt()
  });
  const route = require('../api/games/[gameId]/actions.js').createHandler({
    store: game.store,
    env: ENV,
    now: nowAt()
  });
  const cookie = buildSessionCookie(game.session.rawToken, { env: ENV, now: nowAt() }).split(';')[0];
  const firstResponse = fakeResponse();
  await route(request({
    method: 'POST',
    url: `/api/games/${game.created.gameId}/actions`,
    headers: {
      cookie,
      origin: ENV.APP_ORIGIN,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      type: 'replay',
      customSecret: 'Route Second Secret',
      expectedRevision: result.meta.revision,
      idempotencyKey: 'route-custom-replay'
    })
  }), firstResponse);
  assert.equal(firstResponse.statusCode, 200);
  const firstBody = JSON.parse(firstResponse.body);
  assert.equal(firstBody.data.secretMode, 'custom');

  const secondResponse = fakeResponse();
  await route(request({
    method: 'POST',
    url: `/api/games/${game.created.gameId}/actions`,
    headers: {
      cookie,
      origin: ENV.APP_ORIGIN,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      type: 'replay',
      customSecret: 'Route Different Secret',
      expectedRevision: result.meta.revision,
      idempotencyKey: 'route-custom-replay'
    })
  }), secondResponse);
  assert.equal(secondResponse.statusCode, 400);
  assert.equal(JSON.parse(secondResponse.body).error.code, 'VALIDATION_ERROR');
  assert.equal(game.store.games.get(game.created.gameId).rounds.length, 2);
});

test('duplicate action receipts replay before stale revision checks and foreign sessions cannot mutate', async () => {
  const game = await createRoundGame();
  const ended = await applyGameAction({
    store: game.store,
    sessionId: game.session.session.id,
    gameId: game.created.gameId,
    command: { type: 'end-round' },
    expectedRevision: game.revision,
    idempotencyKey: 'duplicate-end',
    now: nowAt()
  });
  const replay = await applyGameAction({
    store: game.store,
    sessionId: game.session.session.id,
    gameId: game.created.gameId,
    command: { type: 'end-round' },
    expectedRevision: game.revision,
    idempotencyKey: 'duplicate-end',
    now: nowAt('2026-09-07T12:04:00.000Z')
  });
  assert.deepEqual(replay, ended);
  assert.equal(game.store.games.get(game.created.gameId).revision, 6);

  const other = await createSession({ store: game.store, env: ENV, now: nowAt() });
  await assert.rejects(
    applyGameAction({
      store: game.store,
      sessionId: other.session.id,
      gameId: game.created.gameId,
      command: { type: 'accuse', playerId: game.store.games.get(game.created.gameId).players[0].id },
      expectedRevision: 6,
      idempotencyKey: 'foreign-action',
      now: nowAt()
    }),
    (error) => error.status === 404 && error.code === 'NOT_FOUND'
  );
});

test('illegal transitions and replay outside result are rejected without changing state', async () => {
  const store = new MemoryStore();
  const session = await createSession({ store, env: ENV, now: nowAt() });
  const created = await createGame({
    store,
    sessionId: session.session.id,
    players: ['Ana', 'Bea', 'Cy', 'Dee'],
    timerSeconds: 300,
    random: () => 0,
    now: nowAt()
  });
  const game = { store, session, created, revision: created.revision };
  await assert.rejects(
    applyGameAction({
      store: game.store,
      sessionId: game.session.session.id,
      gameId: game.created.gameId,
      command: { type: 'end-round' },
      expectedRevision: game.revision,
      idempotencyKey: 'illegal-end-during-reveal',
      now: nowAt()
    }),
    (error) => error.status === 409 && error.code === 'INVALID_PHASE'
  );
  assert.equal(game.store.games.get(game.created.gameId).revision, 1);

  await assert.rejects(
    applyGameAction({
      store: game.store,
      sessionId: game.session.session.id,
      gameId: game.created.gameId,
      command: { type: 'replay' },
      expectedRevision: game.revision,
      idempotencyKey: 'task-4-replay-not-yet',
      now: nowAt()
    }),
    (error) => error.status === 409 && error.code === 'INVALID_PHASE'
  );

  const round = game.store.games.get(game.created.gameId).rounds[0];
  assert.equal(round.phase, 'reveal');
});

test('card and action routes expose only their contract and enforce mutation headers', async () => {
  const store = new MemoryStore();
  const cardRoute = require('../api/games/[gameId]/card.js').createHandler({
    store,
    env: ENV,
    now: nowAt()
  });
  const actionRoute = require('../api/games/[gameId]/actions.js').createHandler({
    store,
    env: ENV,
    now: nowAt()
  });
  assert.equal(typeof cardRoute, 'function');
  assert.equal(typeof actionRoute, 'function');

  const session = await createSession({ store, env: ENV, now: nowAt() });
  const created = await createGame({
    store,
    sessionId: session.session.id,
    players: ['Ana', 'Bea', 'Cy', 'Dee'],
    timerSeconds: 300,
    random: () => 0,
    now: nowAt()
  });
  const cookie = buildSessionCookie(session.rawToken, { env: ENV, now: nowAt() }).split(';')[0];
  const cardResponse = fakeResponse();
  await cardRoute(request({
    method: 'POST',
    url: `/api/games/${created.gameId}/card`,
    headers: {
      cookie,
      origin: ENV.APP_ORIGIN,
      'content-type': 'application/json'
    },
    body: JSON.stringify({ action: 'reveal', expectedRevision: 1, idempotencyKey: 'route-reveal' })
  }), cardResponse);
  assert.equal(cardResponse.statusCode, 200);
  assert.equal(cardResponse.headers['cache-control'], 'no-store');
  const cardBody = JSON.parse(cardResponse.body);
  assert.deepEqual(Object.keys(cardBody.data), ['card']);
  assertActiveSnapshotIsSanitized(await getGameSnapshot({
    store,
    sessionId: session.session.id,
    gameId: created.gameId,
    now: nowAt()
  }));

  const badOrigin = fakeResponse();
  await cardRoute(request({
    method: 'POST',
    url: `/api/games/${created.gameId}/card`,
    headers: {
      cookie,
      origin: 'https://evil.example',
      'content-type': 'application/json'
    },
    body: JSON.stringify({ action: 'hide', expectedRevision: 1, idempotencyKey: 'route-hide-bad-origin' })
  }), badOrigin);
  assert.equal(badOrigin.statusCode, 403);
  assert.equal(badOrigin.headers['cache-control'], 'no-store');

  const roundGame = await createRoundGame();
  const roundActionRoute = require('../api/games/[gameId]/actions.js').createHandler({
    store: roundGame.store,
    env: ENV,
    now: nowAt()
  });
  const roundCookie = buildSessionCookie(roundGame.session.rawToken, { env: ENV, now: nowAt() }).split(';')[0];
  const actionResponse = fakeResponse();
  await roundActionRoute(request({
    method: 'POST',
    url: `/api/games/${roundGame.created.gameId}/actions`,
    headers: {
      cookie: roundCookie,
      origin: ENV.APP_ORIGIN,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      type: 'end-round',
      expectedRevision: roundGame.revision,
      idempotencyKey: 'route-end-round'
    })
  }), actionResponse);
  assert.equal(actionResponse.statusCode, 200);
  assert.equal(actionResponse.headers['cache-control'], 'no-store');
  assert.equal(JSON.parse(actionResponse.body).data.phase, 'accuse');
});

test('replay creates a fresh reveal round while preserving the completed round', async () => {
  const game = await createRoundGame({ random: () => 0 });
  const ended = await applyGameAction({
    store: game.store,
    sessionId: game.session.session.id,
    gameId: game.created.gameId,
    command: { type: 'end-round' },
    expectedRevision: game.revision,
    idempotencyKey: 'task-4-end-round',
    now: nowAt()
  });
  const { nonSpyId } = gameSpyAndNonSpy(game.store, game.created.gameId);
  const result = await applyGameAction({
    store: game.store,
    sessionId: game.session.session.id,
    gameId: game.created.gameId,
    command: { type: 'accuse', playerId: nonSpyId },
    expectedRevision: ended.meta.revision,
    idempotencyKey: 'task-4-result',
    now: nowAt()
  });
  const previous = game.store.games.get(game.created.gameId).rounds[0];

  const replay = await applyGameAction({
    store: game.store,
    sessionId: game.session.session.id,
    gameId: game.created.gameId,
    command: { type: 'replay' },
    expectedRevision: result.meta.revision,
    idempotencyKey: 'task-4-replay',
    random: () => 0,
    now: nowAt('2026-09-07T12:03:00.000Z')
  });

  assert.equal(replay.data.phase, 'reveal');
  assert.equal(replay.data.roundNumber, 2);
  assert.equal(replay.data.revealIndex, 0);
  assert.equal(replay.data.currentPlayer.displayName, 'Ana');
  assert.equal(replay.data.timerSeconds, game.created.timerSeconds);
  assert.equal(replay.meta.revision, result.meta.revision + 1);
  assertActiveSnapshotIsSanitized(replay.data);
  assert.equal(game.store.games.get(game.created.gameId).rounds.length, 2);
  assert.equal(previous.phase, 'result');
  assert.equal(previous.completedAt.toISOString(), '2026-09-07T12:00:00.000Z');
  assert.notEqual(
    game.store.games.get(game.created.gameId).rounds[1].locationName,
    previous.locationName
  );
});

test('round history is owner-scoped, bounded, descending, and result-only', async () => {
  const game = await createRoundGame();
  const ended = await applyGameAction({
    store: game.store,
    sessionId: game.session.session.id,
    gameId: game.created.gameId,
    command: { type: 'end-round' },
    expectedRevision: game.revision,
    idempotencyKey: 'history-end-round',
    now: nowAt()
  });
  const { nonSpyId } = gameSpyAndNonSpy(game.store, game.created.gameId);
  const result = await applyGameAction({
    store: game.store,
    sessionId: game.session.session.id,
    gameId: game.created.gameId,
    command: { type: 'accuse', playerId: nonSpyId },
    expectedRevision: ended.meta.revision,
    idempotencyKey: 'history-result',
    now: nowAt('2026-09-07T12:01:00.000Z')
  });
  const replay = await applyGameAction({
    store: game.store,
    sessionId: game.session.session.id,
    gameId: game.created.gameId,
    command: { type: 'replay' },
    expectedRevision: result.meta.revision,
    idempotencyKey: 'history-replay',
    random: () => 0,
    now: nowAt('2026-09-07T12:02:00.000Z')
  });

  let revision = replay.meta.revision;
  for (let index = 0; index < game.created.players.length; index += 1) {
    await applyCardAction({
      store: game.store,
      sessionId: game.session.session.id,
      gameId: game.created.gameId,
      action: 'reveal',
      expectedRevision: revision,
      idempotencyKey: `history-round-two-reveal-${index}`,
      now: nowAt('2026-09-07T12:03:00.000Z')
    });
    const hidden = await applyCardAction({
      store: game.store,
      sessionId: game.session.session.id,
      gameId: game.created.gameId,
      action: 'hide',
      expectedRevision: revision,
      idempotencyKey: `history-round-two-hide-${index}`,
      now: nowAt('2026-09-07T12:03:00.000Z')
    });
    revision = hidden.meta.revision;
  }
  const secondEnded = await applyGameAction({
    store: game.store,
    sessionId: game.session.session.id,
    gameId: game.created.gameId,
    command: { type: 'end-round' },
    expectedRevision: revision,
    idempotencyKey: 'history-round-two-end',
    now: nowAt('2026-09-07T12:04:00.000Z')
  });
  const { nonSpyId: secondNonSpyId } = gameSpyAndNonSpy(game.store, game.created.gameId);
  await applyGameAction({
    store: game.store,
    sessionId: game.session.session.id,
    gameId: game.created.gameId,
    command: { type: 'accuse', playerId: secondNonSpyId },
    expectedRevision: secondEnded.meta.revision,
    idempotencyKey: 'history-round-two-result',
    now: nowAt('2026-09-07T12:05:00.000Z')
  });

  const firstPage = await listRoundHistory({
    store: game.store,
    sessionId: game.session.session.id,
    gameId: game.created.gameId,
    limit: 1
  });
  assert.equal(firstPage.items.length, 1);
  assert.equal(firstPage.items[0].roundNumber, 2);
  assert.equal(firstPage.items[0].winner, 'spies');
  assert.notEqual(firstPage.items[0].location, 'Airport');
  assert.equal(firstPage.items[0].category, 'Workplaces');
  assert.equal(firstPage.items[0].spyPlayers.length, 1);
  assert.equal(firstPage.items[0].accusedPlayer.id, secondNonSpyId);
  assert.equal(firstPage.items[0].guess, null);
  assert.equal(firstPage.items[0].completedAt, '2026-09-07T12:05:00.000Z');
  assert.equal(firstPage.items[0].phase, undefined);
  assert.equal(firstPage.items[0].assignments, undefined);
  assert.equal(firstPage.items[0].isSpy, undefined);
  assert.ok(firstPage.nextCursor);

  const secondPage = await listRoundHistory({
    store: game.store,
    sessionId: game.session.session.id,
    gameId: game.created.gameId,
    limit: 1,
    cursor: firstPage.nextCursor
  });
  assert.equal(secondPage.items.length, 1);
  assert.equal(secondPage.items[0].roundNumber, 1);
  assert.equal(secondPage.nextCursor, null);

  const other = await createSession({ store: game.store, env: ENV, now: nowAt() });
  await assert.rejects(
    listRoundHistory({
      store: game.store,
      sessionId: other.session.id,
      gameId: game.created.gameId,
      limit: 10
    }),
    (error) => error.status === 404 && error.code === 'NOT_FOUND'
  );
});

test('replay preserves the roster and spy-count boundaries for 4, 8, 9, and 12 players', async () => {
  for (const count of [4, 8, 9, 12]) {
    const players = Array.from({ length: count }, (_, index) => `Player ${index + 1}`);
    const game = await createRoundGame({ players, random: () => 0 });
    const ended = await applyGameAction({
      store: game.store,
      sessionId: game.session.session.id,
      gameId: game.created.gameId,
      command: { type: 'end-round' },
      expectedRevision: game.revision,
      idempotencyKey: `boundary-end-${count}`,
      now: nowAt()
    });
    const { nonSpyId } = gameSpyAndNonSpy(game.store, game.created.gameId);
    const result = await applyGameAction({
      store: game.store,
      sessionId: game.session.session.id,
      gameId: game.created.gameId,
      command: { type: 'accuse', playerId: nonSpyId },
      expectedRevision: ended.meta.revision,
      idempotencyKey: `boundary-result-${count}`,
      now: nowAt()
    });
    await applyGameAction({
      store: game.store,
      sessionId: game.session.session.id,
      gameId: game.created.gameId,
      command: { type: 'replay' },
      expectedRevision: result.meta.revision,
      idempotencyKey: `boundary-replay-${count}`,
      random: () => 0,
      now: nowAt()
    });
    const persisted = game.store.games.get(game.created.gameId);
    assert.deepEqual(
      persisted.players.map((player) => player.displayName),
      players
    );
    assert.equal(persisted.rounds[1].assignments.filter((assignment) => assignment.isSpy).length, count <= 8 ? 1 : 2);
  }
});

test('replay receipts are idempotent and stale revisions are rejected', async () => {
  const game = await createRoundGame();
  const ended = await applyGameAction({
    store: game.store,
    sessionId: game.session.session.id,
    gameId: game.created.gameId,
    command: { type: 'end-round' },
    expectedRevision: game.revision,
    idempotencyKey: 'replay-receipt-end',
    now: nowAt()
  });
  const { nonSpyId } = gameSpyAndNonSpy(game.store, game.created.gameId);
  const result = await applyGameAction({
    store: game.store,
    sessionId: game.session.session.id,
    gameId: game.created.gameId,
    command: { type: 'accuse', playerId: nonSpyId },
    expectedRevision: ended.meta.revision,
    idempotencyKey: 'replay-receipt-result',
    now: nowAt()
  });
  const command = {
    store: game.store,
    sessionId: game.session.session.id,
    gameId: game.created.gameId,
    command: { type: 'replay' },
    expectedRevision: result.meta.revision,
    idempotencyKey: 'replay-receipt',
    random: () => 0,
    now: nowAt()
  };
  const first = await applyGameAction(command);
  const duplicate = await applyGameAction({ ...command, random: () => 0.9 });
  assert.deepEqual(duplicate, first);
  assert.equal(game.store.games.get(game.created.gameId).rounds.length, 2);
  await assert.rejects(
    applyGameAction({
      ...command,
      idempotencyKey: 'replay-stale',
      expectedRevision: first.meta.revision - 1
    }),
    (error) => error.status === 409 && error.code === 'REVISION_CONFLICT'
  );
  assert.equal(game.store.games.get(game.created.gameId).rounds.length, 2);
});

test('round history route validates pagination, hides foreign games, and is no-store', async () => {
  const store = new MemoryStore();
  const indexRoute = require('../api/games/index.js').createHandler({ store, env: ENV, now: nowAt() });
  const roundsRoute = require('../api/games/[gameId]/rounds.js').createHandler({ store, env: ENV, now: nowAt() });
  const bootstrap = fakeResponse();
  await indexRoute(request(), bootstrap);
  const cookie = bootstrap.headers['set-cookie'].split(';')[0];
  const createResponse = fakeResponse();
  await indexRoute(request({
    method: 'POST',
    headers: {
      cookie,
      origin: ENV.APP_ORIGIN,
      'content-type': 'application/json',
      'idempotency-key': 'history-route-create'
    },
    body: JSON.stringify({ players: ['Ana', 'Bea', 'Cy', 'Dee'], timerSeconds: 300 })
  }), createResponse);
  const gameId = JSON.parse(createResponse.body).data.gameId;

  const invalid = fakeResponse();
  await roundsRoute(request({
    url: `/api/games/${gameId}/rounds?limit=0`,
    headers: { cookie }
  }), invalid);
  assert.equal(invalid.statusCode, 400);
  assert.equal(JSON.parse(invalid.body).error.code, 'VALIDATION_ERROR');
  assert.equal(invalid.headers['cache-control'], 'no-store');

  const owner = fakeResponse();
  await roundsRoute(request({ url: `/api/games/${gameId}/rounds?limit=1`, headers: { cookie } }), owner);
  assert.equal(owner.statusCode, 200);
  assert.equal(owner.headers['cache-control'], 'no-store');
  assert.deepEqual(JSON.parse(owner.body).data, { items: [], nextCursor: null });

  const foreign = fakeResponse();
  await roundsRoute(request({
    url: `/api/games/${gameId}/rounds`,
    headers: { cookie: 'spy_session=foreign-token' }
  }), foreign);
  assert.equal(foreign.statusCode, 404);
  assert.equal(foreign.headers['cache-control'], 'no-store');
});

test('delete cascade removes dependent memory rows and preserves owner-only tombstone repeats', async () => {
  const game = await createRoundGame();
  const { nonSpyId } = gameSpyAndNonSpy(game.store, game.created.gameId);
  const ended = await applyGameAction({
    store: game.store,
    sessionId: game.session.session.id,
    gameId: game.created.gameId,
    command: { type: 'end-round' },
    expectedRevision: game.revision,
    idempotencyKey: 'delete-cascade-end',
    now: nowAt()
  });
  await applyGameAction({
    store: game.store,
    sessionId: game.session.session.id,
    gameId: game.created.gameId,
    command: { type: 'accuse', playerId: nonSpyId },
    expectedRevision: ended.meta.revision,
    idempotencyKey: 'delete-cascade-result',
    now: nowAt()
  });
  const record = game.store.games.get(game.created.gameId);
  const playerIds = record.players.map((player) => player.id);
  const roundIds = record.rounds.map((round) => round.id);
  await deleteGame({
    store: game.store,
    sessionId: game.session.session.id,
    gameId: game.created.gameId,
    now: nowAt('2026-09-07T12:02:00.000Z')
  });
  assert.equal(game.store.games.has(game.created.gameId), false);
  assert.equal(playerIds.some((id) => game.store.players.has(id)), false);
  assert.equal(roundIds.some((id) => game.store.rounds.has(id)), false);
  assert.equal([...game.store.assignments.values()].some((assignment) => roundIds.includes(assignment.roundId)), false);
  assert.equal([...game.store.commandReceipts.values()].some((receipt) => receipt.gameId === game.created.gameId), false);
  await assert.doesNotReject(() => deleteGame({
    store: game.store,
    sessionId: game.session.session.id,
    gameId: game.created.gameId
  }));
  const foreign = await createSession({ store: game.store, env: ENV, now: nowAt() });
  await assert.rejects(
    deleteGame({ store: game.store, sessionId: foreign.session.id, gameId: game.created.gameId }),
    (error) => error.status === 404 && error.code === 'NOT_FOUND'
  );
});
