"use client"

import { createContext, useContext, useState, useCallback, type ReactNode, useEffect } from "react"
import type { Quiz, GameState, PlayerAnswer } from "./types"

interface QuizContextType {
  quizzes: Quiz[]
  currentGame: GameState | null
  addQuiz: (quiz: Quiz) => void
  startGame: (quizId: string) => void
  joinGame: (playerName: string) => string
  submitAnswer: (playerId: string, questionId: string, answer: number, timeToAnswer: number) => void
  nextQuestion: () => void
  endGame: () => void
  getCurrentQuiz: () => Quiz | undefined
  getQuizById: (id: string) => Quiz | undefined
}

const QuizContext = createContext<QuizContextType | undefined>(undefined)

// Funzioni di utilità per il localStorage
const saveQuizzesToLocalStorage = (quizzes: Quiz[]) => {
  try {
    // Converti le date in stringhe prima di salvare
    const quizzesForStorage = quizzes.map(quiz => ({
      ...quiz,
      createdAt: quiz.createdAt.toISOString()
    }));
    localStorage.setItem('quizzes', JSON.stringify(quizzesForStorage));
  } catch (error) {
    console.error('Errore nel salvataggio dei quiz:', error);
  }
};

const loadQuizzesFromLocalStorage = (): Quiz[] => {
  try {
    const storedQuizzes = localStorage.getItem('quizzes');
    if (!storedQuizzes) return [];
    
    // Converti le stringhe di date in oggetti Date
    return JSON.parse(storedQuizzes).map((quiz: any) => ({
      ...quiz,
      createdAt: new Date(quiz.createdAt)
    }));
  } catch (error) {
    console.error('Errore nel caricamento dei quiz:', error);
    return [];
  }
};

const saveGameToLocalStorage = (game: GameState | null) => {
  try {
    localStorage.setItem('currentGame', game ? JSON.stringify(game) : 'null');
  } catch (error) {
    console.error('Errore nel salvataggio del gioco:', error);
  }
};

const loadGameFromLocalStorage = (): GameState | null => {
  try {
    const storedGame = localStorage.getItem('currentGame');
    if (!storedGame || storedGame === 'null') return null;
    return JSON.parse(storedGame);
  } catch (error) {
    console.error('Errore nel caricamento del gioco:', error);
    return null;
  }
};

export function QuizProvider({ children }: { children: ReactNode }) {
  const [quizzes, setQuizzes] = useState<Quiz[]>([])
  const [currentGame, setCurrentGame] = useState<GameState | null>(null)
  
  // Carica i quiz e il gioco corrente dal localStorage all'avvio
  useEffect(() => {
    const loadedQuizzes = loadQuizzesFromLocalStorage();
    const loadedGame = loadGameFromLocalStorage();
    
    setQuizzes(loadedQuizzes);
    setCurrentGame(loadedGame);
    
    // Log per debug
    console.log('Quiz caricati:', loadedQuizzes);
  }, []);

  // Salva i quiz nel localStorage quando cambiano
  useEffect(() => {
    if (quizzes.length > 0) {
      saveQuizzesToLocalStorage(quizzes);
      console.log('Quiz salvati:', quizzes);
    }
  }, [quizzes]);

  // Salva il gioco corrente nel localStorage quando cambia
  useEffect(() => {
    saveGameToLocalStorage(currentGame);
    console.log('Game state salvato:', currentGame);
  }, [currentGame]);

  const addQuiz = useCallback((quiz: Quiz) => {
    setQuizzes((prev) => {
      // Controlla se esiste già un quiz con lo stesso ID
      const existingQuizIndex = prev.findIndex(q => q.id === quiz.id);
      
      if (existingQuizIndex >= 0) {
        // Aggiorna il quiz esistente
        const updatedQuizzes = [...prev];
        updatedQuizzes[existingQuizIndex] = quiz;
        return updatedQuizzes;
      } else {
        // Aggiungi un nuovo quiz
        return [...prev, quiz];
      }
    });
  }, [])

  const startGame = useCallback((quizId: string) => {
    console.log('Starting game with quiz ID:', quizId);
    
    // Prima verifica che il quiz esista
    const quiz = quizzes.find(q => q.id === quizId);
    if (!quiz) {
      console.error('Quiz non trovato con ID:', quizId);
      return;
    }
    
    // Inizializza il gioco con la prima domanda (indice 0)
    setCurrentGame({
      quizId,
      status: "waiting",
      currentQuestionIndex: 0, // Assicurati che questo sia 0
      players: [],
      startTime: Date.now(),
      questionStartTime: null,
    });
    
    console.log('Game state inizializzato con indice domanda 0');
  }, [quizzes])

  const joinGame = useCallback((playerName: string): string => {
    const playerId = `player-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

    setCurrentGame((prev) => {
      if (!prev) return prev

      return {
        ...prev,
        players: [
          ...prev.players,
          {
            id: playerId,
            name: playerName,
            score: 0,
            answers: [],
          },
        ],
      }
    })

    return playerId
  }, [])

  const submitAnswer = useCallback(
    (playerId: string, questionId: string, answer: number, timeToAnswer: number) => {
      setCurrentGame((prev) => {
        if (!prev) return prev

        const quiz = quizzes.find((q) => q.id === prev.quizId)
        if (!quiz) return prev

        const question = quiz.questions.find((q) => q.id === questionId)
        if (!question) return prev

        const isCorrect = question.correctAnswer === answer
        const basePoints = 1000
        const timeBonus = answer >= 0 ? Math.max(0, basePoints * (1 - timeToAnswer / (question.timeLimit * 1000))) : 0
        const points = isCorrect ? Math.round(basePoints + timeBonus) : 0

        return {
          ...prev,
          players: prev.players.map((player) => {
            if (player.id !== playerId) return player

            const playerAnswer: PlayerAnswer = {
              questionId,
              selectedAnswer: answer,
              timeToAnswer,
              isCorrect,
            }

            return {
              ...player,
              score: player.score + points,
              answers: [...player.answers, playerAnswer],
            }
          }),
        }
      })
    },
    [quizzes],
  )

  const nextQuestion = useCallback(() => {
    setCurrentGame((prev) => {
      if (!prev) return prev

      const quiz = quizzes.find((q) => q.id === prev.quizId)
      if (!quiz) return prev

      const nextIndex = prev.currentQuestionIndex + 1
      console.log('Moving to next question index:', nextIndex);

      if (nextIndex >= quiz.questions.length) {
        console.log('Quiz completed, showing results');
        return {
          ...prev,
          status: "finished",
          questionStartTime: null,
        }
      }

      console.log('Setting next question index to:', nextIndex);
      return {
        ...prev,
        status: "question",
        currentQuestionIndex: nextIndex,
        questionStartTime: Date.now(),
      }
    })
  }, [quizzes])

  const endGame = useCallback(() => {
    setCurrentGame(null)
  }, [])

  const getCurrentQuiz = useCallback(() => {
    if (!currentGame) return undefined
    const quiz = quizzes.find((q) => q.id === currentGame.quizId)
    console.log('Getting current quiz:', quiz?.id, 'for game:', currentGame.quizId);
    return quiz;
  }, [currentGame, quizzes])
  
  const getQuizById = useCallback((id: string) => {
    return quizzes.find((q) => q.id === id)
  }, [quizzes])

  return (
    <QuizContext.Provider
      value={{
        quizzes,
        currentGame,
        addQuiz,
        startGame,
        joinGame,
        submitAnswer,
        nextQuestion,
        endGame,
        getCurrentQuiz,
        getQuizById
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