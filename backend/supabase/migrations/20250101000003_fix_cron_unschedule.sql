-- Ensure cron unschedule doesn't error when job doesn't exist
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
  BEGIN
    PERFORM cron.unschedule(job_name);
  EXCEPTION
    WHEN OTHERS THEN
      -- Ignore missing job errors
      NULL;
  END;

  v_command := format(
    'SELECT start_scheduled_quiz(''%s''::uuid);',
    quiz_id
  );

  PERFORM cron.schedule(job_name, schedule, v_command);
END;
$$;


