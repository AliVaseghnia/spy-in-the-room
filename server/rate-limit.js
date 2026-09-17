'use strict';

const DEFAULT_RATE_LIMIT_WINDOW_MS = 60 * 1000;
const PUBLIC_GAMES_RATE_LIMIT = 60;
const GAME_CREATION_RATE_LIMIT = 10;
const MAX_RATE_LIMIT_ENTRIES = 2048;

function headerValue(request, name) {
  const headers = request && request.headers ? request.headers : {};
  const lowerName = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() !== lowerName) continue;
    if (Array.isArray(value)) return value[0] || '';
    return value === undefined || value === null ? '' : String(value);
  }
  return '';
}

function getClientIp(request) {
  // Vercel supplies x-forwarded-for from its edge proxy. In another hosting
  // setup this header is only trustworthy when the proxy is trusted by the
  // application. Each serverless instance has its own bounded map, so this
  // limiter is deliberately best-effort and cannot enforce a global quota or
  // replace a distributed rate-limit service.
  const forwarded = headerValue(request, 'x-forwarded-for');
  const firstForwarded = forwarded.split(',')[0].trim();
  if (firstForwarded) return firstForwarded.slice(0, 256);

  const realIp = headerValue(request, 'x-real-ip').trim();
  if (realIp) return realIp.slice(0, 256);

  const remoteAddress = request && request.socket && request.socket.remoteAddress;
  return remoteAddress ? String(remoteAddress).slice(0, 256) : 'unknown';
}

function clockValue(value) {
  const candidate = typeof value === 'function' ? value() : value;
  const result = candidate === undefined ? Date.now() : Number(candidate);
  if (!Number.isFinite(result)) throw new TypeError('Rate limiter clock must return a finite number.');
  return result;
}

function positiveInteger(value, name) {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 1) {
    throw new TypeError(`${name} must be a positive integer.`);
  }
  return result;
}

class ProcessLocalRateLimiter {
  constructor({
    windowMs = DEFAULT_RATE_LIMIT_WINDOW_MS,
    maxEntries = MAX_RATE_LIMIT_ENTRIES,
    now
  } = {}) {
    this.windowMs = positiveInteger(windowMs, 'windowMs');
    this.maxEntries = positiveInteger(maxEntries, 'maxEntries');
    this.now = now || (() => Date.now());
    this.buckets = new Map();
  }

  removeExpired(now) {
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now) this.buckets.delete(key);
    }
  }

  evictOldest() {
    const oldest = this.buckets.keys().next();
    if (!oldest.done) this.buckets.delete(oldest.value);
  }

  check(key, { limit, windowMs = this.windowMs, now } = {}) {
    const normalizedKey = String(key || 'unknown');
    const normalizedLimit = positiveInteger(limit, 'limit');
    const normalizedWindow = positiveInteger(windowMs, 'windowMs');
    const currentTime = clockValue(now === undefined ? this.now : now);
    this.removeExpired(currentTime);

    let bucket = this.buckets.get(normalizedKey);
    if (!bucket || bucket.resetAt <= currentTime) {
      if (!bucket && this.buckets.size >= this.maxEntries) this.evictOldest();
      bucket = {
        count: 0,
        resetAt: currentTime + normalizedWindow
      };
      this.buckets.set(normalizedKey, bucket);
    }

    bucket.count += 1;
    const allowed = bucket.count <= normalizedLimit;
    return {
      allowed,
      limit: normalizedLimit,
      remaining: Math.max(0, normalizedLimit - bucket.count),
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - currentTime) / 1000))
    };
  }

  size() {
    return this.buckets.size;
  }
}

function createRateLimiter(options) {
  return new ProcessLocalRateLimiter(options);
}

module.exports = {
  DEFAULT_RATE_LIMIT_WINDOW_MS,
  GAME_CREATION_RATE_LIMIT,
  MAX_RATE_LIMIT_ENTRIES,
  PUBLIC_GAMES_RATE_LIMIT,
  ProcessLocalRateLimiter,
  createRateLimiter,
  getClientIp
};
