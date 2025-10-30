// Backend types matching Supabase database schema

export interface Quiz {
  id: string
  title: string
  description: string | null
  prize_amount: number
  prize_token: string | null
  creator_address: string
  contract_address: string | null
  contract_tx_hash: string | null
  network_id: string | null
  user_fid: string | null
  user_id: string | null
  status: 'pending' | 'active' | 'completed' | 'cancelled'
  created_at?: string
  started_at?: string | null
  ended_at?: string | null
}

export interface Question {
  id: string
  quiz_id: string
  question_text: string
  options: string[]
  correct_answer_index: number
  order_index: number
  time_limit: number
}

export interface GameSession {
  id: string
  quiz_id: string
  room_code: string
  status: 'waiting' | 'in_progress' | 'completed'
  current_question_index: number
  creator_session_id: string | null
  question_started_at?: string | null
  started_at?: string | null
  ended_at?: string | null
  created_at?: string
  quizzes?: Quiz
}

export interface PlayerSession {
  id: string
  game_session_id: string
  player_name: string
  wallet_address: string | null
  user_id: string | null
  total_score: number
  joined_at?: string
}

export interface Answer {
  id: string
  player_session_id: string
  question_id: string
  selected_answer_index: number
  is_correct: boolean
  time_taken: number
  points_earned: number
  answered_at?: string
}

// Request/Response types for Edge Functions
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
  prize_token?: string | null
  contract_address?: string | null
  creator_address: string
  network_id: string
  user_fid?: string | null
}

export interface CreateQuizResponse {
  success: boolean
  quiz_id: string
  message: string
}

export interface JoinGameRequest {
  room_code: string
  player_name: string
  wallet_address?: string
}

export interface JoinGameResponse {
  success: boolean
  player_session_id: string
  is_creator: boolean
  game_session: GameSession
  quiz: Quiz
  players: PlayerSession[]
}

export interface SubmitAnswerRequest {
  player_session_id: string
  question_id: string
  answer_index: number
  time_taken: number
}

export interface SubmitAnswerResponse {
  success: boolean
  is_correct: boolean
  points_earned: number
  new_total_score: number
  answer_id: string
}


