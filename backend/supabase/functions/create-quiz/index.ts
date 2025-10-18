import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { handleCorsPreFlight } from '../_shared/cors.ts'
import { successResponse, errorResponse } from '../_shared/response.ts'
import { validateRequired } from '../_shared/validation.ts'
import { initSupabaseClient } from '../_shared/supabase.ts'
import { QUIZ_STATUS } from '../_shared/constants.ts'
import type { CreateQuizRequest } from '../_shared/types.ts'

function validateQuizData(request: CreateQuizRequest): string | null {
  const requiredError = validateRequired({
    title: request.title,
    questions: request.questions,
    prize_amount: request.prize_amount,
    creator_address: request.creator_address
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
  
  return null
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
      status: QUIZ_STATUS.PENDING
    })
    .select()
    .single()

  if (quizError) {
    throw new Error(`Failed to create quiz: ${quizError.message}`)
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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCorsPreFlight()
  }

  try {
    const supabase = initSupabaseClient()
    const request: CreateQuizRequest = await req.json()

    // Validate input
    const validationError = validateQuizData(request)
    if (validationError) {
      return errorResponse(validationError, 400)
    }

    // Create quiz
    const quiz = await createQuiz(supabase, request)

    // Create questions
    await createQuestions(supabase, quiz.id, request.questions)

    return successResponse({ 
      success: true, 
      quiz_id: quiz.id,
      message: 'Quiz created successfully' 
    })

  } catch (error) {
    console.error('Error creating quiz:', error)
    return errorResponse(error.message || 'Internal server error', 500)
  }
})
