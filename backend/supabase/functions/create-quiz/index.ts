import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { handleCorsPreFlight } from '../_shared/cors.ts'
import { successResponse, errorResponse } from '../_shared/response.ts'
import { validateRequired } from '../_shared/validation.ts'
import { initSupabaseClient } from '../_shared/supabase.ts'
import { QUIZ_STATUS } from '../_shared/constants.ts'
import type { CreateQuizRequest } from '../_shared/types.ts'
import { sendTelegramMessage } from '../_shared/telegram.ts'

function validateQuizData(request: CreateQuizRequest): string | null {
  const requiredError = validateRequired({
    title: request.title,
    questions: request.questions,
    prize_amount: request.prize_amount,
    creator_address: request.creator_address,
    network_id: request.network_id
  })
  
  if (requiredError) return requiredError
  
  if (request.questions.length === 0) {
    return 'At least one question is required'
  }
  
  for (let i = 0; i < request.questions.length; i++) {
    const q = request.questions[i]
    
    if (!q.question_text) {
      return `Question ${i + 1}: question_text is required`
    }
    
    if (!q.options || q.options.length === 0) {
      return `Question ${i + 1}: at least one option is required`
    }
    
    if (q.correct_answer_index < 0 || q.correct_answer_index >= q.options.length) {
      return `Question ${i + 1}: correct_answer_index must be between 0 and ${q.options.length - 1}`
    }
  }
  
  if (request.scheduled_start_time) {
    const scheduledDate = new Date(request.scheduled_start_time)
    if (isNaN(scheduledDate.getTime())) {
      return 'scheduled_start_time must be a valid date'
    }
    if (scheduledDate.getTime() < Date.now() + 60_000) {
      return 'scheduled_start_time must be at least 1 minute in the future'
    }
  }

  return null
}

function buildCronExpression(date: Date): string {
  const minutes = date.getUTCMinutes()
  const hours = date.getUTCHours()
  const dayOfMonth = date.getUTCDate()
  const month = date.getUTCMonth() + 1
  return `${minutes} ${hours} ${dayOfMonth} ${month} *`
}

async function scheduleQuizStart(
  supabase: ReturnType<typeof initSupabaseClient>,
  quizId: string,
  scheduledStartTime: string
) {
  const startDate = new Date(scheduledStartTime)
  const cronExpression = buildCronExpression(startDate)
  const jobName = `start_quiz_${quizId}`

  console.log("Creating cron job for quiz", {
    quizId,
    jobName,
    cronExpression,
    scheduledStartTime
  })

  const { error } = await supabase.rpc('create_quiz_start_cron_job', {
    job_name: jobName,
    schedule: cronExpression,
    quiz_id: quizId
  })

  if (error) {
    throw new Error(`Failed to schedule quiz start: ${error.message}`)
  }
}

async function createQuiz(supabase: ReturnType<typeof initSupabaseClient>, request: CreateQuizRequest) {
  const { data: quiz, error: quizError } = await supabase
    .from('quizzes')
    .insert({
      title: request.title,
      description: request.description,
      prize_amount: request.prize_amount,
      prize_token: request.prize_token || null,
      creator_address: request.creator_address,
      contract_address: request.contract_address || null,
      network_id: request.network_id,
      user_fid: request.user_fid || null,
      user_id: request.user_id || null,
      status: QUIZ_STATUS.PENDING,
      scheduled_start_time: request.scheduled_start_time ? new Date(request.scheduled_start_time).toISOString() : null,
      is_private: request.is_private ?? false
    })
    .select("id, title, prize_token, prize_amount, scheduled_start_time, network_id")
    .single()

  if (quizError) {
    throw new Error(`Failed to create quiz: ${quizError.message}`)
  }

  if (request.scheduled_start_time) {
    await scheduleQuizStart(supabase, quiz.id, request.scheduled_start_time)
    console.log("Cron job created for quiz", quiz.id)
  }

  return quiz
}

async function createQuestions(supabase: ReturnType<typeof initSupabaseClient>, quizId: string, questions: CreateQuizRequest['questions']) {
  const questionsData = questions.map((q, index) => ({
    quiz_id: quizId,
    question_text: q.question_text,
    options: q.options,
    correct_answer_index: q.correct_answer_index,
    order_index: index + 1,
    time_limit: q.time_limit || 15
  }))

  const { error: questionsError } = await supabase
    .from('questions')
    .insert(questionsData)

  if (questionsError) {
    // Rollback: delete the quiz since questions creation failed
    await supabase.from('quizzes').delete().eq('id', quizId)
    throw new Error(`Failed to create questions: ${questionsError.message}`)
  }
}

function generateRoomCode(): string {
  // Same format as frontend startGame: 6 uppercase alphanumeric characters
  return Math.random().toString(36).substring(2, 8).toUpperCase()
}

async function createGameSession(
  supabase: ReturnType<typeof initSupabaseClient>,
  quizId: string
): Promise<{ id: string; room_code: string }> {
  const roomCode = generateRoomCode()

  const { data: gameSession, error: gameError } = await supabase
    .from('game_sessions')
    .insert({
      quiz_id: quizId,
      room_code: roomCode,
      status: 'waiting',
      current_question_index: 0
    })
    .select('id, room_code')
    .single()

  if (gameError) {
    // Rollback: delete questions and quiz if game session creation fails
    await supabase.from('questions').delete().eq('quiz_id', quizId)
    await supabase.from('quizzes').delete().eq('id', quizId)
    throw new Error(`Failed to create game session: ${gameError.message}`)
  }

  return gameSession as { id: string; room_code: string }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCorsPreFlight()
  }

  try {
    const supabase = initSupabaseClient(req)
    const request: CreateQuizRequest = await req.json()

    // Get authenticated user from the session
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError) {
      console.warn('Auth error:', authError.message)
    }

    // If user is authenticated, use their ID; otherwise allow creation without user_id (for backward compatibility)
    if (user) {
      request.user_id = user.id
      console.log('Creating quiz for authenticated user:', user.id)
    } else {
      console.warn('Creating quiz without authenticated user')
    }

    // Validate input
    const validationError = validateQuizData(request)
    if (validationError) {
      return errorResponse(validationError, 400)
    }

    // Create quiz
    const quiz = await createQuiz(supabase, request)

    // Create questions
    await createQuestions(supabase, quiz.id, request.questions)

    // Send Telegram notification if quiz has a prize and is not private (non-blocking)
    if (request.prize_amount > 0 && !request.is_private) {
      // Support both FRONTEND_URL and FRONTEND_BASE_URL for flexibility
      const frontendUrl = Deno.env.get("FRONTEND_URL") || Deno.env.get("FRONTEND_BASE_URL") || "http://localhost:3000"
      
      // Check if a game session already exists for this quiz
      let roomCode: string | undefined = undefined
      try {
        const { data: existingGameSession } = await supabase
          .from('game_sessions')
          .select('room_code')
          .eq('quiz_id', quiz.id)
          .limit(1)
          .single()
        
        if (existingGameSession?.room_code) {
          roomCode = existingGameSession.room_code
          console.log("Found existing game session with room_code:", roomCode)
        }
      } catch (error) {
        // No game session exists yet, which is fine
        console.log("No game session found for quiz, will send message without room_code")
      }
      
      sendTelegramMessage({
        quiz_id: quiz.id,
        title: request.title,
        description: request.description,
        prize_amount: request.prize_amount,
        prize_token: request.prize_token || null,
        scheduled_start_time: request.scheduled_start_time || null,
        room_code: roomCode,
        frontend_url: frontendUrl
      }).catch((error) => {
        // Log error but don't fail the quiz creation
        console.error("Failed to send Telegram notification:", error)
      })
    }

    return successResponse({ 
      success: true, 
      quiz_id: quiz.id,
      room_code: gameSession.room_code,
      message: 'Quiz created successfully' 
    })

  } catch (error) {
    console.error('Error creating quiz:', error)
    return errorResponse(error.message || 'Internal server error', 500)
  }
})
