'use strict';

const crypto = require('node:crypto');

const SESSION_COOKIE_NAME = 'spy_session';
const SESSION_MAX_AGE = 2592000;

function resolveNow(now) {
  const candidate = typeof now === 'function' ? now() : now;
  const date = candidate === undefined || candidate === null ? new Date() : new Date(candidate);
  if (Number.isNaN(date.getTime())) {
    throw new TypeError('now must be a valid date.');
  }
  return date;
}

function environmentValue(env, lowerName, upperName, fallback = '') {
  const source = env || {};
  const value = source[lowerName] ?? source[upperName];
  return value === undefined || value === null ? fallback : String(value).trim();
}

function sessionSecret(env) {
  return environmentValue(env, 'sessionSecret', 'SESSION_SECRET', '');
}

function hashToken(rawToken, secret = '') {
  if (typeof rawToken !== 'string' || rawToken.length === 0) {
    throw new TypeError('rawToken must be a non-empty string.');
  }
  return crypto.createHmac('sha256', String(secret)).update(rawToken, 'utf8').digest('hex');
}

function parseCookies(cookieHeader) {
  const cookies = {};
  const value = Array.isArray(cookieHeader) ? cookieHeader.join(';') : String(cookieHeader || '');
  for (const part of value.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;
    const name = part.slice(0, separator).trim();
    if (!name || Object.prototype.hasOwnProperty.call(cookies, name)) continue;
    cookies[name] = decodeCookieValue(part.slice(separator + 1).trim());
  }
  return cookies;
}

function decodeCookieValue(value) {
  try {
    return decodeURIComponent(value);
  } catch (error) {
    return value;
  }
}

function requestHeader(request, name) {
  const headers = request && request.headers ? request.headers : {};
  const lowerName = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() !== lowerName) continue;
    return Array.isArray(value) ? value[0] || '' : String(value || '');
  }
  return '';
}

async function createSession({ store, env, now } = {}) {
  if (!store) throw new TypeError('A session store is required.');
  const createdAt = resolveNow(now);
  const expiresAt = new Date(createdAt.getTime() + SESSION_MAX_AGE * 1000);
  const rawToken = crypto.randomBytes(32).toString('base64url');
  const session = {
    id: crypto.randomUUID(),
    createdAt,
    expiresAt
  };
  const record = {
    ...session,
    tokenHash: hashToken(rawToken, sessionSecret(env))
  };

  if (typeof store.createSession === 'function') {
    await store.createSession(record);
  } else if (typeof store.insertSession === 'function') {
    await store.insertSession(record);
  } else {
    throw new TypeError('The store does not implement session creation.');
  }

  return { rawToken, session };
}

async function getSessionFromRequest(request, store, env, now) {
  if (!store) throw new TypeError('A session store is required.');
  const token = parseCookies(requestHeader(request, 'cookie'))[SESSION_COOKIE_NAME];
  if (!token || token.length > 512) return null;

  let record;
  const tokenHash = hashToken(token, sessionSecret(env));
  if (typeof store.getSessionByTokenHash === 'function') {
    record = await store.getSessionByTokenHash(tokenHash);
  } else if (typeof store.findSessionByTokenHash === 'function') {
    record = await store.findSessionByTokenHash(tokenHash);
  } else {
    throw new TypeError('The store does not implement session lookup.');
  }
  if (!record) return null;

  const currentTime = resolveNow(now);
  const expiresAt = new Date(record.expiresAt);
  if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= currentTime.getTime()) {
    return null;
  }

  return {
    id: record.id,
    createdAt: new Date(record.createdAt),
    expiresAt
  };
}

function buildSessionCookie(rawToken, { env, now, maxAge = SESSION_MAX_AGE } = {}) {
  if (typeof rawToken !== 'string' || rawToken.length === 0) {
    throw new TypeError('rawToken must be a non-empty string.');
  }
  const issuedAt = resolveNow(now);
  const expiresAt = new Date(issuedAt.getTime() + maxAge * 1000);
  const production = Boolean(
    (env && (env.isProduction || env.NODE_ENV === 'production' || env.VERCEL_ENV === 'production'))
  );
  const attributes = [
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAge}`,
    `Expires=${expiresAt.toUTCString()}`
  ];
  if (production) attributes.push('Secure');
  return `${SESSION_COOKIE_NAME}=${encodeURIComponent(rawToken)}; ${attributes.join('; ')}`;
}

async function getOrCreateSession({ request, store, env, now } = {}) {
  const existing = await getSessionFromRequest(request, store, env, now);
  if (existing) return { session: existing, rawToken: null };
  const created = await createSession({ store, env, now });
  return created;
}

module.exports = {
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE,
  buildSessionCookie,
  createSession,
  getOrCreateSession,
  getSessionFromRequest,
  hashToken,
  parseCookies,
  resolveNow,
  serializeSessionCookie: buildSessionCookie
};
