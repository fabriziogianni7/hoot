import { initSupabaseClient } from './supabase.ts'
import { GAME_STATUS, QUIZ_STATUS } from './constants.ts'
import type { GameSession, PlayerSession } from './types.ts'

/**
 * Fetch a game session with quiz details
 */
export async function fetchGameSession(
  supabase: ReturnType<typeof initSupabaseClient>,
  gameSessionId: string
): Promise<GameSession | null> {
  const { data, error } = await supabase
    .from('game_sessions')
    .select(`
      *,
      quizzes (
        id,
        title,
        description,
        prize_amount,
        prize_token,
        contract_address,
        creator_address,
        status,
        mode,
        golden_question_ids,
        extra_bounty_amount
      )
    `)
    .eq('id', gameSessionId)
    .single()

  if (error) return null
  return data
}

/**
 * Fetch all player sessions for a game session
 */
export async function fetchPlayerSessions(
  supabase: ReturnType<typeof initSupabaseClient>,
  gameSessionId: string
): Promise<PlayerSession[]> {
  const { data, error } = await supabase
    .from('player_sessions')
    .select('id, player_name, wallet_address, total_score, joined_at')
    .eq('game_session_id', gameSessionId)
    .order('joined_at', { ascending: true })

  if (error) throw new Error('Failed to fetch players')
  return data || []
}

/**
 * Fetch questions for a quiz
 */
export async function fetchQuestions(
  supabase: ReturnType<typeof initSupabaseClient>,
  quizId: string
) {
  const { data, error } = await supabase
    .from('questions')
    .select('id, order_index')
    .eq('quiz_id', quizId)
    .order('order_index', { ascending: true })

  if (error) throw new Error('Failed to fetch questions')
  return data || []
}

/**
 * Validate that all players have completed the game
 */
export async function validateGameCompletion(
  supabase: ReturnType<typeof initSupabaseClient>,
  playerSessions: PlayerSession[],
  totalQuestions: number
): Promise<boolean> {
  for (const playerSession of playerSessions) {
    const { data: answers, error } = await supabase
      .from('answers')
      .select('question_id')
      .eq('player_session_id', playerSession.id)

    if (error || !answers || answers.length < totalQuestions) {
      return false
    }
  }
  return true
}

/**
 * Mark a game session as completed
 */
export async function markGameAsCompleted(
  supabase: ReturnType<typeof initSupabaseClient>,
  gameSessionId: string
) {
  const { error } = await supabase
    .from('game_sessions')
    .update({
      status: GAME_STATUS.COMPLETED,
      ended_at: new Date().toISOString()
    })
    .eq('id', gameSessionId)

  if (error) throw new Error('Failed to update game session')
}

/**
 * Update quiz status with transaction hash
 */
export async function updateQuizWithTransaction(
  supabase: ReturnType<typeof initSupabaseClient>,
  quizId: string,
  txHash: string
) {
  await supabase
    .from('quizzes')
    .update({
      status: QUIZ_STATUS.COMPLETED,
      contract_tx_hash: txHash
    })
    .eq('id', quizId)
}

/**
 * Check if a player is the quiz creator
 */
export function isCreator(creatorAddress: string, playerAddress: string): boolean {
  return creatorAddress?.toLowerCase() === playerAddress?.toLowerCase()
}

/**
 * Get question ID by quiz ID and question index
 */
export async function getQuestionIdByIndex(
  supabase: ReturnType<typeof initSupabaseClient>,
  quizId: string,
  questionIndex: number
): Promise<string | null> {
  const { data, error } = await supabase
    .from('questions')
    .select('id')
    .eq('quiz_id', quizId)
    .eq('order_index', questionIndex)
    .single()

  if (error) return null
  return data.id
}