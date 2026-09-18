-- Custom round length: any whole minute from 1 to 60 replaces the original
-- 3/5/8 minute allow-list. The API validates 60-3600 seconds; this keeps the
-- storage constraint in step with that range.
ALTER TABLE games DROP CONSTRAINT IF EXISTS games_timer_seconds_check;
ALTER TABLE games ADD CONSTRAINT games_timer_seconds_check
  CHECK (timer_seconds BETWEEN 60 AND 3600);
