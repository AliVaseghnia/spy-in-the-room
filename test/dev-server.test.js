'use strict';

const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const net = require('node:net');
const path = require('node:path');
const test = require('node:test');

const PROJECT_ROOT = path.join(__dirname, '..');

async function findAvailablePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  return port;
}

function waitForServer(child) {
  return new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => {
      cleanup();
      child.kill();
      reject(new Error('Development server did not become ready.'));
    }, 5000);

    function cleanup() {
      clearTimeout(timer);
      child.stdout.off('data', onData);
      child.off('error', onError);
      child.off('exit', onExit);
    }

    function onData(chunk) {
      output += chunk.toString();
      if (output.includes('Spy in the Room (development, in-memory)')) {
        cleanup();
        resolve();
      }
    }

    function onError(error) {
      cleanup();
      reject(error);
    }

    function onExit(code) {
      cleanup();
      reject(new Error(`Development server exited before becoming ready (code ${code}).`));
    }

    child.stdout.on('data', onData);
    child.once('error', onError);
    child.once('exit', onExit);
  });
}

async function assertResponseStatus(url, expectedStatus) {
  const response = await fetch(url);
  const actualStatus = response.status;
  await response.body?.cancel();
  assert.equal(actualStatus, expectedStatus, `${url} returned HTTP ${actualStatus}`);
}

test('development server keeps server modules out of its static file surface', async (t) => {
  const port = await findAvailablePort();
  const child = spawn(process.execPath, [path.join(PROJECT_ROOT, 'scripts/dev-server.js')], {
    cwd: PROJECT_ROOT,
    env: { ...process.env, NODE_ENV: 'development', PORT: String(port) },
    stdio: ['ignore', 'pipe', 'ignore']
  });

  t.after(async () => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    const exited = new Promise((resolve) => child.once('exit', resolve));
    child.kill();
    await exited;
  });

  await waitForServer(child);
  const origin = `http://127.0.0.1:${port}`;

  const privatePaths = [
    '/server/location-roles.js',
    '/server/game-service.js',
    '/Server/location-roles.js',
    '/server%2Flocation-roles.js'
  ];
  for (const privatePath of privatePaths) {
    await assertResponseStatus(`${origin}${privatePath}`, 404);
  }
  await assertResponseStatus(`${origin}/game-logic.js?v=16`, 200);
});
