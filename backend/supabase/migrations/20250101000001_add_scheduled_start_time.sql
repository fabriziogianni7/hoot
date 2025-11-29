-- Add scheduled_start_time column to quizzes for automatic starts
ALTER TABLE quizzes
ADD COLUMN IF NOT EXISTS scheduled_start_time TIMESTAMP WITH TIME ZONE;

-- Index to efficiently find upcoming scheduled quizzes
CREATE INDEX IF NOT EXISTS idx_quizzes_scheduled_start
  ON quizzes (scheduled_start_time)
  WHERE scheduled_start_time IS NOT NULL;

-- Document the column usage
COMMENT ON COLUMN quizzes.scheduled_start_time IS
  'UTC timestamp when the quiz should automatically start via pg_cron';


