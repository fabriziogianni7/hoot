-- Add user_id column to quizzes table to link to auth.users
ALTER TABLE quizzes 
ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Create index for better performance on user queries
CREATE INDEX idx_quizzes_user_id ON quizzes(user_id);

-- Add comment for documentation
COMMENT ON COLUMN quizzes.user_id IS 'Foreign key to auth.users - the authenticated user who created the quiz';

-- Update RLS policy to allow users to see their own quizzes
CREATE POLICY "Users can view their own quizzes" ON quizzes
    FOR SELECT USING (
        user_id = auth.uid() OR 
        user_id IS NULL -- Allow viewing quizzes without a user_id (legacy)
    );

-- Allow authenticated users to create quizzes
DROP POLICY IF EXISTS "Users can create quizzes" ON quizzes;
CREATE POLICY "Authenticated users can create quizzes" ON quizzes
    FOR INSERT WITH CHECK (
        auth.uid() IS NOT NULL AND 
        user_id = auth.uid()
    );

-- Allow users to update their own quizzes
DROP POLICY IF EXISTS "Quiz creators can update their quizzes" ON quizzes;
CREATE POLICY "Users can update their own quizzes" ON quizzes
    FOR UPDATE USING (
        user_id = auth.uid() OR
        creator_address = current_setting('request.jwt.claims', true)::json->>'sub'
    );

