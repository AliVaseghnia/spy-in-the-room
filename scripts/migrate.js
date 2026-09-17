'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { ConfigurationError } = require('../server/config.js');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'database', 'migrations');
const MIGRATION_SQL = fs.readFileSync(
  path.join(MIGRATIONS_DIR, '001_initial.sql'),
  'utf8'
);

function listMigrationFiles(migrationsDir = MIGRATIONS_DIR) {
  return fs.readdirSync(migrationsDir)
    .filter((file) => /^\d+.*\.sql$/i.test(file))
    .sort((left, right) => left.localeCompare(right, 'en', { numeric: true }));
}

function migrationVersion(fileName) {
  const match = /^\d+/.exec(fileName);
  if (!match) throw new Error(`Invalid migration filename: ${fileName}`);
  return Number.parseInt(match[0], 10);
}

function loadPostgresClient() {
  try {
    return require('@neondatabase/serverless').Client;
  } catch (error) {
    const dependencyError = new Error(
      'The Postgres driver is not installed. Run npm install before applying migrations.'
    );
    dependencyError.cause = error;
    dependencyError.code = 'MISSING_POSTGRES_DRIVER';
    throw dependencyError;
  }
}

async function runMigrations({
  databaseUrl,
  env = process.env,
  migrationsDir = MIGRATIONS_DIR,
  Client = null,
  client: suppliedClient = null
} = {}) {
  const configuredDatabaseUrl = databaseUrl === undefined ? env.DATABASE_URL : databaseUrl;
  if (typeof configuredDatabaseUrl !== 'string' || !configuredDatabaseUrl.trim()) {
    throw new ConfigurationError('DATABASE_URL is required to run migrations.', {
      missing: ['DATABASE_URL']
    });
  }

  const client = suppliedClient || new (Client || loadPostgresClient())({
    connectionString: configuredDatabaseUrl.trim()
  });
  const ownsClient = !suppliedClient;

  try {
    if (ownsClient) await client.connect();
    await client.query('BEGIN');
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version integer PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    for (const fileName of listMigrationFiles(migrationsDir)) {
      const version = migrationVersion(fileName);
      const applied = await client.query(
        'SELECT 1 FROM schema_migrations WHERE version = $1',
        [version]
      );
      if (applied.rowCount > 0) continue;

      // Execute each migration as one Postgres script. Do not split on
      // semicolons because SQL bodies and quoted values may contain them.
      const sql = fs.readFileSync(path.join(migrationsDir, fileName), 'utf8');
      await client.query(sql);
      await client.query(
        'INSERT INTO schema_migrations (version) VALUES ($1)',
        [version]
      );
    }

    await client.query('COMMIT');
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      error.rollbackError = rollbackError;
    }
    throw error;
  } finally {
    if (ownsClient) await client.end();
  }
}

if (require.main === module) {
  runMigrations()
    .then(() => process.stdout.write('Migrations applied.\n'))
    .catch((error) => {
      process.stderr.write(`${error.stack || error.message}\n`);
      process.exitCode = 1;
    });
}

module.exports = {
  listMigrationFiles,
  migrationVersion,
  MIGRATION_SQL,
  runMigrations
};
