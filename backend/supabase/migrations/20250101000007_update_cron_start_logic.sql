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
  v_check_time timestamptz;
  v_check_cron_expr text;
  v_check_job_name text;
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

  -- Unschedule the original start job so it does not run again
  PERFORM cron.unschedule('start_quiz_' || p_quiz_id::text);

  -- Schedule a follow-up attendance check 2 minutes after start
  v_check_time := now() + interval '2 minutes';

  v_check_cron_expr :=
    to_char(v_check_time AT TIME ZONE 'UTC', 'MI') || ' ' ||
    to_char(v_check_time AT TIME ZONE 'UTC', 'HH24') || ' ' ||
    to_char(v_check_time AT TIME ZONE 'UTC', 'DD') || ' ' ||
    to_char(v_check_time AT TIME ZONE 'UTC', 'MM') || ' *';

  v_check_job_name := 'check_attendance_' || p_quiz_id::text;

  PERFORM cron.schedule(
    v_check_job_name,
    v_check_cron_expr,
    format('SELECT reschedule_quiz_if_no_attendance(''%s''::uuid);', p_quiz_id)
  );
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Failed to start scheduled quiz %: %', p_quiz_id, SQLERRM;
END;
$$;


