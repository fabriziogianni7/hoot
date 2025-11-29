export interface CreateQuizRequest {
  title: string
  description?: string
  questions: Array<{
    question_text: string
    options: string[]
    correct_answer_index: number
    time_limit?: number
  }>
  prize_amount: number
  prize_token?: string
  creator_address: string
  contract_address?: string
  network_id?: string
  user_fid?: string
  user_id?: string // Auth user ID from Supabase auth.users
  scheduled_start_time?: string // ISO timestamp for automatic start
  is_private?: boolean
}

export interface JoinGameRequest {
  room_code: string
  player_name: string
  wallet_address?: string
}

export interface SubmitAnswerRequest {
  player_session_id: string
  question_id: string
  answer_index: number
  time_taken: number
}

export interface CompleteGameRequest {
  game_session_id: string
  creator_wallet_address: string
}

export interface Question {
  id: string
  correct_answer_index: number
  time_limit: number
}

export interface GameSession {
  id: string
  quiz_id: string
  room_code: string
  status: string
  current_question_index: number
  started_at: string | null
  ended_at: string | null
  creator_session_id: string | null
  quizzes?: {
    id: string
    title: string
    description: string | null
    prize_amount: number
    prize_token: string | null
    contract_address: string | null
    contract_tx_hash: string | null
    prize_distribution_tx_hash?: string | null
    creator_address: string
    network_id: string | null
    user_fid: string | null
    user_id: string | null
    status: string
  }
}

export interface PlayerSession {
  id: string
  game_session_id: string
  player_name: string
  wallet_address: string | null
  user_id: string | null
  total_score: number
  joined_at: string
}

export interface GenerateQuizRequest {
  topic: string
  question_count: number
  difficulty?: "easy" | "medium" | "hard"
  context?: string
  documents?: Array<{ name: string; content: string }>
}

export interface GenerateQuizResponse {
  title: string
  description: string
  questions: Array<{
    question_text: string
    options: string[]
    correct_answer_index: number
    time_limit: number
  }>
}

