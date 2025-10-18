import React, { createContext, useContext, useState, type ReactNode } from 'react'
import { RealtimeChannel } from '@supabase/supabase-js'

interface GameContextType {
  playerSessionId: string | null
  gameSessionId: string | null
  roomCode: string | null
  playerName: string | null
  isCreator: boolean
  channel: RealtimeChannel | null
  setPlayerSessionId: (id: string | null) => void
  setGameSessionId: (id: string | null) => void
  setRoomCode: (code: string | null) => void
  setPlayerName: (name: string | null) => void
  setIsCreator: (creator: boolean) => void
  setChannel: (channel: RealtimeChannel | null) => void
  clearGame: () => void
}

const GameContext = createContext<GameContextType | undefined>(undefined)

export const useGame = () => {
  const context = useContext(GameContext)
  if (context === undefined) {
    throw new Error('useGame must be used within a GameProvider')
  }
  return context
}

interface GameProviderProps {
  children: ReactNode
}

export const GameProvider: React.FC<GameProviderProps> = ({ children }) => {
  const [playerSessionId, setPlayerSessionId] = useState<string | null>(null)
  const [gameSessionId, setGameSessionId] = useState<string | null>(null)
  const [roomCode, setRoomCode] = useState<string | null>(null)
  const [playerName, setPlayerName] = useState<string | null>(null)
  const [isCreator, setIsCreator] = useState<boolean>(false)
  const [channel, setChannel] = useState<RealtimeChannel | null>(null)

  const clearGame = () => {
    setPlayerSessionId(null)
    setGameSessionId(null)
    setRoomCode(null)
    setPlayerName(null)
    setIsCreator(false)
    if (channel) {
      channel.unsubscribe()
      setChannel(null)
    }
  }

  return (
    <GameContext.Provider value={{
      playerSessionId,
      gameSessionId,
      roomCode,
      playerName,
      isCreator,
      channel,
      setPlayerSessionId,
      setGameSessionId,
      setRoomCode,
      setPlayerName,
      setIsCreator,
      setChannel,
      clearGame
    }}>
      {children}
    </GameContext.Provider>
  )
}
