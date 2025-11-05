import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { handleCorsPreFlight } from '../_shared/cors.ts'
import { successResponse, errorResponse } from '../_shared/response.ts'
import { validateRequired } from '../_shared/validation.ts'
import { initSupabaseClient } from '../_shared/supabase.ts'
import { BASE_POINTS, TIME_BONUS_MULTIPLIER } from '../_shared/constants.ts'
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

function validateAnswerSubmission(timeTakenMs: number, timeLimitSeconds: number): string | null {
  const timeLimitMs = timeLimitSeconds * 1000
  
  if (timeTakenMs > timeLimitMs) {
    return 'Answer submitted too late'
  }
  
  return null
}

function calculatePoints(isCorrect: boolean, timeTakenMs: number, timeLimitSeconds: number): number {
  if (!isCorrect) {
    return 0
  }
  
  const timeLimitMs = timeLimitSeconds * 1000
  const remainingTimeSeconds = Math.max(0, timeLimitMs - timeTakenMs) / 1000
  const timeBonus = remainingTimeSeconds * TIME_BONUS_MULTIPLIER
  
  return Math.floor(BASE_POINTS + timeBonus)
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
  console.log('Creating answer record:', {
    playerSessionId,
    questionId,
    answerIndex,
    isCorrect,
    timeTaken,
    pointsEarned
  })

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
    console.error('Error creating answer record:', {
      error: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
      playerSessionId,
      questionId,
      answerIndex
    })
    throw new Error(`Failed to submit answer: ${error.message}`)
  }

  console.log('Answer record created successfully:', data.id)
  return data
}

async function updatePlayerScore(
  supabase: ReturnType<typeof initSupabaseClient>,
  playerSessionId: string,
  pointsToAdd: number
): Promise<number> {
  console.log('Updating player score:', { playerSessionId, pointsToAdd })

  const { data: playerSession, error: fetchError } = await supabase
    .from('player_sessions')
    .select('total_score')
    .eq('id', playerSessionId)
    .single()

  if (fetchError) {
    console.error('Error fetching player session:', fetchError)
    throw new Error(`Failed to fetch player session: ${fetchError.message}`)
  }

  const newTotalScore = (playerSession?.total_score || 0) + pointsToAdd

  const { error: updateError } = await supabase
    .from('player_sessions')
    .update({ total_score: newTotalScore })
    .eq('id', playerSessionId)

  if (updateError) {
    console.error('Error updating player score:', updateError)
    throw new Error(`Failed to update player score: ${updateError.message}`)
  }

  console.log('Player score updated:', { playerSessionId, oldScore: playerSession?.total_score || 0, newTotalScore })
  return newTotalScore
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCorsPreFlight()
  }

  try {
    // Use service role key to bypass RLS policies and ensure answers are saved
    const supabase = initSupabaseClient(req, true)
    const { player_session_id, question_id, answer_index, time_taken }: SubmitAnswerRequest = await req.json()

    console.log('Received answer submission:', {
      player_session_id,
      question_id,
      answer_index,
      time_taken
    })

    // Validate required fields
    // Allow answer_index === -1 for timeout cases
    if (!player_session_id || !question_id || answer_index === undefined || answer_index === null || time_taken < 0) {
      console.error('Validation failed:', {
        hasPlayerSessionId: !!player_session_id,
        hasQuestionId: !!question_id,
        answer_index,
        time_taken
      })
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

    // Check if answer is correct (skip for timeout cases where answer_index is -1)
    const isCorrect = answer_index >= 0 && answer_index === question.correct_answer_index

    // Check for existing answer submission (prevent duplicates)
    const { data: existingAnswer, error: existingError } = await supabase
      .from('answers')
      .select('id')
      .eq('player_session_id', player_session_id)
      .eq('question_id', question_id)
      .maybeSingle()

    if (existingError) {
      console.error('Error checking for existing answer:', existingError)
    }

    if (existingAnswer) {
      console.log('Answer already exists for this question:', existingAnswer.id)
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

    console.log('Answer submitted successfully:', {
      answer_id: answer.id,
      is_correct: isCorrect,
      points_earned: pointsEarned,
      new_total_score: newTotalScore
    })

    return successResponse({ 
      success: true,
      is_correct: isCorrect,
      points_earned: pointsEarned,
      new_total_score: newTotalScore,
      answer_id: answer.id
    })

  } catch (error) {
    console.error('Error submitting answer:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    })
    return errorResponse(error.message || 'Internal server error', 500)
  }
})
