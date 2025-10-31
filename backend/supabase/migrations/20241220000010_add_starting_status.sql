-- Add 'starting' status to game_sessions status check constraint
-- This status represents the countdown phase before the game actually starts

-- Drop the existing constraint
ALTER TABLE game_sessions 
DROP CONSTRAINT IF EXISTS game_sessions_status_check;

-- Add the new constraint with 'starting' status
ALTER TABLE game_sessions 
ADD CONSTRAINT game_sessions_status_check 
CHECK (status IN ('waiting', 'starting', 'in_progress', 'completed'));

-- Add comment for documentation
COMMENT ON COLUMN game_sessions.status IS 'Game status: waiting (lobby), starting (countdown), in_progress (playing), completed (finished)';

