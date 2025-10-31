-- Add user_id column to player_sessions table to link to auth.users
ALTER TABLE player_sessions 
ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Create index for better performance on user queries
CREATE INDEX idx_player_sessions_user_id ON player_sessions(user_id);

-- Add comment for documentation
COMMENT ON COLUMN player_sessions.user_id IS 'Foreign key to auth.users - the authenticated user who joined the game';

-- Update RLS policy to allow users to see their own player sessions
CREATE POLICY "Users can view their own player sessions" ON player_sessions
    FOR SELECT USING (
        user_id = auth.uid() OR 
        user_id IS NULL -- Allow viewing player sessions without a user_id (legacy/anonymous)
    );

-- Allow users to update their own player sessions
CREATE POLICY "Users can update their own player sessions" ON player_sessions
    FOR UPDATE USING (
        user_id = auth.uid() OR
        user_id IS NULL -- Allow updating player sessions without a user_id (legacy/anonymous)
    );

-- Allow users to delete their own player sessions
CREATE POLICY "Users can delete their own player sessions" ON player_sessions
    FOR DELETE USING (
        user_id = auth.uid() OR
        user_id IS NULL -- Allow deleting player sessions without a user_id (legacy/anonymous)
    );

-- Set replica identity to full for player_sessions table
ALTER TABLE public.player_sessions REPLICA IDENTITY FULL;
