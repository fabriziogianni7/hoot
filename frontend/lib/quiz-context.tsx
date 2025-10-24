"use client"

import { createContext, useContext, useState, useCallback, type ReactNode, useEffect, useRef } from "react"
import type { Quiz, GameState, PlayerAnswer } from "./types"
import { useSupabase } from "./supabase-context"
import { callEdgeFunction } from "./supabase-client"
import type { 
  CreateQuizRequest, 
  CreateQuizResponse,
  JoinGameRequest, 
  JoinGameResponse,
  SubmitAnswerRequest,
  SubmitAnswerResponse,
  GameSession as BackendGameSession,
  PlayerSession as BackendPlayerSession,
  Quiz as BackendQuiz,
  Question as BackendQuestion
} from "./backend-types"
import type { RealtimeChannel } from "@supabase/supabase-js"

interface QuizContextType {
  currentQuiz: Quiz | null
  currentGame: GameState | null
  setCurrentQuiz: (quiz: Quiz) => void
  setCurrentGame: (game: GameState | null) => void
  createQuizOnBackend: (quiz: Quiz, contractAddress?: string | undefined , networkId?: number | undefined, userFid?: string | undefined, userAddress?: string | undefined, prizeAmount?: number, prizeToken?: string | undefined ) => Promise<string>
  startGame: (quizId: string, customRoomCode?: string) => Promise<string>
  joinGame: (playerName: string, walletAddress?: string, providedRoomCode?: string) => Promise<string>
  submitAnswer: (playerId: string, questionId: string, answer: number, timeToAnswer: number) => Promise<void>
  nextQuestion: () => Promise<void>
  endGame: () => void
  getCurrentQuiz: () => Quiz | null
  findGameByRoomCode: (roomCode: string) => Promise<GameSession | null>
  gameSessionId: string | null
  roomCode: string | null
}

const QuizContext = createContext<QuizContextType | undefined>(undefined)

// Helper to convert backend quiz to frontend quiz format
function convertBackendQuizToQuiz(backendQuiz: BackendQuiz, questions: BackendQuestion[]): Quiz {
  return {
    id: backendQuiz.id,
    title: backendQuiz.title,
    description: backendQuiz.description || "",
    questions: questions.map(q => ({
      id: q.id,
      text: q.question_text,
      options: q.options,
      correctAnswer: q.correct_answer_index,
      timeLimit: q.time_limit || 15
    })),
    createdAt: backendQuiz.created_at ? new Date(backendQuiz.created_at) : new Date()
  }
}

// Helper to convert backend game session to frontend game state
function convertBackendGameToGameState(
  gameSession: BackendGameSession, 
  players: BackendPlayerSession[]
): GameState {
  console.log('convertBackendGameToGameState - gameSession.quiz_id:', gameSession.quiz_id);
  console.log('convertBackendGameToGameState - full gameSession:', gameSession);
  
  return {
    quizId: gameSession.quiz_id,
    status: gameSession.status === 'waiting' ? 'waiting' : 
            gameSession.status === 'in_progress' ? 'question' : 'finished',
    currentQuestionIndex: gameSession.current_question_index,
    players: players.map(p => ({
      id: p.id,
      name: p.player_name,
      score: p.total_score,
      answers: [] // Answers will be fetched separately if needed
    })),
    startTime: gameSession.started_at ? new Date(gameSession.started_at).getTime() : Date.now(),
    questionStartTime: null
  }
}

export function QuizProvider({ children }: { children: ReactNode }) {
  const { supabase } = useSupabase()
  const [currentQuiz, setCurrentQuiz] = useState<Quiz | null>(null)
  const [currentGame, setCurrentGame] = useState<GameState | null>(null)
  const [gameSessionId, setGameSessionId] = useState<string | null>(null)
  const [roomCode, setRoomCode] = useState<string | null>(null)
  
  // Realtime channels
  const gameChannelRef = useRef<RealtimeChannel | null>(null)
  const playersChannelRef = useRef<RealtimeChannel | null>(null)

  const createQuizOnBackend = useCallback(async (
    quiz: Quiz, 
    contractAddress?: string | undefined, 
    networkId?: number | undefined,
    userFid?: string | undefined,
    userAddress?: string | undefined,
    prizeAmount?: number,
    prizeToken?: string | undefined
  ): Promise<string> => {
    try {
      // Validate required fields
      if (!userAddress) {
        throw new Error('User address is required to create a quiz')
      }
      if (!networkId) {
        throw new Error('Network ID is required to create a quiz')
      }

      const request: CreateQuizRequest = {
        title: quiz.title,
        description: quiz.description,
        questions: quiz.questions.map(q => ({
          question_text: q.text,
          options: q.options,
          correct_answer_index: q.correctAnswer,
          time_limit: q.timeLimit
        })),
        prize_amount: prizeAmount || 0,
        prize_token: prizeToken,
        contract_address: contractAddress,
        creator_address: userAddress,
        network_id: networkId.toString(),
        user_fid: userFid
      }

      const response = await callEdgeFunction<CreateQuizRequest, CreateQuizResponse>(
        'create-quiz',
        request
      )

      return response.quiz_id
    } catch (error) {
      console.error('Error creating quiz on backend:', error)
      throw error
    }
  }, [])

  const findGameByRoomCode = useCallback(async (roomCode: string): Promise<GameSession | null> => {
    try {
      const { data, error } = await supabase
        .from('game_sessions')
        .select(`
          *,
          quizzes (*)
        `)
        .eq('room_code', roomCode)
        .single()

      if (error || !data) return null

      return data as unknown as GameSession
    } catch (error) {
      console.error('Error finding game by room code:', error)
      return null
    }
  }, [supabase])

  const startGame = useCallback(async (quizId: string, customRoomCode?: string): Promise<string> => {
    try {
      console.log('startGame called with quizId:', quizId);
      
      // Generate a room code if not provided
      const generatedRoomCode = customRoomCode || `${Math.random().toString(36).substring(2, 8).toUpperCase()}`
      
      // Create game session in database
      const { data: gameSession, error: gameError } = await supabase
        .from('game_sessions')
        .insert({
          quiz_id: quizId,
          room_code: generatedRoomCode,
          status: 'waiting',
          current_question_index: 0
        })
        .select()
        .single()

      if (gameError) throw gameError

      console.log('Game session created with quiz_id:', gameSession.quiz_id);

      setGameSessionId(gameSession.id)
      setRoomCode(generatedRoomCode)

      // Initialize empty game state
    setCurrentGame({
      quizId,
      status: "waiting",
        currentQuestionIndex: 0,
      players: [],
      startTime: Date.now(),
      questionStartTime: null,
      })

      console.log('currentGame initialized with quizId:', quizId);

      // Subscribe to realtime updates for this game session
      subscribeToGameUpdates(gameSession.id)
      
      console.log('Game session created:', gameSession.id, 'Room code:', generatedRoomCode)
      
      return generatedRoomCode
    } catch (error) {
      console.error('Error starting game:', error)
      throw error
    }
  }, [supabase])

  const joinGame = useCallback(async (playerName: string, walletAddress?: string, providedRoomCode?: string): Promise<string> => {
    try {
      const roomCodeToUse = providedRoomCode || roomCode;
      if (!roomCodeToUse) {
        throw new Error('No room code provided')
      }

      console.log('joinGame called for room:', roomCodeToUse);

      const request: JoinGameRequest = {
        room_code: roomCodeToUse,
        player_name: playerName,
        wallet_address: walletAddress
      }

      const response = await callEdgeFunction<JoinGameRequest, JoinGameResponse>(
        'join-game',
        request
      )

      console.log('joinGame response - game_session.quiz_id:', response.game_session.quiz_id);
      console.log('joinGame response - quiz.id:', response.quiz.id);

      // Update local state
      setGameSessionId(response.game_session.id)
      setRoomCode(roomCodeToUse)
      
      // Load quiz from backend and set as current quiz
      console.log('Loading quiz from backend');
      const { data: questionsData } = await supabase
        .from('questions')
        .select('*')
        .eq('quiz_id', response.quiz.id)
        .order('order_index', { ascending: true })

      const fullQuiz = convertBackendQuizToQuiz(response.quiz, questionsData || [])
      console.log('Setting current quiz with ID:', fullQuiz.id);
      setCurrentQuiz(fullQuiz)

      // Subscribe to realtime updates
      subscribeToGameUpdates(response.game_session.id)

      // Update current game state
      const newGameState = convertBackendGameToGameState(response.game_session, response.players);
      console.log('Setting currentGame with quizId:', newGameState.quizId);
      setCurrentGame(newGameState)

      return response.player_session_id
    } catch (error) {
      console.error('Error joining game:', error)
      throw error
    }
  }, [roomCode, supabase])

  const subscribeToGameUpdates = useCallback((gameId: string) => {
    // Unsubscribe from previous channels
    if (gameChannelRef.current) {
      gameChannelRef.current.unsubscribe()
    }
    if (playersChannelRef.current) {
      playersChannelRef.current.unsubscribe()
    }

    // Subscribe to game_sessions updates
    const gameChannel = supabase
      .channel(`game_session:${gameId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'game_sessions',
          filter: `id=eq.${gameId}`
        },
        (payload) => {
          console.log('Game session updated:', payload.new)
          const updated = payload.new as BackendGameSession

    setCurrentGame((prev) => {
      if (!prev) return prev
            
            console.log('Realtime update - prev.quizId:', prev.quizId);
            console.log('Realtime update - updated.quiz_id:', updated.quiz_id);

      return {
        ...prev,
              quizId: prev.quizId || updated.quiz_id, // Preserve or set quizId from backend
              status: updated.status === 'waiting' ? 'waiting' : 
                      updated.status === 'in_progress' ? 'question' : 'finished',
              currentQuestionIndex: updated.current_question_index,
              questionStartTime: updated.question_started_at ? 
                new Date(updated.question_started_at).getTime() : null
            }
          })
        }
      )
      .subscribe()

    gameChannelRef.current = gameChannel

    // Subscribe to player_sessions inserts/updates
    const playersChannel = supabase
      .channel(`players:${gameId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'player_sessions',
          filter: `game_session_id=eq.${gameId}`
        },
        async () => {
          // Reload all players
          const { data: playersData } = await supabase
            .from('player_sessions')
            .select('*')
            .eq('game_session_id', gameId)
            .order('joined_at', { ascending: true })

          if (playersData) {
            setCurrentGame((prev) => {
              if (!prev) return prev
              return {
                ...prev,
                players: playersData.map(p => ({
                  id: p.id,
                  name: p.player_name,
                  score: p.total_score,
                  answers: []
                }))
              }
            })
          }
        }
      )
      .subscribe()

    playersChannelRef.current = playersChannel
  }, [supabase])

  const submitAnswer = useCallback(async (
    playerId: string, 
    questionId: string, 
    answer: number, 
    timeToAnswer: number
  ): Promise<void> => {
    try {
      const request: SubmitAnswerRequest = {
        player_session_id: playerId,
        question_id: questionId,
        answer_index: answer,
        time_taken: timeToAnswer
      }

      const response = await callEdgeFunction<SubmitAnswerRequest, SubmitAnswerResponse>(
        'submit-answer',
        request
      )

      // Update local player score
      setCurrentGame((prev) => {
        if (!prev) return prev

        return {
          ...prev,
          players: prev.players.map((player) => {
            if (player.id !== playerId) return player

            const playerAnswer: PlayerAnswer = {
              questionId,
              selectedAnswer: answer,
              timeToAnswer,
              isCorrect: response.is_correct,
            }

            return {
              ...player,
              score: response.new_total_score,
              answers: [...player.answers, playerAnswer],
            }
          }),
        }
      })
    } catch (error) {
      console.error('Error submitting answer:', error)
      throw error
    }
  }, [])

  const nextQuestion = useCallback(async () => {
    try {
      if (!gameSessionId) return

      const nextIndex = (currentGame?.currentQuestionIndex || 0) + 1
      const quiz = getCurrentQuiz()

      if (!quiz) return

      if (nextIndex >= quiz.questions.length) {
        // End game
        await supabase
          .from('game_sessions')
          .update({ 
            status: 'completed',
            ended_at: new Date().toISOString()
          })
          .eq('id', gameSessionId)

        setCurrentGame((prev) => prev ? { ...prev, status: 'finished' } : null)
      } else {
        // Move to next question
        await supabase
          .from('game_sessions')
          .update({ 
            current_question_index: nextIndex,
            status: 'in_progress',
            question_started_at: new Date().toISOString()
          })
          .eq('id', gameSessionId)

        // Local update will be handled by realtime subscription
      }
    } catch (error) {
      console.error('Error moving to next question:', error)
    }
  }, [gameSessionId, currentGame, supabase])

  const endGame = useCallback(() => {
    // Unsubscribe from channels
    if (gameChannelRef.current) {
      gameChannelRef.current.unsubscribe()
      gameChannelRef.current = null
    }
    if (playersChannelRef.current) {
      playersChannelRef.current.unsubscribe()
      playersChannelRef.current = null
    }

    setCurrentGame(null)
    setCurrentQuiz(null)
    setGameSessionId(null)
    setRoomCode(null)
  }, [])

  const getCurrentQuiz = useCallback(() => {
    return currentQuiz
  }, [currentQuiz])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (gameChannelRef.current) {
        gameChannelRef.current.unsubscribe()
      }
      if (playersChannelRef.current) {
        playersChannelRef.current.unsubscribe()
      }
    }
  }, [])

  return (
    <QuizContext.Provider
      value={{
        currentQuiz,
        currentGame,
        setCurrentQuiz,
        setCurrentGame,
        createQuizOnBackend,
        startGame,
        joinGame,
        submitAnswer,
        nextQuestion,
        endGame,
        getCurrentQuiz,
        findGameByRoomCode,
        gameSessionId,
        roomCode
      }}
    >
      {children}
    </QuizContext.Provider>
  )
}

export function useQuiz() {
  const context = useContext(QuizContext)
  if (context === undefined) {
    throw new Error("useQuiz must be used within a QuizProvider")
  }
  return context
}

// Type exports for game session
export interface GameSession {
  id: string
  quiz_id: string
  room_code: string
  status: string
  current_question_index: number
  quizzes?: BackendQuiz
}
