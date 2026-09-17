-- Spyfall-inspired refinements: five-round scoring and complete two-spy turns.
-- These are additive changes so existing games remain readable and replayable.

ALTER TABLE games
  ADD COLUMN IF NOT EXISTS round_limit integer NOT NULL DEFAULT 5
  CHECK (round_limit > 0);

ALTER TABLE rounds
  ADD COLUMN IF NOT EXISTS guesses jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS guess_order jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS points jsonb NOT NULL DEFAULT '[]'::jsonb;
