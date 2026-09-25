const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Readable } = require('node:stream');
const test = require('node:test');

const PROJECT_ROOT = path.join(__dirname, '..');

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(PROJECT_ROOT, relativePath), 'utf8');
}

function parseProjectJson(relativePath) {
  return JSON.parse(readProjectFile(relativePath));
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

test('project metadata pins current Node runtime, an exact Neon Postgres driver, and required scripts', () => {
  const packageJson = parseProjectJson('package.json');

  assert.equal(packageJson.engines.node, '24.x', 'Vercel deployments must use the current Node.js runtime');
  const driverVersion = packageJson.dependencies['@neondatabase/serverless'];
  assert.ok(driverVersion, 'the Neon Postgres driver must be declared');
  assert.match(driverVersion, /^\d+\.\d+\.\d+$/, 'the driver version must not be a range');
  assert.equal(typeof packageJson.scripts.test, 'string');
  assert.equal(typeof packageJson.scripts.migrate, 'string');
  assert.equal(fs.existsSync(path.join(PROJECT_ROOT, 'package-lock.json')), true);
});

test('Vercel packaging leaves every nested API path as a function route', () => {
  const vercelJson = parseProjectJson('vercel.json');

  assert.equal(vercelJson.rewrites, undefined, 'API paths must not be rewritten to the shell');
  assert.equal(vercelJson.routes, undefined, 'implicit API routing must remain intact');
  assert.ok(vercelJson.functions, 'Node functions must be configured explicitly');
  const apiFunctionConfig = vercelJson.functions['api/**/*.js'];
  assert.ok(apiFunctionConfig, 'nested API functions must be matched');
  assert.equal(apiFunctionConfig.runtime, undefined, 'supported Node.js functions must not declare a community runtime');
  assert.equal(typeof apiFunctionConfig.maxDuration, 'number');
});

test('repository and Vercel ignore files exclude secrets and non-runtime assets', () => {
  const gitignore = readProjectFile('.gitignore');
  const vercelignore = readProjectFile('.vercelignore');

  assert.match(gitignore, /(?:^|\n)\.env(?:\.|\n|$)/);
  assert.match(gitignore, /node_modules\/?/);
  assert.match(vercelignore, /(?:^|\n)\.env\*/);
  for (const pathFragment of ['test/', 'docs/', 'database/migrations/', 'scripts/']) {
    assert.match(vercelignore, new RegExp(pathFragment.replace('/', '\\/')));
  }
});

test('initial migration defines every persistence table and lookup constraint', () => {
  const migration = readProjectFile('database/migrations/001_initial.sql');
  const tables = [
    'schema_migrations',
    'sessions',
    'games',
    'players',
    'rounds',
    'assignments',
    'command_receipts',
    'creation_receipts',
    'game_tombstones'
  ];

  for (const table of tables) {
    assert.match(migration, new RegExp(`create table if not exists\\s+${table}\\b`, 'i'));
  }

  assert.match(migration, /token_hash[\s\S]*unique|unique[\s\S]*token_hash/i);
  assert.match(migration, /unique\s*\(\s*game_id\s*,\s*seat\s*\)/i);
  assert.match(migration, /unique\s*\(\s*game_id\s*,\s*round_number\s*\)/i);
  assert.match(migration, /primary key\s*\(\s*round_id\s*,\s*player_id\s*\)/i);
  assert.match(migration, /unique\s*\(\s*game_id\s*,\s*idempotency_key\s*\)/i);
  assert.match(migration, /unique\s*\(\s*session_id\s*,\s*idempotency_key\s*\)/i);
  assert.match(migration, /game_tombstones[\s\S]*deleted_at/i);
  const tombstoneTable = migration.match(
    /create table if not exists\s+game_tombstones\b[\s\S]*?\n\);/i
  );
  assert.ok(tombstoneTable, 'the tombstone table definition must be present');
  assert.match(tombstoneTable[0], /session_id\s+uuid\s+not null/i);
  assert.doesNotMatch(
    tombstoneTable[0],
    /session_id[\s\S]*on delete cascade/i,
    'tombstone ownership history must survive session cleanup'
  );
  assert.match(migration, /on delete cascade/i);
  assert.match(migration, /create index/i);
});

test('tombstone retention has a forward migration for existing databases', () => {
  const forwardMigration = readProjectFile('database/migrations/002_tombstone_retention.sql');

  assert.match(forwardMigration, /alter table\s+game_tombstones/i);
  assert.match(
    forwardMigration,
    /drop constraint if exists\s+game_tombstones_session_id_fkey/i
  );
  assert.match(
    readProjectFile('database/migrations/001_initial.sql'),
    /create table if not exists\s+game_tombstones[\s\S]*session_id\s+uuid\s+not null\s*,/i
  );
  assert.doesNotMatch(
    readProjectFile('database/migrations/001_initial.sql'),
    /create table if not exists\s+game_tombstones[\s\S]*session_id[\s\S]*on delete cascade/i
  );
});

test('location board schema is additive and nullable for legacy games', () => {
  const migration = readProjectFile('database/migrations/006_location_board.sql');

  assert.match(migration, /alter table\s+games/i);
  assert.match(migration, /add column if not exists\s+board_locations\s+text\[\]\s+null/i);
});

test('configuration exposes the stable shape and rejects incomplete production secrets', () => {
  const { ConfigurationError, readConfig } = require('../server/config.js');
  const localConfig = readConfig({ NODE_ENV: 'development', APP_ORIGIN: 'http://localhost:3000' });

  assert.deepEqual(localConfig, {
    databaseUrl: '',
    sessionSecret: '',
    cronSecret: '',
    appOrigin: 'http://localhost:3000',
    isProduction: false
  });
  assert.throws(
    () => readConfig({ NODE_ENV: 'production', APP_ORIGIN: 'https://spy.example.com' }),
    (error) => error instanceof ConfigurationError && error.name === 'ConfigurationError'
  );
  assert.throws(
    () => readConfig({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgres://example.test/spy',
      SESSION_SECRET: 'session-secret',
      APP_ORIGIN: 'https://spy.example.com'
    }),
    (error) => error instanceof ConfigurationError
      && error.details.missing.includes('CRON_SECRET')
  );
});

test('JSON helpers produce JSON responses and structured body validation errors', async () => {
  const { parseJsonBody, sendJson } = require('../server/http.js');
  const response = fakeResponse();

  sendJson(response, 418, { error: { code: 'TEAPOT', message: 'short and stout' } }, { 'X-Test': 'yes' });
  assert.equal(response.statusCode, 418);
  assert.equal(response.headers['content-type'], 'application/json; charset=utf-8');
  assert.equal(response.headers['x-test'], 'yes');
  assert.deepEqual(JSON.parse(response.body), {
    error: { code: 'TEAPOT', message: 'short and stout' }
  });

  const request = Readable.from(['{"ok":true}']);
  request.headers = { 'content-type': 'application/json' };
  assert.deepEqual(await parseJsonBody(request), { ok: true });

  const oversizedRequest = Readable.from(['x'.repeat(20)]);
  oversizedRequest.headers = { 'content-type': 'application/json' };
  await assert.rejects(
    parseJsonBody(oversizedRequest, 8),
    (error) => error.code === 'VALIDATION_ERROR' && error.status === 413
  );
});

test('health handler returns only a small JSON health payload', () => {
  const health = require('../api/health.js');
  const response = fakeResponse();

  health({ method: 'GET', url: '/api/health' }, response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers['content-type'], 'application/json; charset=utf-8');
  assert.deepEqual(JSON.parse(response.body), { data: { ok: true } });
  assert.equal(response.body.includes('DATABASE_URL'), false);
});

test('migration runner executes one script and rolls back failures', async () => {
  const { MIGRATION_SQL, runMigrations } = require('../scripts/migrate.js');
  const calls = [];
  const client = {
    async query(sql, parameters) {
      calls.push({ sql, parameters });
      if (sql.startsWith('SELECT version')) {
        return { rowCount: 0 };
      }
      return { rowCount: 0 };
    }
  };

  await runMigrations({ env: { DATABASE_URL: 'postgres://example.test/spy' }, client });
  assert.equal(calls[0].sql, 'BEGIN');
  assert.equal(calls[calls.length - 1].sql, 'COMMIT');
  assert.ok(calls.some((call) => call.sql === MIGRATION_SQL));
  assert.ok(calls.some((call) => call.sql.startsWith('INSERT INTO schema_migrations')));

  const failedCalls = [];
  const failure = new Error('migration failed');
  const failingClient = {
    async query(sql, parameters) {
      failedCalls.push({ sql, parameters });
      if (sql === MIGRATION_SQL) {
        throw failure;
      }
      if (sql.startsWith('SELECT version')) {
        return { rowCount: 0 };
      }
      return { rowCount: 0 };
    }
  };

  await assert.rejects(
    runMigrations({ env: { DATABASE_URL: 'postgres://example.test/spy' }, client: failingClient }),
    failure
  );
  assert.equal(failedCalls[0].sql, 'BEGIN');
  assert.equal(failedCalls[failedCalls.length - 1].sql, 'ROLLBACK');
});

test('browser shell loads the API client before the controller and exposes resume/error/history surfaces', () => {
  const html = readProjectFile('index.html');
  const clientScript = html.indexOf('api-client.js');
  const controllerScript = html.indexOf('game.js');

  assert.match(html, /<title>Spy in the Room — Pass the phone<\/title>/i);
  assert.match(html, /class=["']brand-name["'][^>]*>SPY IN THE ROOM<\/span>/i);
  assert.match(html, /Everyone gets the secret except the spies/i);
  assert.ok(clientScript >= 0, 'the API client must be loaded');
  assert.ok(controllerScript > clientScript, 'the API client must load before the controller');
  for (const id of [
    'resume-view',
    'resume-list',
    'resume-new-game-button',
    'connection-error',
    'retry-button',
    'history-list',
    'delete-game-button',
    'delete-confirmation',
    'confirm-delete-button',
    'cancel-delete-button'
  ]) {
    assert.match(html, new RegExp(`id=["']${id}["']`), `missing semantic id: ${id}`);
  }
  assert.match(html, /id=["']resume-list["'][^>]*aria-live=["']polite["']/i);
  assert.match(html, /id=["']connection-error["'][^>]*role=["']alert["']/i);
  assert.doesNotMatch(html, /id=["']reveal-card["'][^>]*aria-live=/i);
});

test('browser shell exposes the Spyfall-inspired two-spy, vote, and score surfaces', () => {
  const html = readProjectFile('index.html');
  const controller = readProjectFile('game.js');
  const migration = readProjectFile('database/migrations/003_spyfall_refinements.sql');

  for (const id of [
    'call-guess-button',
    'guess-call-panel',
    'guess-caller-list',
    'accusation-confirmation',
    'confirm-accusation-button',
    'cancel-accusation-button',
    'guess-turn-label',
    'round-points-list',
    'scoreboard-list'
  ]) {
    assert.match(html, new RegExp(`id=["']${id}["']`), `missing refinement surface: ${id}`);
  }
  assert.match(html, /No follow-ups/i);
  assert.match(html, /room agrees/i);
  assert.match(controller, /type: 'call-guess'/);
  assert.match(controller, /guessingPlayer/);
  assert.match(controller, /pendingAccusationPlayerId/);
  assert.match(controller, /roundPointsList/);
  assert.match(migration, /round_limit/i);
  assert.match(migration, /guesses jsonb/i);
  assert.match(migration, /guess_order jsonb/i);
  assert.match(migration, /points jsonb/i);
});

test('browser assets stay same-origin and game state is not written to browser storage', () => {
  const html = readProjectFile('index.html');
  const css = readProjectFile('styles.css');
  const client = readProjectFile('api-client.js');
  const controller = readProjectFile('game.js');
  const prefs = readProjectFile('prefs.js');

  // User-facing links may point off-site, but every loaded resource must stay
  // same-origin so the game keeps working under the strict CSP.
  const externalResources = html.match(/(?:src|href)\s*=\s*["']https?:\/\//gi) || [];
  const externalResourceTags = externalResources.filter((value) => !/href/i.test(value.split('=')[0]));
  assert.deepEqual(externalResourceTags, [], 'scripts, images, and styles must be same-origin');
  assert.doesNotMatch(css, /https?:\/\//i);
  assert.match(client, /window\.SpyGameApi/);
  assert.doesNotMatch(`${client}\n${controller}`, /\b(?:localStorage|sessionStorage)\b/);
  assert.doesNotMatch(controller, /\b(?:round\.cards|dealRound\s*\()/);

  // prefs.js is the only storage surface, and its keys are an allow-list:
  // names, cue flags, and chaos mode. Secrets and game state never land here.
  assert.match(prefs, /localStorage/);
  assert.doesNotMatch(prefs, /\b(card|snapshot|gameId|location|revealSecret)\b/i);
});

test('API client forwards credentials, no-store caching, revisions, and retry keys', async () => {
  const api = require('../api-client.js');
  const previousFetch = global.fetch;
  const calls = [];

  global.fetch = async (url, options) => {
    calls.push({ url, options });
    return {
      ok: true,
      status: 200,
      async json() {
        return { data: { card: { player: { id: 'player-1' } } }, meta: { revision: 3 } };
      }
    };
  };

  try {
    await api.getCard('game/1', 'reveal', 3, { idempotencyKey: 'retry-key' });
    await api.getCard('game/1', 'reveal', 3, { idempotencyKey: 'retry-key' });
  } finally {
    global.fetch = previousFetch;
  }

  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, '/api/games/game%2F1/card');
  assert.equal(calls[0].options.credentials, 'include');
  assert.equal(calls[0].options.cache, 'no-store');
  assert.equal(calls[0].options.headers['Idempotency-Key'], 'retry-key');
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    action: 'reveal',
    expectedRevision: 3,
    idempotencyKey: 'retry-key'
  });
  assert.equal(calls[1].options.headers['Idempotency-Key'], 'retry-key');
});

test('API client exposes structured server errors and handles a no-content delete', async () => {
  const api = require('../api-client.js');
  const previousFetch = global.fetch;
  let callCount = 0;

  global.fetch = async () => {
    callCount += 1;
    if (callCount === 1) {
      return {
        ok: false,
        status: 409,
        async json() {
          return { error: { code: 'REVISION_CONFLICT', message: 'State changed.' } };
        }
      };
    }
    return {
      ok: true,
      status: 204,
      async json() {
        throw new Error('no body');
      }
    };
  };

  try {
    await assert.rejects(
      api.act('game-1', 'end-round', 4, { idempotencyKey: 'same-intent' }),
      (error) => error.code === 'REVISION_CONFLICT' && error.status === 409 && error.message === 'State changed.'
    );
    assert.deepEqual(await api.deleteGame('game-1', { idempotencyKey: 'delete-intent' }), {
      data: null,
      meta: {}
    });
  } finally {
    global.fetch = previousFetch;
  }
});

test('browser controller gates creation on session bootstrap and rejects stale async reads', () => {
  const controller = readProjectFile('game.js');

  assert.match(controller, /sessionReady:\s*false/);
  assert.match(controller, /refs\.startButton\.disabled\s*=\s*!validation\.ok\s*\|\|\s*!state\.sessionReady/);
  assert.match(controller, /function canApplySnapshot\s*\(/);
  assert.match(controller, /function hasCurrentSnapshotRevision\s*\(/);
  assert.match(controller, /!hasCurrentSnapshotRevision\(snapshot\)/);
  assert.match(controller, /nextRevision\s*>=\s*currentRevision/);
  assert.match(controller, /latestSnapshotRequest/);
});

test('browser controller keeps mutation queue cleanup attached to its stored tail', () => {
  const controller = readProjectFile('game.js');

  assert.match(controller, /var tail\s*=\s*next\.then\(/);
  assert.match(controller, /state\.mutationQueues\[gameId\]\s*===\s*tail/);
  assert.match(controller, /return null;/);
});

test('browser controller clears connection errors after successful refreshes', () => {
  const controller = readProjectFile('game.js');
  const clearCalls = controller.match(/clearConnectionError\(operationEpoch\)/g) || [];

  assert.ok(clearCalls.length >= 3, 'mutation, snapshot, and history success paths must clear errors');
  assert.match(controller, /function loadHistory[\s\S]*?clearConnectionError\(operationEpoch\)[\s\S]*?render\(\);/);
});

test('browser controller preserves newer connection errors over older read completions', () => {
  const controller = readProjectFile('game.js');

  assert.match(controller, /connectionOperationSequence/);
  assert.match(controller, /function beginConnectionOperation\s*\(/);
  assert.match(controller, /operationEpoch\s*<\s*state\.connectionErrorEpoch/);
  assert.match(controller, /clearConnectionError\(operationEpoch\)/);
});

test('browser controller owns mutation cleanup and invalidates stale result history', () => {
  const controller = readProjectFile('game.js');
  const view = readProjectFile('game-view.js');

  assert.match(controller, /mutationSequence/);
  assert.match(controller, /mutationOwner/);
  assert.match(controller, /function ownsMutation\s*\(/);
  assert.match(controller, /function releaseMutation\s*\(/);
  assert.match(controller, /if \(state\.mutationBusy\) return false;/);
  assert.match(view, /refs\.newGameButton\.disabled\s*=\s*state\.mutationBusy/);
  assert.match(controller, /function invalidateHistoryRequests\s*\(/);
  assert.match(controller, /snapshot\.phase === 'result'/);
  assert.match(controller, /snapshot\.roundNumber === roundNumber/);
  assert.match(controller, /snapshot\.revision === revision/);
  assert.match(controller, /if \(snapshot\.phase !== 'result'\) \{[\s\S]*invalidateHistoryRequests\(\)/);
});
