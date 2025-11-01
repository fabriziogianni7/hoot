import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { handleCorsPreFlight } from '../_shared/cors.ts'
import { successResponse, errorResponse } from '../_shared/response.ts'
import { validateRequired } from '../_shared/validation.ts'
import { initSupabaseClient } from '../_shared/supabase.ts'
import { BASE_POINTS, TIME_BONUS_MULTIPLIER } from '../_shared/constants.ts'
import { calculatePoints, validateAnswerSubmission } from '../_shared/game-logic.ts'
import type { SubmitAnswerRequest, Question } from '../_shared/types.ts'

async function fetchQuestion(supabase: ReturnType<typeof initSupabaseClient>, questionId: string): Promise<Question | null> {
  const { data, error } = await supabase
    .from('questions')
    .select('correct_answer_index, time_limit')
    .eq('id', questionId)
    .single()

  if (error) return null
  return data
}


async function createAnswer(
  supabase: ReturnType<typeof initSupabaseClient>,
  playerSessionId: string,
  questionId: string,
  answerIndex: number,
  isCorrect: boolean,
  timeTaken: number,
  pointsEarned: number
) {
  const { data, error } = await supabase
    .from('answers')
    .insert({
      player_session_id: playerSessionId,
      question_id: questionId,
      selected_answer_index: answerIndex,
      is_correct: isCorrect,
      time_taken: timeTaken,
      points_earned: pointsEarned
    })
    .select()
    .single()

  if (error) {
    throw new Error('Failed to submit answer')
  }

  return data
}

async function updatePlayerScore(
  supabase: ReturnType<typeof initSupabaseClient>,
  playerSessionId: string,
  pointsToAdd: number
): Promise<number> {
  const { data: playerSession, error: fetchError } = await supabase
    .from('player_sessions')
    .select('total_score')
    .eq('id', playerSessionId)
    .single()

  if (fetchError) {
    throw new Error('Failed to fetch player session')
  }

  const newTotalScore = (playerSession?.total_score || 0) + pointsToAdd

  const { error: updateError } = await supabase
    .from('player_sessions')
    .update({ total_score: newTotalScore })
    .eq('id', playerSessionId)

  if (updateError) {
    throw new Error('Failed to update player score')
  }

  return newTotalScore
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCorsPreFlight()
  }

  try {
    const supabase = initSupabaseClient(req)
    const { player_session_id, question_id, answer_index, time_taken }: SubmitAnswerRequest = await req.json()

    // Validate required fields
    if (!player_session_id || !question_id || answer_index < 0 || time_taken < 0) {
      return errorResponse('Missing or invalid required fields', 400)
    }

    // Fetch question
    const question = await fetchQuestion(supabase, question_id)
    if (!question) {
      return errorResponse('Question not found', 404)
    }

    // Validate submission timing
    const timingError = validateAnswerSubmission(time_taken, question.time_limit)
    if (timingError) {
      return errorResponse(timingError, 400)
    }

    // Check if answer is correct
    const isCorrect = answer_index === question.correct_answer_index

    // Check for existing answer submission (prevent duplicates)
    const { data: existingAnswer } = await supabase
      .from('answers')
      .select('id')
      .eq('player_session_id', player_session_id)
      .eq('question_id', question_id)
      .maybeSingle()

    if (existingAnswer) {
      return errorResponse('Answer already submitted for this question', 400)
    }

    // Calculate points
    const pointsEarned = calculatePoints(isCorrect, time_taken, question.time_limit)

    // Create answer record
    const answer = await createAnswer(
      supabase,
      player_session_id,
      question_id,
      answer_index,
      isCorrect,
      time_taken,
      pointsEarned
    )

    // Update player's total score
    const newTotalScore = await updatePlayerScore(supabase, player_session_id, pointsEarned)

    return successResponse({ 
      success: true,
      is_correct: isCorrect,
      points_earned: pointsEarned,
      new_total_score: newTotalScore,
      answer_id: answer.id
    })

  } catch (error) {
    console.error('Error submitting answer:', error)
    return errorResponse(error.message || 'Internal server error', 500)
  }
})
