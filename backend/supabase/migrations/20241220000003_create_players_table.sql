-- Create players table
CREATE TABLE players (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    fid TEXT, -- Farcaster ID (optional)
    address TEXT, -- Wallet address (optional)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX idx_players_user_id ON players(user_id);
CREATE INDEX idx_players_fid ON players(fid);
CREATE INDEX idx_players_address ON players(address);

-- Enable Row Level Security (RLS)
ALTER TABLE players ENABLE ROW LEVEL SECURITY;

-- RLS Policies for players
-- Users can view their own player record
CREATE POLICY "Users can view their own player record" ON players
    FOR SELECT USING (user_id = auth.uid());

-- Users can insert their own player record
CREATE POLICY "Users can create their own player record" ON players
    FOR INSERT WITH CHECK (user_id = auth.uid());

-- Users can update their own player record
CREATE POLICY "Users can update their own player record" ON players
    FOR UPDATE USING (user_id = auth.uid());

-- Users can delete their own player record
CREATE POLICY "Users can delete their own player record" ON players
    FOR DELETE USING (user_id = auth.uid());

-- Create function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger to automatically update updated_at
CREATE TRIGGER update_players_updated_at 
    BEFORE UPDATE ON players 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();
