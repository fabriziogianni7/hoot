-- Allow authenticated users to delete quizzes they own
DROP POLICY IF EXISTS "Users can delete their own quizzes" ON quizzes;

CREATE POLICY "Users can delete their own quizzes" ON quizzes
    FOR DELETE USING (
        auth.uid() IS NOT NULL AND user_id = auth.uid()
    );

COMMENT ON POLICY "Users can delete their own quizzes" ON quizzes IS
    'Authenticated users may delete quizzes where quizzes.user_id matches auth.uid()';


