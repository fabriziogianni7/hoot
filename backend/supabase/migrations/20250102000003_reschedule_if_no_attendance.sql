-- Reschedule a quiz 7 days later if its latest game_session had no players
CREATE OR REPLACE FUNCTION reschedule_quiz_if_no_attendance(p_quiz_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_quiz          quizzes%ROWTYPE;
  v_game_session  game_sessions%ROWTYPE;
  v_player_count  integer;
  v_answer_count  integer;
  v_new_start     timestamptz;
  v_cron_expr     text;
  v_job_name      text;
BEGIN
  -- Lock the quiz row
  SELECT *
  INTO v_quiz
  FROM quizzes
  WHERE id = p_quiz_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE NOTICE 'Quiz % not found in reschedule_quiz_if_no_attendance', p_quiz_id;
    RETURN;
  END IF;

  -- Find the latest game session for this quiz
  SELECT *
  INTO v_game_session
  FROM game_sessions
  WHERE quiz_id = p_quiz_id
  ORDER BY created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE NOTICE 'No game session found for quiz % in reschedule_quiz_if_no_attendance, nothing to check', p_quiz_id;
    RETURN;
  END IF;

  -- Count players in that session (including the creator)
  SELECT count(*)
  INTO v_player_count
  FROM player_sessions
  WHERE game_session_id = v_game_session.id;

  -- If there is at most 1 player (usually just the creator), treat as no attendance
  IF v_player_count <= 1 THEN
    RAISE NOTICE 'Quiz % had % players (<= 1), rescheduling', p_quiz_id, v_player_count;
  ELSE
    -- More than 1 player: check if any of them actually answered a question
    SELECT count(*)
    INTO v_answer_count
    FROM answers a
    JOIN player_sessions ps ON ps.id = a.player_session_id
    WHERE ps.game_session_id = v_game_session.id;

    IF v_answer_count > 0 THEN
      RAISE NOTICE 'Quiz % had % players and % answers, not rescheduling', p_quiz_id, v_player_count, v_answer_count;
      RETURN;
    END IF;
  END IF;

  -- No attendees -> push quiz 7 days forward (reuse the same game session)
  v_new_start := coalesce(v_quiz.scheduled_start_time, now()) + interval '7 days';

  UPDATE quizzes
  SET
    status = 'pending',
    started_at = NULL,
    scheduled_start_time = v_new_start
  WHERE id = p_quiz_id;

  -- Build a cron expression in UTC: "MIN HOUR DAY MONTH *"
  v_cron_expr :=
    to_char(v_new_start AT TIME ZONE 'UTC', 'MI') || ' ' ||
    to_char(v_new_start AT TIME ZONE 'UTC', 'HH24') || ' ' ||
    to_char(v_new_start AT TIME ZONE 'UTC', 'DD') || ' ' ||
    to_char(v_new_start AT TIME ZONE 'UTC', 'MM') || ' *';

  v_job_name := 'start_quiz_' || p_quiz_id::text;

  -- Reuse existing helper to (re)create the start cron job
  PERFORM create_quiz_start_cron_job(v_job_name, v_cron_expr, p_quiz_id);
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Failed in reschedule_quiz_if_no_attendance for quiz %: %', p_quiz_id, SQLERRM;
END;
$$;



