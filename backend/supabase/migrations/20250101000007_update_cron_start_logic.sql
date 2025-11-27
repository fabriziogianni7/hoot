-- Make cron job mimic manual start (update existing game session)
CREATE OR REPLACE FUNCTION start_scheduled_quiz(p_quiz_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_quiz quizzes%ROWTYPE;
  v_game_session game_sessions%ROWTYPE;
BEGIN
  SELECT *
  INTO v_quiz
  FROM quizzes
  WHERE id = p_quiz_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE NOTICE 'Quiz % not found', p_quiz_id;
    RETURN;
  END IF;

  IF v_quiz.status <> 'pending' THEN
    PERFORM cron.unschedule('start_quiz_' || p_quiz_id::text);
    RETURN;
  END IF;

  UPDATE quizzes
  SET status = 'starting',
      started_at = NOW()
  WHERE id = p_quiz_id;

  SELECT *
  INTO v_game_session
  FROM game_sessions
  WHERE quiz_id = p_quiz_id
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE WARNING 'No game session found for quiz %, skipping', p_quiz_id;
    PERFORM cron.unschedule('start_quiz_' || p_quiz_id::text);
    RETURN;
  END IF;

  UPDATE game_sessions
  SET status = 'starting',
      started_at = NOW()
  WHERE id = v_game_session.id;

  PERFORM cron.unschedule('start_quiz_' || p_quiz_id::text);
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Failed to start scheduled quiz %: %', p_quiz_id, SQLERRM;
END;
$$;


