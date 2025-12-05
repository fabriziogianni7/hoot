-- Add user_fid column to player_sessions to track Farcaster identity for players
ALTER TABLE player_sessions
ADD COLUMN IF NOT EXISTS user_fid TEXT;

-- Index for faster lookups by user_fid
CREATE INDEX IF NOT EXISTS idx_player_sessions_user_fid ON player_sessions(user_fid);

COMMENT ON COLUMN player_sessions.user_fid IS 'Farcaster ID of the player (if available)';

-- Global leaderboard view:
-- - Aggregates play points from player_sessions.total_score
-- - Aggregates creator points from quizzes (per-quiz bonus)
-- - Uses FID when available, otherwise falls back to wallet/creator address
-- - Exposes a unified identity_key plus separate fid/wallet columns
-- - Ranks users by total_points (play_points + create_points)

DROP VIEW IF EXISTS global_leaderboard;

CREATE VIEW global_leaderboard AS
WITH player_points AS (
  SELECT
    COALESCE(ps.user_fid, LOWER(ps.wallet_address)) AS identity_key,
    MAX(ps.user_fid) AS identity_fid,
    MAX(LOWER(ps.wallet_address)) AS identity_wallet,
    SUM(COALESCE(ps.total_score, 0)) AS play_points
  FROM player_sessions ps
  WHERE ps.wallet_address IS NOT NULL
     OR ps.user_fid IS NOT NULL
  GROUP BY COALESCE(ps.user_fid, LOWER(ps.wallet_address))
),
creator_points AS (
  SELECT
    COALESCE(q.user_fid, LOWER(q.creator_address)) AS identity_key,
    MAX(q.user_fid) AS identity_fid,
    MAX(LOWER(q.creator_address)) AS identity_wallet,
    COUNT(*) AS quizzes_created
  FROM quizzes q
  WHERE q.creator_address IS NOT NULL
     OR q.user_fid IS NOT NULL
  GROUP BY COALESCE(q.user_fid, LOWER(q.creator_address))
),
correct_answers AS (
  SELECT
    COALESCE(ps.user_fid, LOWER(ps.wallet_address)) AS identity_key,
    COUNT(*) AS correct_answers,
    -- time_taken is stored in milliseconds; convert to seconds for readability
    AVG(a.time_taken) / 1000.0 AS avg_correct_time
  FROM answers a
  JOIN player_sessions ps ON ps.id = a.player_session_id
  WHERE a.is_correct = TRUE
    AND (ps.wallet_address IS NOT NULL OR ps.user_fid IS NOT NULL)
  GROUP BY COALESCE(ps.user_fid, LOWER(ps.wallet_address))
),
combined AS (
  SELECT
    COALESCE(COALESCE(p.identity_key, c.identity_key), ca.identity_key) AS identity_key,
    COALESCE(p.identity_fid, c.identity_fid) AS identity_fid,
    COALESCE(p.identity_wallet, c.identity_wallet) AS identity_wallet,
    COALESCE(p.play_points, 0) AS play_points,
    COALESCE(c.quizzes_created, 0) AS quizzes_created,
    -- Tune this constant to rebalance how valuable quiz creation is
    COALESCE(c.quizzes_created, 0) * 100 AS create_points,
    COALESCE(ca.correct_answers, 0) AS correct_answers,
    COALESCE(ca.avg_correct_time, 0) AS avg_correct_time
  FROM player_points p
  FULL OUTER JOIN creator_points c USING (identity_key)
  FULL OUTER JOIN correct_answers ca USING (identity_key)
)
SELECT
  identity_key,
  identity_fid,
  identity_wallet,
  play_points,
  quizzes_created,
  create_points,
  correct_answers,
  avg_correct_time,
  (play_points + create_points) AS total_points,
  RANK() OVER (ORDER BY (play_points + create_points) DESC) AS rank
FROM combined;

COMMENT ON VIEW global_leaderboard IS 'Global leaderboard aggregating play and creator points keyed by Farcaster ID or wallet address.';


-- Restrict direct access to the view:
-- - Allow only the authenticated and service_role roles to select
-- - Block anon from selecting from the view
REVOKE ALL ON global_leaderboard FROM PUBLIC;
REVOKE ALL ON global_leaderboard FROM anon;
GRANT SELECT ON global_leaderboard TO authenticated;
GRANT SELECT ON global_leaderboard TO service_role;


