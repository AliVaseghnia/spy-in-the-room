-- Custom per-round secrets. Existing rows default to the public location deck.
-- The actual custom secret continues to live in rounds.location_name and is
-- only selected by the server for private cards or completed results.

ALTER TABLE games
  ADD COLUMN IF NOT EXISTS secret_mode text NOT NULL DEFAULT 'deck'
  CHECK (secret_mode IN ('deck', 'custom'));

ALTER TABLE rounds
  ADD COLUMN IF NOT EXISTS secret_mode text NOT NULL DEFAULT 'deck'
  CHECK (secret_mode IN ('deck', 'custom'));
