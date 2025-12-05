-- Global leaderboard view (per authenticated user):
-- - Aggregates play points from player_sessions.total_score
-- - Aggregates creator points from quizzes (per-quiz bonus)
-- - Aggregates correct answers and average time-to-answer (only correct answers)
-- - Groups strictly by auth.users.id (user_id) and derives identity from FID or wallet
-- - Exposes a unified identity_key plus separate fid/wallet columns
-- - Ranks users by total_points (play_points + create_points)

DROP VIEW IF EXISTS global_leaderboard;

CREATE VIEW global_leaderboard AS
WITH base_users AS (
  SELECT
    ps.user_id,
    -- Derive user_fid from auth.users metadata instead of storing it on player_sessions
    MAX((u.raw_user_meta_data->>'fid')::TEXT) AS user_fid,
    MAX(LOWER(ps.wallet_address)) FILTER (WHERE ps.wallet_address IS NOT NULL) AS primary_wallet,
    ARRAY_AGG(DISTINCT LOWER(ps.wallet_address)) FILTER (WHERE ps.wallet_address IS NOT NULL) AS all_wallets,
    MAX(ps.player_name) AS display_name
  FROM player_sessions ps
  LEFT JOIN auth.users u ON u.id = ps.user_id
  WHERE ps.user_id IS NOT NULL
  GROUP BY ps.user_id
),
player_points AS (
  SELECT
    ps.user_id,
    COUNT(DISTINCT ps.game_session_id) AS games_played,
    SUM(COALESCE(ps.total_score, 0)) AS play_points
  FROM player_sessions ps
  WHERE ps.user_id IS NOT NULL
  GROUP BY ps.user_id
),
creator_points AS (
  SELECT
    q.user_id,
    COUNT(*) AS quizzes_created
  FROM quizzes q
  WHERE q.user_id IS NOT NULL
  GROUP BY q.user_id
),
correct_answers AS (
  SELECT
    ps.user_id,
    COUNT(*) AS correct_answers,
    -- time_taken is stored in milliseconds; convert to seconds for readability
    AVG(a.time_taken) / 1000.0 AS avg_correct_time
  FROM answers a
  JOIN player_sessions ps ON ps.id = a.player_session_id
  WHERE ps.user_id IS NOT NULL
    AND a.is_correct = TRUE
  GROUP BY ps.user_id
),
combined AS (
  SELECT
    u.user_id,
    u.user_fid,
    u.primary_wallet,
    u.display_name,
    COALESCE(pp.games_played, 0) AS games_played,
    COALESCE(pp.play_points, 0) AS play_points,
    COALESCE(ca.correct_answers, 0) AS correct_answers,
    COALESCE(ca.avg_correct_time, 0) AS avg_correct_time,
    COALESCE(cp.quizzes_created, 0) AS quizzes_created,
    -- Tune this constant to rebalance how valuable quiz creation is
    COALESCE(cp.quizzes_created, 0) * 100 AS create_points
  FROM base_users u
  LEFT JOIN player_points pp ON pp.user_id = u.user_id
  LEFT JOIN correct_answers ca ON ca.user_id = u.user_id
  LEFT JOIN creator_points cp ON cp.user_id = u.user_id
),
agg AS (
  SELECT
    COALESCE(user_fid, primary_wallet, user_id::TEXT) AS identity_key,
    MAX(user_fid) AS identity_fid,
    MAX(primary_wallet) AS identity_wallet,
    MAX(display_name) AS display_name,
    SUM(games_played) AS games_played,
    SUM(play_points) AS play_points,
    SUM(quizzes_created) AS quizzes_created,
    SUM(create_points) AS create_points,
    SUM(correct_answers) AS correct_answers,
    CASE
      WHEN SUM(correct_answers) > 0
        THEN SUM(avg_correct_time * correct_answers) / SUM(correct_answers)
      ELSE 0
    END AS avg_correct_time
  FROM combined
  GROUP BY COALESCE(user_fid, primary_wallet, user_id::TEXT)
)
SELECT
  identity_key,
  identity_fid,
  identity_wallet,
  display_name,
  games_played,
  play_points,
  quizzes_created,
  create_points,
  correct_answers,
  avg_correct_time,
  (play_points + create_points) AS total_points,
  RANK() OVER (ORDER BY (play_points + create_points) DESC) AS rank
FROM agg;

COMMENT ON VIEW global_leaderboard IS 'Global leaderboard aggregating play/creator stats per auth user, keyed by Farcaster ID or wallet address.';


-- Restrict direct access to the view:
-- - Allow only the authenticated and service_role roles to select
-- - Block anon from selecting from the view
REVOKE ALL ON global_leaderboard FROM PUBLIC;
REVOKE ALL ON global_leaderboard FROM anon;
GRANT SELECT ON global_leaderboard TO authenticated;
GRANT SELECT ON global_leaderboard TO service_role;

-- Allow service_role (used by backend API routes) to read auth.users,
-- which is required by the global_leaderboard view. Do NOT grant this
-- to anon/authenticated roles.
GRANT SELECT ON auth.users TO service_role;


