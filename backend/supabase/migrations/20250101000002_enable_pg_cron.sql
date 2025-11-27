-- Enable pg_cron extension for scheduled quiz starts
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Function to automatically start a quiz and create a game session
CREATE OR REPLACE FUNCTION start_scheduled_quiz(p_quiz_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_quiz quizzes%ROWTYPE;
  v_room_code TEXT;
  v_attempts INT := 0;
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
  SET status = 'active',
      started_at = NOW()
  WHERE id = p_quiz_id;

  LOOP
    v_room_code := upper(substr(encode(gen_random_bytes(4), 'hex'), 1, 6));
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM game_sessions WHERE room_code = v_room_code
    );
    v_attempts := v_attempts + 1;
    IF v_attempts > 5 THEN
      v_room_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
      EXIT;
    END IF;
  END LOOP;

  INSERT INTO game_sessions (
    quiz_id,
    room_code,
    status,
    current_question_index,
    created_at,
    started_at
  ) VALUES (
    p_quiz_id,
    v_room_code,
    'waiting',
    0,
    NOW(),
    NULL
  );

  -- Ensure the cron job does not run again
  PERFORM cron.unschedule('start_quiz_' || p_quiz_id::text);
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Failed to start scheduled quiz %: %', p_quiz_id, SQLERRM;
END;
$$;

-- Helper to create/update a cron job for quiz start
CREATE OR REPLACE FUNCTION create_quiz_start_cron_job(
  job_name TEXT,
  schedule TEXT,
  quiz_id UUID
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_command TEXT;
BEGIN
  -- Remove any existing job with the same name
  PERFORM cron.unschedule(job_name);

  v_command := format(
    'SELECT start_scheduled_quiz(''%s''::uuid);',
    quiz_id
  );

  PERFORM cron.schedule(job_name, schedule, v_command);
END;
$$;

-- Helper to cancel a scheduled quiz start
CREATE OR REPLACE FUNCTION cancel_quiz_start_cron_job(job_name TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM cron.unschedule(job_name);
END;
$$;


