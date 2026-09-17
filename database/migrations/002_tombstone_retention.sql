-- Preserve tombstones created by the original 001 schema when a session row
-- is cleaned up. On fresh installs 001 has no owner foreign key, so this is a
-- safe no-op and keeps the migration history linear for every database.

ALTER TABLE game_tombstones
  DROP CONSTRAINT IF EXISTS game_tombstones_session_id_fkey;
