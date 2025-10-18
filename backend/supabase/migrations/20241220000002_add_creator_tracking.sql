-- Add creator tracking to game_sessions table
ALTER TABLE game_sessions 
ADD COLUMN creator_session_id UUID REFERENCES player_sessions(id);

-- Create index for better performance
CREATE INDEX idx_game_sessions_creator ON game_sessions(creator_session_id);

-- Update RLS policy to allow creator to update their game sessions
CREATE POLICY "Game creators can update their sessions" ON game_sessions
    FOR UPDATE USING (
        creator_session_id IN (
            SELECT id FROM player_sessions 
            WHERE wallet_address = current_setting('request.jwt.claims', true)::json->>'sub'
        )
    );
