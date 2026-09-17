-- Spy Phase 2 initial schema.
-- All timestamps are UTC timestamptz values. Game secrets stay in Postgres and
-- are exposed only by the server-side card/result contracts.

CREATE TABLE IF NOT EXISTS schema_migrations (
  version integer PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  id uuid PRIMARY KEY,
  token_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS games (
  id uuid PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  timer_seconds integer NOT NULL CHECK (timer_seconds IN (180, 300, 480)),
  current_round_number integer NOT NULL DEFAULT 1 CHECK (current_round_number > 0),
  current_phase text NOT NULL CHECK (current_phase IN ('reveal', 'round', 'accuse', 'spy-guess', 'result')),
  current_reveal_index integer NOT NULL DEFAULT 0 CHECK (current_reveal_index >= 0),
  current_deadline_at timestamptz,
  current_accused_player_id uuid,
  current_winner text,
  current_reason text,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS players (
  id uuid PRIMARY KEY,
  game_id uuid NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  seat integer NOT NULL CHECK (seat >= 0),
  display_name text NOT NULL,
  UNIQUE (game_id, seat)
);

ALTER TABLE games
  ADD CONSTRAINT games_current_accused_player_fk
  FOREIGN KEY (current_accused_player_id)
  REFERENCES players(id)
  ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS rounds (
  id uuid PRIMARY KEY,
  game_id uuid NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  round_number integer NOT NULL CHECK (round_number > 0),
  location_name text NOT NULL,
  location_category text NOT NULL,
  phase text NOT NULL CHECK (phase IN ('reveal', 'round', 'accuse', 'spy-guess', 'result')),
  reveal_index integer NOT NULL DEFAULT 0 CHECK (reveal_index >= 0),
  deadline_at timestamptz,
  accused_player_id uuid,
  guess text,
  winner text,
  reason text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (game_id, round_number)
);

ALTER TABLE rounds
  ADD CONSTRAINT rounds_accused_player_fk
  FOREIGN KEY (accused_player_id)
  REFERENCES players(id)
  ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS assignments (
  round_id uuid NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  is_spy boolean NOT NULL,
  PRIMARY KEY (round_id, player_id)
);

CREATE TABLE IF NOT EXISTS command_receipts (
  game_id uuid NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  idempotency_key text NOT NULL,
  request_hash text NOT NULL,
  response_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (game_id, idempotency_key),
  UNIQUE (game_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS creation_receipts (
  session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  idempotency_key text NOT NULL,
  request_hash text NOT NULL,
  game_id uuid NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  response_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, idempotency_key),
  UNIQUE (session_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS game_tombstones (
  game_id uuid PRIMARY KEY,
  -- Keep the historical owner ID after session cleanup so retention is
  -- independent of the live sessions table. Deletion authorization can still
  -- compare this value with the requesting session ID.
  session_id uuid NOT NULL,
  deleted_at timestamptz NOT NULL DEFAULT now(),
  retained_until timestamptz NOT NULL DEFAULT (now() + interval '90 days')
);

CREATE INDEX IF NOT EXISTS sessions_expires_at_idx
  ON sessions (expires_at);

CREATE INDEX IF NOT EXISTS games_session_updated_idx
  ON games (session_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS players_game_seat_idx
  ON players (game_id, seat);

CREATE INDEX IF NOT EXISTS rounds_game_round_idx
  ON rounds (game_id, round_number DESC);

CREATE INDEX IF NOT EXISTS assignments_player_idx
  ON assignments (player_id);

CREATE INDEX IF NOT EXISTS command_receipts_session_idx
  ON command_receipts (session_id, created_at DESC);

CREATE INDEX IF NOT EXISTS creation_receipts_session_idx
  ON creation_receipts (session_id, created_at DESC);

CREATE INDEX IF NOT EXISTS game_tombstones_retention_idx
  ON game_tombstones (retained_until);

CREATE INDEX IF NOT EXISTS game_tombstones_session_idx
  ON game_tombstones (session_id, deleted_at DESC);
