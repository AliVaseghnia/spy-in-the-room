'use strict';

const DEFAULT_APP_ORIGIN = 'http://localhost:3000';
const DEFAULT_MAX_GAMES_PER_SESSION = 20;
const DEFAULT_CLEANUP_BATCH_SIZE = 100;
const MAX_CLEANUP_BATCH_SIZE = 500;
const DEFAULT_CLEANUP_MAX_BATCHES = 10;
const MAX_CLEANUP_MAX_BATCHES = 100;

class ConfigurationError extends Error {
  constructor(message, details) {
    super(message);
    this.name = 'ConfigurationError';
    this.code = 'CONFIGURATION_ERROR';
    this.details = details || {};
  }
}

function normalize(value) {
  if (value === undefined || value === null) {
    return '';
  }
  return String(value).trim();
}

function readConfig(env) {
  const source = env || process.env;
  const isProduction = source.NODE_ENV === 'production' || source.VERCEL_ENV === 'production';
  const databaseUrl = normalize(source.DATABASE_URL);
  const sessionSecret = normalize(source.SESSION_SECRET);
  const cronSecret = normalize(source.CRON_SECRET ?? source.cronSecret);
  const appOrigin = normalize(source.APP_ORIGIN) || (isProduction ? '' : DEFAULT_APP_ORIGIN);

  const missing = [];
  if (isProduction && !databaseUrl) {
    missing.push('DATABASE_URL');
  }
  if (isProduction && !sessionSecret) {
    missing.push('SESSION_SECRET');
  }
  if (isProduction && !appOrigin) {
    missing.push('APP_ORIGIN');
  }
  if (isProduction && !cronSecret) {
    missing.push('CRON_SECRET');
  }

  if (missing.length > 0) {
    throw new ConfigurationError(
      `Missing required production configuration: ${missing.join(', ')}.`,
      { missing }
    );
  }

  return {
    databaseUrl,
    sessionSecret,
    cronSecret,
    appOrigin,
    isProduction
  };
}

module.exports = {
  DEFAULT_CLEANUP_BATCH_SIZE,
  DEFAULT_CLEANUP_MAX_BATCHES,
  DEFAULT_APP_ORIGIN,
  DEFAULT_MAX_GAMES_PER_SESSION,
  MAX_CLEANUP_BATCH_SIZE,
  MAX_CLEANUP_MAX_BATCHES,
  ConfigurationError,
  readConfig
};
