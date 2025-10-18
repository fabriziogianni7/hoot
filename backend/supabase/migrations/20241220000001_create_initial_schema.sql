-- Create quizzes table
CREATE TABLE quizzes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT,
    contract_address TEXT,
    contract_tx_hash TEXT,
    prize_amount NUMERIC NOT NULL,
    prize_token TEXT, -- NULL for ETH, token address for ERC20
    creator_address TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'completed', 'cancelled')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    started_at TIMESTAMP WITH TIME ZONE,
    ended_at TIMESTAMP WITH TIME ZONE
);

-- Create questions table
CREATE TABLE questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quiz_id UUID NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
    question_text TEXT NOT NULL,
    options JSONB NOT NULL, -- Array of answer options
    correct_answer_index INTEGER NOT NULL,
    order_index INTEGER NOT NULL,
    time_limit INTEGER DEFAULT 15 -- seconds
);

-- Create game_sessions table
CREATE TABLE game_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quiz_id UUID NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
    room_code TEXT UNIQUE NOT NULL,
    status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'in_progress', 'completed')),
    current_question_index INTEGER DEFAULT 0,
    started_at TIMESTAMP WITH TIME ZONE,
    ended_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create player_sessions table
CREATE TABLE player_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    game_session_id UUID NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
    player_name TEXT NOT NULL,
    wallet_address TEXT,
    total_score INTEGER DEFAULT 0,
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create answers table
CREATE TABLE answers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    player_session_id UUID NOT NULL REFERENCES player_sessions(id) ON DELETE CASCADE,
    question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    selected_answer_index INTEGER NOT NULL,
    is_correct BOOLEAN NOT NULL,
    time_taken INTEGER NOT NULL, -- milliseconds
    points_earned INTEGER NOT NULL,
    answered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX idx_quizzes_creator ON quizzes(creator_address);
CREATE INDEX idx_quizzes_status ON quizzes(status);
CREATE INDEX idx_questions_quiz_id ON questions(quiz_id);
CREATE INDEX idx_questions_order ON questions(quiz_id, order_index);
CREATE INDEX idx_game_sessions_room_code ON game_sessions(room_code);
CREATE INDEX idx_game_sessions_quiz_id ON game_sessions(quiz_id);
CREATE INDEX idx_player_sessions_game_session ON player_sessions(game_session_id);
CREATE INDEX idx_player_sessions_wallet ON player_sessions(wallet_address);
CREATE INDEX idx_answers_player_session ON answers(player_session_id);
CREATE INDEX idx_answers_question ON answers(question_id);

-- Enable Row Level Security (RLS)
ALTER TABLE quizzes ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE answers ENABLE ROW LEVEL SECURITY;

-- RLS Policies for quizzes
CREATE POLICY "Quizzes are viewable by everyone" ON quizzes
    FOR SELECT USING (true);

CREATE POLICY "Users can create quizzes" ON quizzes
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Quiz creators can update their quizzes" ON quizzes
    FOR UPDATE USING (creator_address = current_setting('request.jwt.claims', true)::json->>'sub');

-- RLS Policies for questions
CREATE POLICY "Questions are viewable by everyone" ON questions
    FOR SELECT USING (true);

CREATE POLICY "Anyone can create questions" ON questions
    FOR INSERT WITH CHECK (true);

-- RLS Policies for game_sessions
CREATE POLICY "Game sessions are viewable by everyone" ON game_sessions
    FOR SELECT USING (true);

CREATE POLICY "Anyone can create game sessions" ON game_sessions
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can update game sessions" ON game_sessions
    FOR UPDATE USING (true);

-- RLS Policies for player_sessions
CREATE POLICY "Player sessions are viewable by everyone in the same game" ON player_sessions
    FOR SELECT USING (
        game_session_id IN (
            SELECT id FROM game_sessions
        )
    );

CREATE POLICY "Anyone can join a game session" ON player_sessions
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can update player sessions" ON player_sessions
    FOR UPDATE USING (true);

-- RLS Policies for answers
CREATE POLICY "Answers are viewable by everyone in the same game" ON answers
    FOR SELECT USING (
        player_session_id IN (
            SELECT ps.id FROM player_sessions ps
            JOIN game_sessions gs ON ps.game_session_id = gs.id
        )
    );

CREATE POLICY "Anyone can submit answers" ON answers
    FOR INSERT WITH CHECK (true);

-- Enable realtime for game tables
ALTER PUBLICATION supabase_realtime ADD TABLE game_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE player_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE answers;
