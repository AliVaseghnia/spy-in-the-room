const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const PROJECT_ROOT = path.join(__dirname, '..');

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(PROJECT_ROOT, relativePath), 'utf8');
}

test('the player-facing copy sounds like a concise pass-the-phone game', () => {
  const html = readProjectFile('index.html');
  const view = readProjectFile('game-view.js');
  const controller = readProjectFile('game.js');
  const offline = readProjectFile('offline.html');
  const offlineScript = readProjectFile('offline.js');

  assert.match(html, /A pass-the-phone game/);
  assert.match(html, /Someone in this room is lying\./);
  assert.match(html, /Pass the phone\. Keep the secret\. Find the spies\./);
  assert.match(html, /Add your players/);
  assert.match(html, /Pick the secret/);
  assert.match(html, /Need a question\?/);
  assert.match(html, /The clock stops here\. Then the room votes\./);
  assert.match(html, /Lock in the accusation\?/);
  assert.match(html, /One last shot/);

  assert.match(view, /The room wins/);
  assert.match(view, /Wrong suspect/);
  assert.match(view, /Everyone else knows the/);
  assert.match(controller, /No connection\. Reconnect to keep playing\./);
  assert.match(controller, /The vote is open\. Pick the spy\./);
  assert.match(offline, /The connection dropped/);
  assert.match(offlineScript, /No connection yet\. Reconnect, then try again\./);

  const visibleSources = [html, view, controller, offline, offlineScript].join('\n');
  for (const phrase of [
    'Classified party game',
    'Find the one who does not belong.',
    'Round in progress',
    'authoritative state',
    'Creating the game.'
  ]) {
    assert.doesNotMatch(visibleSources, new RegExp(phrase.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&'), 'i'));
  }
});

test('copy keeps privacy and irreversible-action guidance explicit', () => {
  const html = readProjectFile('index.html');
  const view = readProjectFile('game-view.js');

  assert.match(html, /Only the named player should look at this card\./);
  assert.match(html, /You can’t undo this\./);
  assert.match(html, /Only the named spy should type here\./);
  assert.match(view, /Only they should enter the guess\./);
  assert.match(view, /There’s no changing it after this\./);
});
