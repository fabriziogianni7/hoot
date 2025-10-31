-- Update RLS policy for quizzes table
-- Only authenticated users can update their own quizzes (using user_id)

-- Drop the existing policy if it exists
DROP POLICY IF EXISTS "Users can update their own quizzes" ON quizzes;

-- Create new stricter policy: only authenticated users can update their own quizzes
CREATE POLICY "Authenticated users can update their own quizzes" ON quizzes
    FOR UPDATE USING (
        auth.uid() IS NOT NULL AND user_id = auth.uid()
    )
    WITH CHECK (
        auth.uid() IS NOT NULL AND user_id = auth.uid()
    );

-- Add comment for documentation
COMMENT ON POLICY "Authenticated users can update their own quizzes" ON quizzes IS 
    'Only authenticated users can update quizzes where user_id matches their auth.uid()';

