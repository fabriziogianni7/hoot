-- Add question_started_at timestamp to game_sessions table for synchronized timing
ALTER TABLE game_sessions 
ADD COLUMN question_started_at TIMESTAMP WITH TIME ZONE;

-- Create index for better performance on question timing queries
CREATE INDEX idx_game_sessions_question_started ON game_sessions(question_started_at);

