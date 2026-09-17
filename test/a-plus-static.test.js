const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const PROJECT_ROOT = path.join(__dirname, '..');

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(PROJECT_ROOT, relativePath), 'utf8');
}

test('A+ shell exposes mobile, privacy, dialog, and phase-state contracts', () => {
  const html = readProjectFile('index.html');
  const css = readProjectFile('styles.css');
  const controller = readProjectFile('game.js');

  assert.match(html, /viewport-fit=cover/i);
  assert.match(html, /<link[^>]+rel=["']manifest["']/i);
  assert.match(html, /<main[^>]+data-game-stage/i);
  assert.match(html, /<dialog[^>]+id=["']accusation-dialog["']/i);
  assert.match(html, /<details[^>]+class=["']question-protocol["']/i);
  for (const id of [
    'connection-status',
    'how-to-play-button',
    'how-to-play-dialog',
    'close-how-to-play-button',
    'privacy-cover',
    'result-progress',
    'guess-dialog',
    'confirm-guess-button',
    'cancel-guess-button',
    'sound-toggle',
    'haptics-toggle'
  ]) {
    assert.match(html, new RegExp(`id=["']${id}["']`), `missing A+ surface: ${id}`);
  }
  assert.match(css, /safe-area-inset-bottom/i);
  assert.match(css, /@media\s*\(pointer:\s*coarse\)/i);
  assert.match(css, /:active/);
  assert.match(css, /\.game-active/);
  assert.match(controller, /classList\.toggle\(['"]game-active['"]/);
  assert.match(controller, /privacyLocked/);
  assert.match(controller, /pagehide/);
  assert.match(controller, /visibilitychange/);
  assert.match(controller, /serviceWorker\.register\(['"]\.\/service-worker\.js['"]/);
  assert.match(controller, /wakeLock\.request\(['"]screen['"]\)/);
  assert.match(controller, /addEventListener\(['"]offline['"]/);
  assert.match(controller, /addEventListener\(['"]online['"]/);
  assert.match(controller, /pendingGuessLocation/);
  assert.match(controller, /Guess selected\. Check it before locking it in/);
  assert.match(controller, /function confirmGuess\s*\(/);
  assert.match(controller, /function emitCue\s*\(/);
  assert.match(controller, /navigatorRef\.vibrate/);
  assert.match(controller, /function markPerformance\s*\(/);
  assert.match(controller, /performanceRef\.mark/);
  assert.match(controller, /boot-to-usable/);
  assert.match(controller, /tap-to-acknowledgement/);
  assert.match(controller, /api-latency/);
  assert.match(html, /aria-modal=["']true["']/i);
  assert.match(html, /<script[^>]+src=["']analytics-bootstrap\.js["']/i);
  assert.match(html, /<script\s+defer\s+src=["']\/_vercel\/insights\/script\.js["']><\/script>/i);
  assert.doesNotMatch(html, /googletagmanager|google-analytics|gtag\s*\(/i);
});

test('custom-secret mode and pass-the-phone visuals have explicit browser contracts', () => {
  const html = readProjectFile('index.html');
  const css = readProjectFile('styles.css');
  const controller = readProjectFile('game.js');
  const view = readProjectFile('game-view.js');

  for (const id of [
    'secret-mode-deck',
    'secret-mode-custom',
    'custom-secret-field',
    'custom-secret-input',
    'custom-secret-error',
    'guess-custom-form',
    'guess-input',
    'guess-input-error',
    'replay-secret-panel',
    'replay-secret-form',
    'replay-secret-input',
    'replay-secret-error',
    'resume-delete-dialog',
    'confirm-resume-delete-button',
    'cancel-resume-delete-button'
  ]) {
    assert.match(html, new RegExp(`id=["']${id}["']`), `missing custom-secret surface: ${id}`);
  }
  for (const asset of ['assets/role-spy.png', 'assets/role-agent.png', 'assets/pass-phone.png']) {
    assert.equal(fs.existsSync(path.join(PROJECT_ROOT, asset)), true, `missing local visual asset: ${asset}`);
    assert.match(html, new RegExp(asset.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(html, /secretMode/i);
  assert.match(html, /Pick the secret|your own secret/i);
  assert.match(html, /Your guess/i);
  assert.match(controller, /secretMode/);
  assert.match(controller, /customSecret/);
  assert.match(controller, /guess-custom-form/);
  assert.match(controller, /pendingReplaySecret/);
  assert.match(controller, /data-resume-delete-game-id/);
  assert.match(controller, /function confirmResumeDelete\s*\(/);
  assert.match(view, /assets\/role-spy\.png/);
  assert.match(css, /data-role=["']spy["']/);
  assert.match(css, /data-role=["']agent["']/);
});

test('home masthead stays copy-first without decorative artwork', () => {
  const html = readProjectFile('index.html');
  const css = readProjectFile('styles.css');

  assert.match(html, /<div class=["']intro-copy-block["']>[\s\S]*<h1[^>]*id=["']page-title["']/);
  assert.doesNotMatch(html, /class=["']intro-support-row["']/);
  assert.doesNotMatch(html, /class=["']intro-art["']/);
  assert.doesNotMatch(html, /class=["']dossier["']/);
  assert.match(html, /<section id=["']resume-view["'][\s\S]*<section id=["']connection-error["']/);
  assert.doesNotMatch(css, /\.intro-support-row\b/);
  assert.doesNotMatch(css, /\.intro-art\b/);
  assert.match(css, /\.intro\s*\{[\s\S]*margin-bottom:\s*1rem;/);
});

test('home screen keeps gameplay instructions behind the how-to-play dialog', () => {
  const html = readProjectFile('index.html');
  const css = readProjectFile('styles.css');
  const controller = readProjectFile('game.js');

  assert.match(html, /id=["']how-to-play-button["'][^>]*aria-controls=["']how-to-play-dialog["']/);
  assert.match(html, /<dialog[^>]+id=["']how-to-play-dialog["'][^>]+aria-labelledby=["']how-to-play-title["']/);
  assert.match(html, /id=["']how-to-play-title["']>How to play<\/h2>/);
  assert.match(html, /class=["']how-to-play-step["']/);
  assert.doesNotMatch(html, /class=["']dossier["']/);
  assert.doesNotMatch(html, /data-supporting-pane/);
  assert.match(css, /\.game-layout\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*42rem\)/);
  assert.match(css, /\.how-to-play-modal\b/);
  assert.match(controller, /function openHowToPlay\s*\(/);
  assert.match(controller, /function closeHowToPlay\s*\(/);
  assert.match(controller, /howToPlayDialog\.showModal\(\)/);
});
