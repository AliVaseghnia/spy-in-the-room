'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const PROJECT_ROOT = path.join(__dirname, '..');

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(PROJECT_ROOT, relativePath), 'utf8');
}

test('the game shell exposes the pass-the-phone feel surfaces', () => {
  const html = readProjectFile('index.html');
  const css = readProjectFile('styles.css');
  const controller = readProjectFile('game.js');
  const view = readProjectFile('game-view.js');

  for (const id of [
    'player-name-input',
    'player-chips',
    'spice-toggle',
    'settings-dialog',
    'settings-button',
    'reveal-progress',
    'reveal-steps',
    'reveal-instruction',
    'reveal-card-face',
    'reveal-action-label',
    'reveal-note',
    'timer-ring',
    'timer-ring-progress',
    'round-intel',
    'twist-strip',
    'twist-text',
    'question-prompt',
    'draw-question-button',
    'guess-search-input',
    'result-stamp',
    'result-stamp-label',
    'share-result-button'
  ]) {
    assert.match(html, new RegExp(`id=["']${id}["']`), `missing game-feel surface: ${id}`);
  }

  assert.match(html, /player-chips/);
  assert.match(css, /secret-card\[data-revealed="true"\]/);
  assert.match(css, /\.timer-ring/);
  assert.match(css, /\.leaderboard-bar/);
  assert.match(css, /\.result-stamp/);
  assert.match(controller, /function beginReveal\s*\(/);
  assert.match(controller, /function prefetchCurrentCard\s*\(/);
  assert.match(controller, /revealAction\.addEventListener\(['"]click['"]/);
  assert.doesNotMatch(controller, /TAP_PEEK_MS|TIMED_REVEAL_MS|timedReveal|function beginPeek\s*\(/);
  assert.match(view, /Pass the phone to/);
  assert.match(controller, /function handleDrawQuestion\s*\(/);
  assert.match(controller, /function handleShareResult\s*\(/);
  assert.match(view, /leaderboard-bar/);
  assert.match(view, /questionPrompt/);
});

test('the setup offers a custom round length between one and sixty minutes', () => {
  const html = readProjectFile('index.html');
  const controller = readProjectFile('game.js');
  const validation = readProjectFile(path.join('server', 'validation.js'));

  assert.match(html, /id="timer-custom"[^>]*value="custom"/);
  assert.match(html, /id="custom-timer-field"[^>]*hidden/);
  assert.match(html, /id="custom-timer-minutes"[^>]*min="1"[^>]*max="60"/);
  assert.match(controller, /CUSTOM_TIMER_MIN_MINUTES\s*=\s*1/);
  assert.match(controller, /CUSTOM_TIMER_MAX_MINUTES\s*=\s*60/);
  assert.match(validation, /MIN_TIMER_SECONDS\s*=\s*60/);
  assert.match(validation, /MAX_TIMER_SECONDS\s*=\s*3600/);

  // The stored constraint has to move with the API range, or production
  // rejects every custom value while the in-memory dev store accepts it.
  const migration = readProjectFile(path.join('database', 'migrations', '005_custom_round_length.sql'));
  assert.match(migration, /DROP CONSTRAINT IF EXISTS games_timer_seconds_check/);
  assert.match(migration, /CHECK \(timer_seconds BETWEEN 60 AND 3600\)/);
});

test('remembered players and cue flags are the only persisted preferences', () => {
  const prefs = require('../prefs.js');
  const stored = new Map();
  const fakeStorage = {
    getItem(key) {
      return stored.has(key) ? stored.get(key) : null;
    },
    setItem(key, value) {
      stored.set(key, String(value));
    },
    removeItem(key) {
      stored.delete(key);
    }
  };

  globalThis.localStorage = fakeStorage;
  try {
    prefs.clearAll();
    prefs.saveRoster([' Ana ', 'ana', 'Bea', '', 'Cy', 'Bea']);
    assert.deepEqual(prefs.load().roster, ['Ana', 'Bea', 'Cy']);

    prefs.saveRoster(Array.from({ length: 20 }, (_, index) => `Player ${index + 1}`));
    assert.equal(prefs.load().roster.length, 12);

    prefs.saveFlags({ spice: true });
    const flags = prefs.load().flags;
    assert.equal(flags.spice, true);
    assert.equal(flags.sound, true);
    assert.equal(flags.haptics, true);

    const raw = JSON.parse(stored.get(prefs.STORAGE_KEY));
    assert.deepEqual(Object.keys(raw).sort(), ['flags', 'roster']);
    assert.doesNotMatch(stored.get(prefs.STORAGE_KEY), /card|snapshot|secret|location/i);

    prefs.clearAll();
    assert.deepEqual(prefs.load().roster, []);
  } finally {
    delete globalThis.localStorage;
  }
});
