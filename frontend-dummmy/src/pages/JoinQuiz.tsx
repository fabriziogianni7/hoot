import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGame } from '../contexts/GameContext'
import { useWallet } from '../contexts/WalletContext'

const JoinQuiz: React.FC = () => {
  const navigate = useNavigate()
  const { setPlayerSessionId, setGameSessionId, setRoomCode, setPlayerName, setIsCreator } = useGame()
  const { account, isConnected, connectWallet } = useWallet()
  const [roomCode, setRoomCodeInput] = useState('')
  const [playerName, setPlayerNameInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!roomCode || !playerName) {
      alert('Please enter both room code and player name')
      return
    }

    setIsLoading(true)

    try {
      // Join game via edge function
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/join-game`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
        },
        body: JSON.stringify({
          room_code: roomCode.toUpperCase(),
          player_name: playerName,
          wallet_address: account || null // Pass actual wallet address if connected
        })
      })

      const result = await response.json()

      if (result.success) {
        console.log('✅ Successfully joined game!')
        console.log('🎮 Room Code:', roomCode.toUpperCase())
        console.log('👤 Player Session ID:', result.player_session_id)
        console.log('🎯 Is Creator:', result.is_creator)
        console.log('👤 Player Name:', playerName)
        
        // Store game data in context
        setPlayerSessionId(result.player_session_id)
        setGameSessionId(result.game_session_id)
        setRoomCode(roomCode.toUpperCase())
        setPlayerName(playerName)
        setIsCreator(result.is_creator || false)
        
        console.log('🚀 Navigating to lobby...')
        navigate(`/lobby/${roomCode.toUpperCase()}`)
      } else {
        throw new Error(result.error || 'Failed to join game')
      }
    } catch (error) {
      console.error('Error joining game:', error)
      alert('Failed to join game. Please check the room code and try again.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="bg-white rounded-lg shadow-lg p-8 w-full max-w-md">
        <h1 className="text-3xl font-bold text-gray-900 mb-8 text-center">Join Quiz</h1>
        
        {/* Wallet Connection Section */}
        <div className="mb-6 p-4 bg-blue-50 rounded-lg">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-medium text-blue-900">Wallet Connection</h3>
              <p className="text-xs text-blue-700">
                {isConnected ? `Connected: ${account?.slice(0, 6)}...${account?.slice(-4)}` : 'Connect wallet to receive prizes'}
              </p>
            </div>
            {!isConnected && (
              <button
                type="button"
                onClick={connectWallet}
                className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-sm"
              >
                Connect
              </button>
            )}
          </div>
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Room Code *
            </label>
            <input
              type="text"
              value={roomCode}
              onChange={(e) => setRoomCodeInput(e.target.value.toUpperCase())}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-center text-lg font-mono"
              placeholder="ABC123"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Player Name *
            </label>
            <input
              type="text"
              value={playerName}
              onChange={(e) => setPlayerNameInput(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter your name"
              required
            />
          </div>

          <div className="flex space-x-4">
            <button
              type="button"
              onClick={() => navigate('/')}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
            >
              Back
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md disabled:opacity-50"
            >
              {isLoading ? 'Joining...' : 'Join Game'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default JoinQuiz
