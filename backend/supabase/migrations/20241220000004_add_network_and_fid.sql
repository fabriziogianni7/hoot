-- Add network_id and user_fid columns to quizzes table
ALTER TABLE quizzes 
ADD COLUMN network_id TEXT,
ADD COLUMN user_fid TEXT;

-- Create indexes for better performance
CREATE INDEX idx_quizzes_network_id ON quizzes(network_id);
CREATE INDEX idx_quizzes_user_fid ON quizzes(user_fid);

-- Add comment for documentation
COMMENT ON COLUMN quizzes.network_id IS 'Network/chain ID where the quiz contract is deployed';
COMMENT ON COLUMN quizzes.user_fid IS 'Farcaster ID of the quiz creator';

