-- Track whether a scheduled-quiz notification has been sent for a quiz

ALTER TABLE quizzes
ADD COLUMN IF NOT EXISTS scheduled_notification_sent BOOLEAN NOT NULL DEFAULT FALSE;


