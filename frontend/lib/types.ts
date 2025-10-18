export interface Question {
  id: string
  text: string
  options: string[]
  correctAnswer: number
  timeLimit: number // in seconds
}

export interface Quiz {
  id: string
  title: string
  description: string
  questions: Question[]
  createdAt: Date
}

export interface Player {
  id: string
  name: string
  score: number
  answers: PlayerAnswer[]
}

export interface PlayerAnswer {
  questionId: string
  selectedAnswer: number
  timeToAnswer: number // in milliseconds
  isCorrect: boolean
}

export interface GameState {
  quizId: string
  status: "waiting" | "countdown" | "question" | "results" | "finished"
  currentQuestionIndex: number
  players: Player[]
  startTime: number | null
  questionStartTime: number | null
}

export type GameStatus = GameState["status"]
