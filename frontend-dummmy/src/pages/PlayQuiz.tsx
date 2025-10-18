import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useSupabase } from '../contexts/SupabaseContext'
import { useGame } from '../contexts/GameContext'

const PlayQuiz: React.FC = () => {
  const { roomCode } = useParams<{ roomCode: string }>()
  const navigate = useNavigate()
  const { supabase } = useSupabase()
  const { playerSessionId, gameSessionId } = useGame()
  
  const [currentQuestion, setCurrentQuestion] = useState<any>(null)
  const [questionIndex, setQuestionIndex] = useState(0)
  const [timeLeft, setTimeLeft] = useState(15)
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null)
  const [isAnswered, setIsAnswered] = useState(false)
  const [score, setScore] = useState(0)
  const [questions, setQuestions] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!roomCode) return

    const fetchQuestions = async () => {
      try {
        // Get game session
        const { data: gameSession, error: sessionError } = await supabase
          .from('game_sessions')
          .select('quiz_id, current_question_index')
          .eq('room_code', roomCode)
          .single()

        if (sessionError) throw sessionError

        // Get questions
        const { data: questionsData, error: questionsError } = await supabase
          .from('questions')
          .select('*')
          .eq('quiz_id', gameSession.quiz_id)
          .order('order_index')

        if (questionsError) throw questionsError

        setQuestions(questionsData || [])
        setQuestionIndex(gameSession.current_question_index || 0)
        setIsLoading(false)
      } catch (error) {
        console.error('Error fetching questions:', error)
        alert('Failed to load questions')
        navigate('/')
      }
    }

    fetchQuestions()
  }, [roomCode, supabase, navigate])

  useEffect(() => {
    if (questions.length > 0 && questionIndex < questions.length) {
      setCurrentQuestion(questions[questionIndex])
      setTimeLeft(questions[questionIndex].time_limit || 15)
      setSelectedAnswer(null)
      setIsAnswered(false)
    }
  }, [questions, questionIndex])

  useEffect(() => {
    if (timeLeft > 0 && !isAnswered) {
      const timer = setTimeout(() => setTimeLeft(timeLeft - 1), 1000)
      return () => clearTimeout(timer)
    } else if (timeLeft === 0 && !isAnswered) {
      handleAnswer(-1) // Time's up
    }
  }, [timeLeft, isAnswered])

  const completeGame = async () => {
    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/complete-game`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
        },
        body: JSON.stringify({
          game_session_id: gameSessionId
        })
      })

      const result = await response.json()
      console.log('Game completion result:', result)
    } catch (error) {
      console.error('Error completing game:', error)
    }
  }

  const handleAnswer = async (answerIndex: number) => {
    if (isAnswered) return

    setIsAnswered(true)
    setSelectedAnswer(answerIndex)

    const timeTaken = (currentQuestion?.time_limit || 15) - timeLeft

    try {
      // Submit answer via edge function
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/submit-answer`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
        },
        body: JSON.stringify({
          player_session_id: playerSessionId,
          question_id: currentQuestion.id,
          answer_index: answerIndex,
          time_taken: timeTaken * 1000 // Convert to milliseconds
        })
      })

      const result = await response.json()

      if (result.success) {
        setScore(result.new_total_score)
      }
    } catch (error) {
      console.error('Error submitting answer:', error)
    }

    // Move to next question after 3 seconds
    setTimeout(async () => {
      if (questionIndex + 1 < questions.length) {
        setQuestionIndex(questionIndex + 1)
      } else {
        // Game finished - trigger completion
        await completeGame()
        navigate(`/results/${roomCode}`)
      }
    }, 3000)
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading questions...</p>
        </div>
      </div>
    )
  }

  if (!currentQuestion) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">No Questions Available</h1>
          <button
            onClick={() => navigate('/')}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
          >
            Go Home
          </button>
        </div>
      </div>
    )
  }

  const isCorrect = selectedAnswer === currentQuestion.correct_answer_index
  const isWrong = selectedAnswer !== -1 && selectedAnswer !== currentQuestion.correct_answer_index

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="container mx-auto px-4 max-w-4xl">
        <div className="bg-white rounded-lg shadow-lg p-8">
          {/* Header */}
          <div className="flex justify-between items-center mb-8">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Question {questionIndex + 1} of {questions.length}</h1>
              <p className="text-gray-600">Score: {score}</p>
            </div>
            <div className="text-right">
              <div className={`text-3xl font-bold ${timeLeft <= 5 ? 'text-red-600' : 'text-blue-600'}`}>
                {timeLeft}
              </div>
              <p className="text-sm text-gray-500">seconds left</p>
            </div>
          </div>

          {/* Question */}
          <div className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-6">
              {currentQuestion.question_text}
            </h2>

            <div className="space-y-3">
              {currentQuestion.options.map((option: string, index: number) => (
                <button
                  key={index}
                  onClick={() => handleAnswer(index)}
                  disabled={isAnswered}
                  className={`w-full p-4 text-left rounded-lg border-2 transition-colors ${
                    isAnswered
                      ? index === currentQuestion.correct_answer_index
                        ? 'border-green-500 bg-green-50 text-green-800'
                        : index === selectedAnswer
                        ? 'border-red-500 bg-red-50 text-red-800'
                        : 'border-gray-200 bg-gray-50'
                      : 'border-gray-300 hover:border-blue-500 hover:bg-blue-50'
                  }`}
                >
                  <span className="font-medium mr-3">
                    {String.fromCharCode(65 + index)}.
                  </span>
                  {option}
                </button>
              ))}
            </div>
          </div>

          {/* Answer Feedback */}
          {isAnswered && (
            <div className={`p-4 rounded-lg mb-6 ${
              isCorrect ? 'bg-green-50 border border-green-200' : 
              isWrong ? 'bg-red-50 border border-red-200' : 
              'bg-yellow-50 border border-yellow-200'
            }`}>
              <p className={`font-semibold ${
                isCorrect ? 'text-green-800' : 
                isWrong ? 'text-red-800' : 
                'text-yellow-800'
              }`}>
                {isCorrect ? '✅ Correct!' : 
                 isWrong ? '❌ Wrong!' : 
                 '⏰ Time\'s up!'}
              </p>
              {!isCorrect && (
                <p className="text-sm mt-1">
                  The correct answer was: {currentQuestion.options[currentQuestion.correct_answer_index]}
                </p>
              )}
            </div>
          )}

          {/* Progress Bar */}
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div 
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${((questionIndex + 1) / questions.length) * 100}%` }}
            ></div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default PlayQuiz
