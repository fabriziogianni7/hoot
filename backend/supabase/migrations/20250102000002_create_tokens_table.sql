-- Create tokens table to store supported prize/payment tokens per network

CREATE TABLE tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_id TEXT NOT NULL, -- e.g. 'eth', 'usdc'
  symbol TEXT NOT NULL,
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  decimals INTEGER NOT NULL,
  is_native BOOLEAN NOT NULL DEFAULT FALSE,
  logo_url TEXT,
  network_id TEXT NOT NULL -- matches quizzes.network_id (chain ID as text)
);

-- Indexes for efficient lookup
CREATE UNIQUE INDEX idx_tokens_network_address ON tokens(network_id, address);
CREATE INDEX idx_tokens_network_id ON tokens(network_id);
CREATE INDEX idx_tokens_token_id ON tokens(token_id);

-- Enable RLS and allow public read access (writes via migrations/admin only)
ALTER TABLE tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tokens are viewable by everyone" ON tokens
  FOR SELECT USING (true);

-- Seed tokens based on frontend/lib/token-config.ts

-- Common zero address for native tokens
DO $$
DECLARE
  v_zero_address CONSTANT TEXT := '0x0000000000000000000000000000000000000000';
BEGIN
  -- Base Mainnet (8453)
  INSERT INTO tokens (token_id, symbol, name, address, decimals, is_native, network_id) VALUES
    ('eth',   'ETH',   'Ethereum', v_zero_address, 18, TRUE,  '8453'),
    ('usdc',  'USDC',  'USD Coin', '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', 6,  FALSE, '8453'),
    ('jesse', 'JESSE', '$JESSE',   '0x50F88fe97f72CD3E75b9Eb4f747F59BcEBA80d59', 18, FALSE, '8453'),
    ('caso',  'CASO',  '$CASO',    '0xb601e731f93bae29909a264472b7b32e4b2988d8', 18, FALSE, '8453')
  ON CONFLICT (network_id, address) DO NOTHING;

  -- Base Sepolia (84532)
  INSERT INTO tokens (token_id, symbol, name, address, decimals, is_native, network_id) VALUES
    ('eth',  'ETH',  'Ethereum', v_zero_address, 18, TRUE,  '84532'),
    ('usdc', 'USDC', 'USD Coin', '0x036CbD53842c5426634e7929541eC231BcE1BDaE0', 6, FALSE, '84532')
  ON CONFLICT (network_id, address) DO NOTHING;

  -- Arbitrum One (42161)
  INSERT INTO tokens (token_id, symbol, name, address, decimals, is_native, network_id) VALUES
    ('eth',  'ETH',  'Ethereum', v_zero_address, 18, TRUE,  '42161'),
    ('usdc', 'USDC', 'USD Coin', '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', 6, FALSE, '42161')
  ON CONFLICT (network_id, address) DO NOTHING;

  -- Celo Mainnet (42220)
  INSERT INTO tokens (token_id, symbol, name, address, decimals, is_native, network_id) VALUES
    ('celo', 'CELO', 'Celo',        v_zero_address,                    18, TRUE,  '42220'),
    ('cusd', 'cUSD', 'Celo Dollar', '0x765DE816845861e75A25fCA122bb6898B8B1282a0', 18, FALSE, '42220')
  ON CONFLICT (network_id, address) DO NOTHING;
END;
$$;


