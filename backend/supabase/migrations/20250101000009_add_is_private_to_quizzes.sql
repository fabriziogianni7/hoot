-- Add is_private flag to quizzes to allow marking quizzes as private/public
-- Quizzes are public by default

ALTER TABLE quizzes
ADD COLUMN IF NOT EXISTS is_private BOOLEAN NOT NULL DEFAULT FALSE;


