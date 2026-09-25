'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const PROJECT_ROOT = path.join(__dirname, '..');

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(PROJECT_ROOT, relativePath), 'utf8');
}

test('app identity uses the approved icon without repeating it inside the reveal card', () => {
  const html = readProjectFile('index.html');
  const manifest = JSON.parse(readProjectFile('manifest.webmanifest'));
  const worker = readProjectFile('service-worker.js');

  for (const asset of [
    'assets/app-icon-64.png',
    'assets/app-icon-180.png',
    'assets/app-icon-192.png',
    'assets/app-icon-512.png'
  ]) {
    assert.equal(fs.existsSync(path.join(PROJECT_ROOT, asset)), true, `missing app icon asset: ${asset}`);
  }

  assert.match(html, /<link rel=["']icon["'][^>]+href=["']assets\/app-icon-64\.png["'][^>]+type=["']image\/png["']/i);
  assert.match(html, /<link rel=["']apple-touch-icon["'][^>]+href=["']assets\/app-icon-180\.png["']/i);
  assert.match(html, /<img[^>]+class=["'][^"']*brand-mark[^"']*["'][^>]+src=["']assets\/app-icon-64\.png["']/i);
  assert.doesNotMatch(html, /id=["']reveal-avatar["']/i);
  assert.match(html, /class=["'][^"']*reveal-front-art[^"']*["'][^>]+src=["']assets\/pass-phone\.png["']/i);

  assert.deepEqual(
    manifest.icons.map((icon) => ({ src: icon.src, sizes: icon.sizes, type: icon.type })),
    [
      { src: 'assets/app-icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: 'assets/app-icon-512.png', sizes: '512x512', type: 'image/png' }
    ]
  );

  for (const asset of [
    '/assets/app-icon-64.png',
    '/assets/app-icon-180.png',
    '/assets/app-icon-192.png',
    '/assets/app-icon-512.png'
  ]) {
    assert.match(worker, new RegExp(`['"]${asset.replaceAll('.', '\\.') }['"]`), `service worker must precache ${asset}`);
  }
});
