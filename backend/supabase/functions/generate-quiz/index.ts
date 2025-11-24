import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { handleCorsPreFlight } from '../_shared/cors.ts'
import { successResponse, errorResponse } from '../_shared/response.ts'
import { validateRequired } from '../_shared/validation.ts'
import type { GenerateQuizRequest, GenerateQuizResponse } from '../_shared/types.ts'

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")

function buildPrompt(
  topic: string,
  questionCount: number,
  difficulty?: "easy" | "medium" | "hard",
  context?: string,
  documents?: Array<{ name: string; content: string }>
): string {
  const difficultyInstructions = {
    easy: "Easy 😇: Create simple, straightforward questions with obvious correct answers. Use basic concepts and terminology. Wrong answers should be clearly distinguishable from the correct one.",
    medium: "Medium 🤔: Create moderately challenging questions that require some knowledge. Use intermediate concepts and terminology. Wrong answers should be plausible but still distinguishable.",
    hard: "Hard 🤬: Create very challenging questions that test deep understanding. Use advanced concepts, technical terminology, and nuanced distinctions. Wrong answers should be very plausible and require careful thinking to distinguish from the correct answer."
  }

  const difficultyText = difficultyInstructions[difficulty || "medium"]

  let prompt = `Create a multiple-choice quiz about "${topic}" with exactly ${questionCount} questions.

Difficulty Level: ${difficultyText}

Requirements:
- Each question must have exactly 4 answer options
- One option must be clearly correct
- The other 3 options should be plausible but incorrect
- Questions should be clear and concise
- Answer options should be concise (under 200 characters each)
- Questions should be progressively more challenging if possible
- The correct answer must not be always in the same position (like always the first option)

`

  if (context) {
    prompt += `Additional context/instructions:\n${context}\n\n`
  }

  if (documents && documents.length > 0) {
    prompt += `Reference material:\n`
    for (const doc of documents) {
      prompt += `\n--- Document: ${doc.name} ---\n${doc.content}\n`
    }
    prompt += `\nUse the above reference material to create accurate questions.\n\n`
  }

  prompt += `Output format: Return a JSON object with this exact structure:
{
  "title": "Quiz title about the topic",
  "description": "Brief description of the quiz",
  "questions": [
    {
      "question_text": "Question text here",
      "options": ["Option 1", "Option 2", "Option 3", "Option 4"],
      "correct_answer_index": 0,
      "time_limit": 15
    }
  ]
}

Important: 
- correct_answer_index must be 0, 1, 2, or 3 (the index of the correct option)
- time_limit should be 15 seconds for each question
- Return ONLY valid JSON, no markdown formatting or code blocks`

  return prompt
}

// Fisher-Yates shuffle algorithm to randomize array
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled
}

// Randomize the position of the correct answer in each question
function randomizeCorrectAnswerPosition(quiz: GenerateQuizResponse): GenerateQuizResponse {
  const randomizedQuiz = {
    ...quiz,
    questions: quiz.questions.map((q) => {
      // Store the correct answer
      const correctAnswer = q.options[q.correct_answer_index]
      
      // Shuffle the options array
      const shuffledOptions = shuffleArray(q.options)
      
      // Find the new index of the correct answer
      const newCorrectIndex = shuffledOptions.findIndex(option => option === correctAnswer)
      
      return {
        ...q,
        options: shuffledOptions,
        correct_answer_index: newCorrectIndex,
      }
    }),
  }
  
  return randomizedQuiz
}

function validateAiQuiz(quiz: GenerateQuizResponse): string | null {
  if (!quiz.title || quiz.title.trim() === '') {
    return 'Generated quiz must have a title'
  }

  if (!quiz.questions || !Array.isArray(quiz.questions)) {
    return 'Generated quiz must have a questions array'
  }

  if (quiz.questions.length === 0) {
    return 'Generated quiz must have at least one question'
  }

  for (let i = 0; i < quiz.questions.length; i++) {
    const q = quiz.questions[i]

    if (!q.question_text || q.question_text.trim() === '') {
      return `Question ${i + 1}: question_text is required`
    }

    if (!q.options || !Array.isArray(q.options) || q.options.length !== 4) {
      return `Question ${i + 1}: must have exactly 4 options`
    }

    for (let j = 0; j < q.options.length; j++) {
      if (!q.options[j] || q.options[j].trim() === '') {
        return `Question ${i + 1}, Option ${j + 1}: cannot be empty`
      }
    }

    if (typeof q.correct_answer_index !== 'number' || 
        q.correct_answer_index < 0 || 
        q.correct_answer_index >= q.options.length) {
      return `Question ${i + 1}: correct_answer_index must be between 0 and 3`
    }

    if (typeof q.time_limit !== 'number' || q.time_limit < 5 || q.time_limit > 60) {
      return `Question ${i + 1}: time_limit must be between 5 and 60 seconds`
    }
  }

  return null
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCorsPreFlight()
  }

  try {
    if (!OPENAI_API_KEY) {
      return errorResponse('AI service is not configured', 500)
    }

    const payload: GenerateQuizRequest = await req.json()

    // Validate required fields
    const missing = validateRequired({
      topic: payload.topic,
      question_count: payload.question_count,
    })
    if (missing) {
      return errorResponse(missing, 400)
    }

    // Validate question count
    if (typeof payload.question_count !== 'number' || 
        payload.question_count < 1 || 
        payload.question_count > 10) {
      return errorResponse('question_count must be between 1 and 10', 400)
    }

    // Process documents - limit to 3 and truncate content
    const documents = (payload.documents || [])
      .slice(0, 3)
      .map((doc) => ({
        name: doc.name || 'Untitled',
        content: doc.content.slice(0, 15000), // Limit to 15k chars per doc
      }))

    // Build the prompt
    const prompt = buildPrompt(
      payload.topic,
      payload.question_count,
      payload.difficulty || "medium",
      payload.context,
      documents
    )

    // Call OpenAI API
    const aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.3,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: 'You are HOOT, an assistant that creates engaging multiple-choice trivia quizzes. Always output valid JSON matching the exact structure requested. Do not include markdown code blocks or any text outside the JSON object.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
      }),
    })

    if (!aiResponse.ok) {
      await aiResponse.text()
      return errorResponse('Failed to generate quiz. Please try again.', 502)
    }

    const completion = await aiResponse.json()
    const content = completion?.choices?.[0]?.message?.content

    if (!content) {
      return errorResponse('No content received from AI service', 502)
    }

    // Parse the JSON response
    let parsed: GenerateQuizResponse
    try {
      // Remove any markdown code blocks if present
      const cleanedContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
      parsed = JSON.parse(cleanedContent) as GenerateQuizResponse
    } catch (parseError) {
      return errorResponse('Invalid response format from AI service', 502)
    }

    // Validate the generated quiz structure
    const validationError = validateAiQuiz(parsed)
    if (validationError) {
      return errorResponse(`Generated quiz validation failed: ${validationError}`, 422)
    }

    // Ensure we have the exact number of questions requested
    if (parsed.questions.length !== payload.question_count) {
      parsed.questions = parsed.questions.slice(0, payload.question_count)
    }

    // Randomize the position of correct answers
    const randomizedQuiz = randomizeCorrectAnswerPosition(parsed)

    return successResponse({
      success: true,
      quiz: randomizedQuiz,
    })

  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : 'Internal server error',
      500
    )
  }
})

