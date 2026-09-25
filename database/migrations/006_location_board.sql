-- Store one public location board per standard game.
-- NULL preserves legacy games and custom-secret games without a board.
ALTER TABLE games
  ADD COLUMN IF NOT EXISTS board_locations text[] NULL;
