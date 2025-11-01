-- Add quiz modes support to quizzes table
-- Adds mode enum, golden_question_ids for bonus mode, and extra_bounty_amount for bonus mode

ALTER TABLE quizzes
ADD COLUMN mode TEXT NOT NULL DEFAULT 'standard' CHECK (mode IN ('standard', 'bonus', 'progressive', 'survival'));

ALTER TABLE quizzes
ADD COLUMN golden_question_ids JSONB DEFAULT '[]'::jsonb;

ALTER TABLE quizzes
ADD COLUMN extra_bounty_amount NUMERIC DEFAULT 0;

-- Create index for mode queries
CREATE INDEX idx_quizzes_mode ON quizzes(mode);

-- Add comments for documentation
COMMENT ON COLUMN quizzes.mode IS 'Quiz mode: standard (normal), bonus (golden questions), progressive (per-question prizes), survival (all correct answers)';
COMMENT ON COLUMN quizzes.golden_question_ids IS 'Array of question IDs that are golden questions for bonus mode';
COMMENT ON COLUMN quizzes.extra_bounty_amount IS 'Extra bounty amount for bonus mode golden questions';