-- Allow quizzes to enter the 'starting' state (used by scheduled cron jobs)
ALTER TABLE quizzes
DROP CONSTRAINT IF EXISTS quizzes_status_check;

ALTER TABLE quizzes
ADD CONSTRAINT quizzes_status_check
CHECK (status IN ('pending', 'starting', 'active', 'completed', 'cancelled'));

COMMENT ON COLUMN quizzes.status IS 'Quiz status: pending -> starting -> active -> completed/cancelled';


