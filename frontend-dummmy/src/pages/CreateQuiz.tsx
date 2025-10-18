import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWallet } from '../contexts/WalletContext'
import { useSupabase } from '../contexts/SupabaseContext'
import { useGame } from '../contexts/GameContext'
import { ethers } from 'ethers'
import { getContractAddress, HOOT_QUIZ_MANAGER_ABI } from '../config/contracts'

interface Question {
  question_text: string
  options: string[]
  correct_answer_index: number
  time_limit: number
}

const CreateQuiz: React.FC = () => {
  const navigate = useNavigate()
  const { account, provider, isConnected } = useWallet()
  const { supabase } = useSupabase()
  const { setPlayerSessionId, setGameSessionId, setRoomCode, setPlayerName, setIsCreator } = useGame()
  
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [prizeAmount, setPrizeAmount] = useState('')
  const [questions, setQuestions] = useState<Question[]>([
    {
      question_text: '',
      options: ['', '', '', ''],
      correct_answer_index: 0,
      time_limit: 15
    }
  ])
  const [isLoading, setIsLoading] = useState(false)

  // Get contract address for current network
  const CONTRACT_ADDRESS = getContractAddress('local')

  // Create quiz on smart contract with prize deposit
  const createQuizOnContract = async (quizId: string, prizeAmount: number) => {
    console.log('🔗 Creating quiz on contract...')
    console.log('Contract address:', CONTRACT_ADDRESS)
    console.log('Quiz ID:', quizId)
    console.log('Prize amount:', prizeAmount)
    
    if (!provider || !account) {
      throw new Error('Wallet not connected')
    }

    try {
      console.log('📝 Getting signer...')
      const signer = await provider.getSigner()
      console.log('📝 Creating contract instance...')
      const contract = new ethers.Contract(CONTRACT_ADDRESS, HOOT_QUIZ_MANAGER_ABI, signer)
      
      // Convert ETH to wei
      const prizeAmountWei = ethers.parseEther(prizeAmount.toString())
      console.log('💰 Prize amount in wei:', prizeAmountWei.toString())
      
      console.log('📤 Calling createQuiz function...')
      // Call createQuiz function with ETH deposit
      const tx = await contract.createQuiz(quizId, ethers.ZeroAddress, prizeAmountWei, {
        value: prizeAmountWei
      })
      
      console.log('📡 Transaction sent:', tx.hash)
      console.log('⏳ Waiting for confirmation...')
      await tx.wait()
      console.log('✅ Transaction confirmed')
      
      return CONTRACT_ADDRESS
    } catch (error) {
      console.error('❌ Error creating quiz on contract:', error)
      throw error
    }
  }

  const addQuestion = () => {
    setQuestions([...questions, {
      question_text: '',
      options: ['', '', '', ''],
      correct_answer_index: 0,
      time_limit: 15
    }])
  }

  const updateQuestion = (index: number, field: keyof Question, value: string | number) => {
    const updated = [...questions]
    updated[index] = { ...updated[index], [field]: value }
    setQuestions(updated)
  }

  const updateOption = (questionIndex: number, optionIndex: number, value: string) => {
    const updated = [...questions]
    updated[questionIndex].options[optionIndex] = value
    setQuestions(updated)
  }

  const removeQuestion = (index: number) => {
    if (questions.length > 1) {
      setQuestions(questions.filter((_, i) => i !== index))
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    console.log('🚀 Starting quiz creation...')
    console.log('Wallet connected:', isConnected)
    console.log('Account:', account)
    console.log('Provider:', provider)
    console.log('Contract address:', CONTRACT_ADDRESS)
    
    if (!isConnected) {
      alert('Please connect your wallet first')
      return
    }

    if (!title || questions.some(q => !q.question_text || q.options.some(opt => !opt))) {
      alert('Please fill in all required fields')
      return
    }

    setIsLoading(true)

    try {
      console.log('📝 Creating quiz via edge function...')
      console.log('Quiz data:', {
        title,
        description,
        questions,
        prize_amount: parseFloat(prizeAmount),
        creator_address: account
      })

      // Create quiz via edge function
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-quiz`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
        },
        body: JSON.stringify({
          title,
          description,
          questions,
          prize_amount: parseFloat(prizeAmount),
          prize_token: null, // ETH for now
          creator_address: account,
          contract_address: CONTRACT_ADDRESS
        })
      })

      console.log('📡 Edge function response status:', response.status)
      const result = await response.json()
      console.log('📡 Edge function response:', result)

      if (result.success) {
        console.log('✅ Quiz created successfully, creating quiz on contract...')
        // Create quiz on smart contract with prize deposit
        await createQuizOnContract(result.quiz_id, parseFloat(prizeAmount))
        console.log('✅ Quiz created on contract successfully')
        
        // Create game session
        console.log('🎮 Creating game session...')
        const { data: gameSession, error } = await supabase
          .from('game_sessions')
          .insert({
            quiz_id: result.quiz_id,
            room_code: Math.random().toString(36).substring(2, 8).toUpperCase()
          })
          .select()
          .single()

        if (error) {
          console.error('❌ Error creating game session:', error)
          throw error
        }

        console.log('✅ Game session created:', gameSession.room_code)
        
        // Create player session for creator
        console.log('👤 Creating creator player session...')
        const { data: playerSession, error: playerError } = await supabase
          .from('player_sessions')
          .insert({
            game_session_id: gameSession.id,
            player_name: 'Creator',
            wallet_address: account,
            total_score: 0
          })
          .select()
          .single()

        if (playerError) {
          console.error('❌ Error creating creator player session:', playerError)
          throw playerError
        }

        // Update game session with creator session ID
        await supabase
          .from('game_sessions')
          .update({ creator_session_id: playerSession.id })
          .eq('id', gameSession.id)

        console.log('✅ Creator player session created:', playerSession.id)
        console.log('🎮 Room Code:', gameSession.room_code)
        console.log('👤 Creator Player Session ID:', playerSession.id)
        console.log('🎯 Is Creator: true')
        
        // Set creator context
        setPlayerSessionId(playerSession.id)
        setGameSessionId(gameSession.id)
        setRoomCode(gameSession.room_code)
        setPlayerName('Creator')
        setIsCreator(true)
        
        console.log('🚀 Navigating to lobby as creator...')
        navigate(`/lobby/${gameSession.room_code}`)
      } else {
        console.error('❌ Edge function error:', result.error)
        throw new Error(result.error || 'Failed to create quiz')
      }
    } catch (error) {
      console.error('❌ Error creating quiz:', error)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      alert(`Failed to create quiz: ${errorMessage}`)
    } finally {
      setIsLoading(false)
    }
  }

  if (!isConnected) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Wallet Required</h1>
          <p className="text-gray-600 mb-4">Please connect your wallet to create a quiz</p>
          <button
            onClick={() => navigate('/')}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
          >
            Go Back
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="container mx-auto px-4 max-w-4xl">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-8">Create Quiz</h1>
          
          <form onSubmit={handleSubmit} className="space-y-8">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Quiz Title *
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={3}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Prize Amount (ETH) *
              </label>
              <input
                type="number"
                step="0.001"
                value={prizeAmount}
                onChange={(e) => setPrizeAmount(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

            <div>
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold text-gray-900">Questions</h2>
                <button
                  type="button"
                  onClick={addQuestion}
                  className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md"
                >
                  Add Question
                </button>
              </div>

              {questions.map((question, questionIndex) => (
                <div key={questionIndex} className="border border-gray-200 rounded-lg p-6 mb-6">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-medium text-gray-900">
                      Question {questionIndex + 1}
                    </h3>
                    {questions.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeQuestion(questionIndex)}
                        className="text-red-600 hover:text-red-700"
                      >
                        Remove
                      </button>
                    )}
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Question Text *
                      </label>
                      <input
                        type="text"
                        value={question.question_text}
                        onChange={(e) => updateQuestion(questionIndex, 'question_text', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Answer Options *
                      </label>
                      {question.options.map((option, optionIndex) => (
                        <div key={optionIndex} className="flex items-center mb-2">
                          <input
                            type="radio"
                            name={`correct-${questionIndex}`}
                            checked={question.correct_answer_index === optionIndex}
                            onChange={() => updateQuestion(questionIndex, 'correct_answer_index', optionIndex)}
                            className="mr-3"
                          />
                          <input
                            type="text"
                            value={option}
                            onChange={(e) => updateOption(questionIndex, optionIndex, e.target.value)}
                            className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                            required
                          />
                        </div>
                      ))}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Time Limit (seconds)
                      </label>
                      <input
                        type="number"
                        value={question.time_limit}
                        onChange={(e) => updateQuestion(questionIndex, 'time_limit', parseInt(e.target.value))}
                        className="w-32 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        min="5"
                        max="60"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end space-x-4">
              <button
                type="button"
                onClick={() => navigate('/')}
                className="px-6 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isLoading}
                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md disabled:opacity-50"
              >
                {isLoading ? 'Creating...' : 'Create Quiz'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

export default CreateQuiz
