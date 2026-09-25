#!/usr/bin/env node
'use strict';

/*
 * Development-only server.
 *
 * Serves the static shell and wires the real Vercel route handlers to an
 * in-memory store so the whole game can be played without Postgres. Data
 * disappears when the process exits. This is not a deployment path: the
 * Vercel functions under /api still require a real DATABASE_URL in
 * Preview/Production, and this script refuses to start with NODE_ENV or
 * VERCEL_ENV set to production.
 *
 *   npm run dev            # http://localhost:3000 (memory store)
 *   PORT=4000 npm run dev  # custom port
 */

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');

const PROJECT_ROOT = path.join(__dirname, '..');
const ENV = process.env.NODE_ENV || process.env.VERCEL_ENV || 'development';
const PORT = Number(process.env.PORT || 3000);

if (ENV === 'production') {
  console.error('The in-memory development server refuses to run in production.');
  console.error('Deploy the Vercel functions with a real DATABASE_URL instead.');
  process.exit(1);
}

const { MemoryStore } = require('../server/memory-store.js');
const { createRateLimiter } = require('../server/rate-limit.js');
const gamesIndex = require('../api/games/index.js');
const gameRoute = require('../api/games/[gameId].js');
const cardRoute = require('../api/games/[gameId]/card.js');
const actionsRoute = require('../api/games/[gameId]/actions.js');
const roundsRoute = require('../api/games/[gameId]/rounds.js');

const store = new MemoryStore();
const rateLimiter = createRateLimiter();
const env = {
  DATABASE_URL: '',
  SESSION_SECRET: 'dev-only-session-secret-not-for-deployment',
  CRON_SECRET: 'dev-only-cron-secret',
  APP_ORIGIN: `http://localhost:${PORT}`,
  isProduction: false
};
const handlerOptions = { store, rateLimiter, env };

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8'
};

function serveStatic(response, pathname) {
  let relativePath = decodeURIComponent(pathname);
  if (relativePath === '/') relativePath = '/index.html';
  const normalizedPath = path.normalize(relativePath).toLowerCase();
  if (normalizedPath === '/server' || normalizedPath.startsWith('/server/')) {
    response.statusCode = 404;
    response.setHeader('Content-Type', 'text/plain; charset=utf-8');
    response.setHeader('Cache-Control', 'no-store');
    response.end('Not found');
    return;
  }

  const filePath = path.join(PROJECT_ROOT, relativePath);

  if (!filePath.startsWith(PROJECT_ROOT)) {
    response.statusCode = 403;
    response.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      response.statusCode = 404;
      response.setHeader('Content-Type', 'text/plain; charset=utf-8');
      response.end('Not found');
      return;
    }
    response.statusCode = 200;
    response.setHeader('Content-Type', MIME[path.extname(filePath)] || 'application/octet-stream');
    response.setHeader('Cache-Control', 'no-store');
    response.end(data);
  });
}

function resolveApiRoute(pathname) {
  if (pathname === '/api/games' || pathname === '/api/games/') {
    return { handler: gamesIndex, query: {} };
  }
  const match = pathname.match(/^\/api\/games\/([^/]+)(?:\/(card|actions|rounds))?$/);
  if (!match) return null;

  const gameId = decodeURIComponent(match[1]);
  if (match[2] === 'card') return { handler: cardRoute, query: { gameId } };
  if (match[2] === 'actions') return { handler: actionsRoute, query: { gameId } };
  if (match[2] === 'rounds') return { handler: roundsRoute, query: { gameId } };
  return { handler: gameRoute, query: { gameId } };
}

const server = http.createServer((request, response) => {
  const url = new URL(request.url, `http://localhost:${PORT}`);
  const pathname = url.pathname;

  if (pathname === '/api/health') {
    response.statusCode = 200;
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.end(JSON.stringify({
      data: { ok: true },
      meta: { serverNow: new Date().toISOString() }
    }));
    return;
  }

  // Vercel injects the insights script in production; answer it here so the
  // dev console stays clean.
  if (pathname === '/_vercel/insights/script.js') {
    response.statusCode = 200;
    response.setHeader('Content-Type', 'text/javascript; charset=utf-8');
    response.end('');
    return;
  }

  if (pathname.startsWith('/api/')) {
    const route = resolveApiRoute(pathname);
    if (!route) {
      response.statusCode = 404;
      response.setHeader('Content-Type', 'application/json; charset=utf-8');
      response.end(JSON.stringify({
        error: { code: 'NOT_FOUND', message: 'Unknown API route.', details: {} }
      }));
      return;
    }
    request.query = Object.assign(Object.fromEntries(url.searchParams), route.query);
    Promise.resolve(route.handler.handleRequest(request, response, handlerOptions)).catch((error) => {
      if (!response.headersSent) response.statusCode = 500;
      response.setHeader('Content-Type', 'application/json; charset=utf-8');
      response.end(JSON.stringify({
        error: {
          code: 'DEV_SERVER_ERROR',
          message: error && error.message ? error.message : 'Development server error.',
          details: {}
        }
      }));
    });
    return;
  }

  serveStatic(response, pathname);
});

server.listen(PORT, () => {
  console.log(`Spy in the Room (development, in-memory) → http://localhost:${PORT}`);
  console.log('Saved games live only in this process. Restarting the server resets them.');
});
