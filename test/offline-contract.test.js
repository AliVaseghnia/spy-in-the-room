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

test('manifest describes an installable standalone shell with local app icons', () => {
  const manifest = readProjectJson('manifest.webmanifest');

  assert.equal(manifest.name, 'Spy in the Room');
  assert.equal(manifest.short_name, 'Spy Room');
  assert.equal(manifest.start_url, './');
  assert.equal(manifest.scope, './');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.theme_color, '#10161e');
  assert.equal(manifest.background_color, '#10161e');
  assert.ok(Array.isArray(manifest.icons));
  assert.ok(manifest.icons.length >= 2, 'the manifest should provide small and large install icons');

  assert.deepEqual(
    manifest.icons.map((icon) => ({ src: icon.src, sizes: icon.sizes, type: icon.type })),
    [
      { src: 'assets/app-icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: 'assets/app-icon-512.png', sizes: '512x512', type: 'image/png' }
    ]
  );
  for (const icon of manifest.icons) {
    assert.match(icon.src, /^assets\/app-icon-(?:192|512)\.png$/i);
    assert.match(icon.type, /^image\/png$/i);
    assert.match(icon.sizes, /^\d+x\d+$/);
    assert.doesNotMatch(icon.src, /https?:\/\//i, 'icons must not fetch remote assets');
  }

  assert.doesNotMatch(JSON.stringify(manifest), /https?:\/\//i, 'the manifest must have no external URLs');
});

test('offline page is an accessible, self-contained reconnect surface', () => {
  const html = readProjectFile('offline.html');

  assert.match(html, /^<!doctype html>/i);
  assert.match(html, /<meta[^>]+name=["']viewport["'][^>]+>/i);
  assert.match(html, /<title>[^<]*offline[^<]*<\/title>/i);
  assert.match(html, /<main\b/i);
  assert.match(html, /<h1\b[^>]*>[^<]*(?:offline|reconnect)[^<]*<\/h1>/i);
  assert.match(html, /role=["']status["'][^>]*aria-live=["']polite["']/i);
  assert.match(html, /id=["']retry-button["'][^>]*type=["']button["']/i);
  assert.match(html, /<link\b[^>]+href=["']offline\.css["']/i);
  assert.match(html, /<script\b[^>]+src=["']offline\.js["'][^>]*><\/script>/i);
  assert.match(html, /saved game[\s\S]*server|server[\s\S]*saved game/i);
  assert.doesNotMatch(html, /https?:\/\//i, 'the fallback must not load external assets');
  assert.doesNotMatch(html, /<(?:img|audio|video|iframe)\b/i, 'the fallback must not depend on media assets');
  assert.doesNotMatch(html, /<style\b/i, 'the fallback stylesheet must be cacheable independently');
  assert.doesNotMatch(html, /<script\s*>/i, 'the fallback behavior must be cacheable independently');
  assert.doesNotMatch(html, /\b(?:localStorage|sessionStorage|indexedDB)\b/i);
});

test('service worker precaches only the versioned static shell and never runtime-caches requests', () => {
  const worker = readProjectFile('service-worker.js');

  assert.match(worker, /const CACHE_NAME\s*=\s*["']spy-in-the-room-shell-v\d+["']/);
  assert.match(worker, /const CACHE_PREFIX\s*=\s*["']spy-in-the-room-shell-["']/);
  assert.match(worker, /const OFFLINE_URL\s*=\s*["']\/offline\.html["']/);

  const precacheStart = worker.indexOf('const PRECACHE_URLS');
  const precacheEnd = worker.indexOf(']);', precacheStart);
  assert.ok(precacheStart >= 0 && precacheEnd > precacheStart, 'the worker must declare an explicit precache list');
  const precacheBlock = worker.slice(precacheStart, precacheEnd);
  for (const asset of [
    '/assets/app-icon-64.png',
    '/assets/app-icon-180.png',
    '/assets/app-icon-192.png',
    '/assets/app-icon-512.png',
    '/',
    '/index.html',
    '/styles.css',
    '/offline.css',
    '/api-client.js',
    '/game-logic.js',
    '/prefs.js',
    '/game-view.js',
    '/game.js',
    '/analytics-bootstrap.js',
    '/offline.js',
    '/manifest.webmanifest'
  ]) {
    assert.match(precacheBlock, new RegExp(`['"]${asset.replace('/', '\\/')}['"]`), `missing static asset: ${asset}`);
  }
  assert.match(precacheBlock, /OFFLINE_URL/, 'the offline fallback must be precached');
  assert.doesNotMatch(precacheBlock, /\/api(?:\/|['"])/i, 'API routes must never be precached');
  assert.doesNotMatch(precacheBlock, /https?:\/\//i, 'the shell must have no external assets');
  assert.match(worker, /credentials\s*:\s*["']omit["']/);
  assert.match(worker, /fetch\(request,\s*\{\s*cache:\s*["']no-store["']/);
  assert.doesNotMatch(worker, /https?:\/\//i, 'the worker must not fetch external assets');
  assert.doesNotMatch(worker, /\b(?:localStorage|sessionStorage|indexedDB)\b/i);

  assert.match(worker, /function isApiRequest\s*\(/);
  assert.match(worker, /url\.pathname\s*===\s*["']\/api["']/);
  assert.match(worker, /url\.pathname\.startsWith\(["']\/api\/["']\)/);
  assert.match(worker, /url\.origin\s*!==\s*self\.location\.origin/);
  assert.match(worker, /request\.method\s*!==\s*["']GET["']/);
  assert.match(worker, /request\.mode\s*===\s*["']navigate["']/);
  assert.match(worker, /caches\.match\(OFFLINE_URL\)/);
  assert.doesNotMatch(worker, /cache\.put\s*\(/i, 'runtime responses must not be added to Cache Storage');
  assert.doesNotMatch(worker, /cache\.add\s*\(\s*request/i, 'request-dependent caching would risk private responses');

  // Assets are network-first. A stale worker must never pair an old script or
  // stylesheet with a freshly deployed HTML shell; the cache is a fallback.
  assert.match(
    worker,
    /async function handlePrecachedAsset[\s\S]*?await fetch\(request\)[\s\S]*?caches\.match\(request,\s*\{\s*ignoreSearch:\s*true\s*\}\)/
  );
});

test('the shell version-stamps assets so pre-v13 workers cannot serve stale files', () => {
  const html = readProjectFile('index.html');

  for (const asset of [
    'styles.css',
    'game-logic.js',
    'prefs.js',
    'api-client.js',
    'game-view.js',
    'game.js',
    'analytics-bootstrap.js'
  ]) {
    assert.match(
      html,
      new RegExp(`${asset.replace('.', '\\.')}\\?v=\\d+`),
      `missing version stamp for ${asset}`
    );
  }
});

test('the page activates a waiting worker at a safe point instead of stalling', () => {
  const controller = readProjectFile('game.js');

  assert.match(controller, /function activatePendingWorker\s*\(/);
  assert.match(controller, /function safePhaseForReload\s*\(/);
  assert.match(controller, /addEventListener\(['"]updatefound['"]/);
  assert.match(controller, /addEventListener\(['"]controllerchange['"]/);
  assert.match(controller, /postMessage\(\{\s*type:\s*['"]SKIP_WAITING['"]\s*\}\)/);
  assert.match(controller, /root\.location\.reload\(\)/);
});

test('service worker updates are versioned, clean old shell caches, and activate only explicitly', () => {
  const worker = readProjectFile('service-worker.js');
  const installStart = worker.indexOf("self.addEventListener('install'");
  const activateStart = worker.indexOf("self.addEventListener('activate'");
  const messageStart = worker.indexOf("self.addEventListener('message'");

  assert.ok(installStart >= 0 && activateStart > installStart);
  assert.ok(messageStart > activateStart);
  assert.doesNotMatch(worker.slice(installStart, activateStart), /skipWaiting\s*\(/, 'updates must not interrupt an active game by default');
  assert.match(worker.slice(activateStart, messageStart), /caches\.keys\s*\(/);
  assert.match(worker.slice(activateStart, messageStart), /caches\.delete\s*\(/);
  assert.match(worker.slice(activateStart, messageStart), /self\.clients\.claim\s*\(/);
  assert.match(worker.slice(messageStart), /event\.data[\s\S]*SKIP_WAITING/);
  assert.match(worker.slice(messageStart), /self\.skipWaiting\s*\(/);
  assert.match(worker, /event\.waitUntil\s*\(/g);
});

test('service worker cache version matches the current app icon shell release', () => {
  const worker = readProjectFile('service-worker.js');

  assert.match(worker, /const CACHE_NAME\s*=\s*["']spy-in-the-room-shell-v15["']/);
});
