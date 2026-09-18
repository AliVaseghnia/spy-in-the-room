const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const PROJECT_ROOT = path.join(__dirname, '..');

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(PROJECT_ROOT, relativePath), 'utf8');
}

function readProjectJson(relativePath) {
  return JSON.parse(readProjectFile(relativePath));
}

test('the shell has a strict same-origin policy and a protected cleanup schedule', () => {
  const vercel = readProjectJson('vercel.json');
  const headers = (vercel.headers || []).flatMap((entry) => entry.headers || []);
  const values = new Map(headers.map((entry) => [entry.key.toLowerCase(), entry.value]));

  assert.equal(values.get('x-content-type-options'), 'nosniff');
  assert.equal(values.get('referrer-policy'), 'strict-origin-when-cross-origin');
  assert.equal(values.get('permissions-policy'), 'camera=(), microphone=(), geolocation=()');
  assert.equal(values.get('x-frame-options'), 'DENY');
  assert.match(values.get('content-security-policy') || '', /default-src 'self'/);
  assert.match(values.get('content-security-policy') || '', /script-src 'self'/);
  assert.doesNotMatch(values.get('content-security-policy') || '', /unsafe-eval|unsafe-inline/);
  assert.ok(Array.isArray(vercel.crons));
  assert.ok(vercel.crons.some((entry) => entry.path === '/api/maintenance/cleanup'));
});

test('public shell assets include the favicon and extracted analytics/offline behavior', () => {
  const html = readProjectFile('index.html');

  for (const asset of ['assets/app-icon-64.png', 'analytics-bootstrap.js', 'offline.css', 'offline.js']) {
    assert.equal(fs.existsSync(path.join(PROJECT_ROOT, asset)), true, `missing shell asset: ${asset}`);
  }
  assert.match(html, /rel=["']icon["'][^>]+href=["']assets\/app-icon-64\.png["']/i);
  assert.match(html, /property=["']og:title["']/i);
  assert.match(html, /name=["']twitter:card["']/i);
  assert.doesNotMatch(html, /<script\s*>\s*window\.va/i);
  assert.doesNotMatch(html, /<style\b/i);
});

test('home footer keeps one useful source link without decorative tagline fragments', () => {
  const html = readProjectFile('index.html');
  const footer = html.match(/<footer class="site-footer">([\s\S]*?)<\/footer>/i)?.[1] || '';

  assert.match(footer, /aria-label="View source on GitHub"/i);
  assert.match(footer, /<span>Source on GitHub<\/span>/i);
  assert.doesNotMatch(footer, /Pass one phone|Keep it secret|aria-hidden="true">\//i);
});

test('unclear optional features expose concise contextual help', () => {
  const html = readProjectFile('index.html');

  assert.match(html, /id="spice-toggle"[^>]+aria-describedby="chaos-mode-summary"/i);
  assert.match(html, /title="What is Chaos mode\?"/i);
  assert.match(html, /Chaos rule/);
  assert.match(html, /Phone vibration/);
  assert.match(html, /title="What is phone vibration\?"/i);
  assert.doesNotMatch(html, /Haptics when supported/);
});

test('phase rendering lives in a dedicated view module instead of the controller', () => {
  const html = readProjectFile('index.html');
  const controller = readProjectFile('game.js');

  assert.equal(fs.existsSync(path.join(PROJECT_ROOT, 'game-view.js')), true);
  assert.match(html, /<script[^>]+src=["']game-view\.js(?:\?[^"']*)?["']/i);
  assert.match(controller, /SpyGameView/);
  assert.doesNotMatch(controller, /function renderResult\s*\(/);
  assert.doesNotMatch(controller, /function renderResume\s*\(/);
});

test('resume listing can use compact summaries without reconciling every saved game', async () => {
  const { listGames } = require('../server/game-service.js');
  let summaryCalls = 0;
  let fullListCalls = 0;
  let reconciliationCalls = 0;
  const store = {
    async listGameSummaries() {
      summaryCalls += 1;
      return {
        items: [{
          id: 'game-1',
          sessionId: 'session-1',
          timerSeconds: 300,
          secretMode: 'deck',
          roundLimit: 5,
          currentRoundNumber: 1,
          currentPhase: 'reveal',
          currentRevealIndex: 0,
          currentDeadlineAt: null,
          currentAccusedPlayerId: null,
          currentWinner: null,
          currentReason: null,
          revision: 1,
          createdAt: new Date('2026-09-15T12:00:00.000Z'),
          updatedAt: new Date('2026-09-15T12:00:00.000Z'),
          players: [
            { id: 'player-1', gameId: 'game-1', seat: 0, displayName: 'Ana' },
            { id: 'player-2', gameId: 'game-1', seat: 1, displayName: 'Bea' },
            { id: 'player-3', gameId: 'game-1', seat: 2, displayName: 'Cy' },
            { id: 'player-4', gameId: 'game-1', seat: 3, displayName: 'Dee' }
          ],
          rounds: [{
            id: 'round-1',
            gameId: 'game-1',
            roundNumber: 1,
            secretMode: 'deck',
            phase: 'reveal',
            revealIndex: 0,
            deadlineAt: null,
            accusedPlayerId: null,
            guesses: [],
            guessOrder: [],
            points: [],
            winner: null,
            reason: null,
            startedAt: new Date('2026-09-15T12:00:00.000Z'),
            completedAt: null,
            assignments: []
          }]
        }],
        nextCursor: null
      };
    },
    async listGames() {
      fullListCalls += 1;
      throw new Error('full game listing should not be used when summaries are available');
    },
    async reconcileExpiredRound() {
      reconciliationCalls += 1;
      throw new Error('listing should not reconcile every saved game');
    }
  };

  const result = await listGames({ store, sessionId: 'session-1' });

  assert.equal(summaryCalls, 1);
  assert.equal(fullListCalls, 0);
  assert.equal(reconciliationCalls, 0);
  assert.equal(result.items[0].gameId, 'game-1');
  assert.equal(result.items[0].phase, 'reveal');
});

test('request methods forward caller cancellation and turn aborts into a safe timeout error', async () => {
  const api = require('../api-client.js');
  const previousFetch = global.fetch;
  const externalController = new AbortController();
  let observedSignal = null;

  global.fetch = (_url, options) => new Promise((_resolve, reject) => {
    observedSignal = options.signal;
    options.signal.addEventListener('abort', () => {
      const error = new Error('aborted');
      error.name = 'AbortError';
      reject(error);
    }, { once: true });
  });

  try {
    const request = api.getGame('game-1', { signal: externalController.signal });
    await new Promise((resolve) => setImmediate(resolve));
    externalController.abort();
    await assert.rejects(
      request,
      (error) => error.code === 'REQUEST_ABORTED' && error.status === 0
    );
    externalController.abort();
    assert.equal(observedSignal.aborted, true);
  } finally {
    global.fetch = previousFetch;
  }

  const timeoutFetch = global.fetch;
  global.fetch = (_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener('abort', () => {
      const error = new Error('aborted');
      error.name = 'AbortError';
      reject(error);
    }, { once: true });
  });

  try {
    await assert.rejects(
      api.getGame('game-1', { timeoutMs: 5 }),
      (error) => error.code === 'REQUEST_TIMEOUT' && error.status === 0
    );
  } finally {
    global.fetch = timeoutFetch;
  }
});

test('the controller aborts stale authoritative reads when a newer read or lifecycle event wins', () => {
  const controller = readProjectFile('game.js');

  assert.match(controller, /AbortController/);
  assert.match(controller, /function abortPendingRequests\s*\(/);
  assert.match(controller, /api\.getGame\(gameId, \{\s*signal:/);
  assert.match(controller, /api\.listRounds\(gameId, \{\s*signal:/);
  assert.match(controller, /api\.listGames\(\{\s*signal:/);
});

test('resume deletion invalidates an in-flight saved-game listing', () => {
  const controller = readProjectFile('game.js');

  assert.match(controller, /function invalidateGamesRequests\s*\(/);
  assert.match(controller, /function confirmResumeDelete\s*\(\)[\s\S]*invalidateGamesRequests\(\)/);
});

test('end-round has a reversible confirmation step and copy accounts for a spy team', () => {
  const html = readProjectFile('index.html');
  const controller = readProjectFile('game.js');
  const view = readProjectFile('game-view.js');

  assert.match(html, /<dialog[^>]+id=["']end-round-dialog["']/i);
  assert.match(html, /id=["']confirm-end-round-button["']/i);
  assert.match(html, /id=["']cancel-end-round-button["']/i);
  assert.match(controller, /function openEndRoundDialog\s*\(/);
  assert.match(controller, /function confirmEndRound\s*\(/);
  assert.match(controller, /endRoundButton\.addEventListener\(['"]click['"], openEndRoundDialog\)/);
  assert.doesNotMatch(controller, /endRoundButton\.addEventListener\(['"]click['"], function \(\) \{ sendGameAction\(['"]end-round['"]\); \}\)/);
  assert.match(html, /each spy gets one shot/i);
  assert.match(view, /missed the secret/i);
  assert.match(view, /spies\.length > 1/);
});
