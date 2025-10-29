-- Migration to prevent duplicate answer submissions
-- Add unique constraint to ensure one answer per player per question

ALTER TABLE answers 
ADD CONSTRAINT unique_player_question_answer 
UNIQUE (player_session_id, question_id);

-- Add a helpful comment
COMMENT ON CONSTRAINT unique_player_question_answer ON answers IS 
'Ensures each player can only submit one answer per question';

