-- Migration: 20250101000010_add_prize_distribution_tx_hash.sql
-- Description: Track on-chain prize distribution transaction hash separately from funding hash

ALTER TABLE quizzes 
ADD COLUMN IF NOT EXISTS prize_distribution_tx_hash TEXT;


