import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useSupabase } from '../contexts/SupabaseContext'
import { useGame } from '../contexts/GameContext'
import { useWallet } from '../contexts/WalletContext'

const Results: React.FC = () => {
  const { roomCode } = useParams<{ roomCode: string }>()
  const navigate = useNavigate()
  const { supabase } = useSupabase()
  const { isCreator } = useGame()
  const { account } = useWallet()
  
  const [players, setPlayers] = useState<any[]>([])
  const [gameSession, setGameSession] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!roomCode) return

    const fetchResults = async () => {
      try {
        // Get game session
        const { data: session, error: sessionError } = await supabase
          .from('game_sessions')
          .select(`
            id,
            status,
            ended_at,
            quizzes (
              id,
              title,
              prize_amount,
              prize_token,
              contract_tx_hash
            )
          `)
          .eq('room_code', roomCode)
          .single()

        if (sessionError) throw sessionError
        setGameSession(session)

        // Get players with scores
        const { data: playersData, error: playersError } = await supabase
          .from('player_sessions')
          .select('id, player_name, wallet_address, total_score, joined_at')
          .eq('game_session_id', session.id)
          .order('total_score', { ascending: false })

        if (playersError) throw playersError
        setPlayers(playersData || [])
        setIsLoading(false)
      } catch (error) {
        console.error('Error fetching results:', error)
        alert('Failed to load results')
        navigate('/')
      }
    }

    fetchResults()
  }, [roomCode, supabase, navigate])

  const endGame = async () => {
    console.log('🎯 EndGame called from Results - gameSession:', gameSession)
    console.log('🎯 EndGame called from Results - account:', account)
    console.log('🎯 EndGame called from Results - isCreator:', isCreator)
    
    if (!gameSession) {
      console.error('❌ No game session found')
      alert('Game session not found. Please refresh the page.')
      return
    }
    
    if (!gameSession.id) {
      console.error('❌ Game session ID is missing')
      console.error('❌ Full gameSession object:', gameSession)
      alert('Game session ID is missing. Please refresh the page.')
      return
    }

    console.log('🎯 Ending game - Account:', account)
    console.log('🎯 Game Session ID:', gameSession.id)
    console.log('🎯 Is Creator:', isCreator)

    if (!account) {
      console.error('❌ No wallet account found')
      alert('Wallet not connected. Please connect your wallet to end the game.')
      return
    }

    // Double-check creator authorization
    if (!isCreator) {
      console.error('❌ Unauthorized: Only the quiz creator can end the game')
      alert('Unauthorized: Only the quiz creator can end the game.')
      return
    }

    try {
      const requestBody = {
        game_session_id: gameSession.id,
        creator_wallet_address: account
      }
      
      console.log('📤 Sending complete-game request:', requestBody)
      
      // Call the complete-game edge function with creator authorization
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/complete-game`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
        },
        body: JSON.stringify(requestBody)
      })

      const result = await response.json()
      console.log('📥 Complete-game response:', result)

      if (result.success) {
        alert('Game completed and prizes distributed successfully!')
        // Refresh results to show updated status
        window.location.reload()
      } else {
        throw new Error(result.error || 'Failed to end game')
      }
    } catch (error) {
      console.error('Error ending game:', error)
      alert('Failed to end game')
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading results...</p>
        </div>
      </div>
    )
  }

  const topPlayers = players.slice(0, 3)
  const prizeAmount = gameSession?.quizzes?.prize_amount || 0

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="container mx-auto px-4 max-w-4xl">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              Quiz Results
            </h1>
            <p className="text-gray-600 mb-4">
              {gameSession?.quizzes?.title}
            </p>
            <div className="bg-blue-100 text-blue-800 px-4 py-2 rounded-lg inline-block">
              Room Code: {roomCode}
            </div>
          </div>

          {/* Prize Pool Info */}
          <div className="bg-gradient-to-r from-yellow-50 to-orange-50 border border-yellow-200 rounded-lg p-6 mb-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Prize Pool</h2>
            <div className="grid md:grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-yellow-600">🥇 1st Place</div>
                <div className="text-lg font-semibold">{(prizeAmount * 0.4).toFixed(3)} ETH</div>
                <div className="text-sm text-gray-600">40% of pool</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-gray-500">🥈 2nd Place</div>
                <div className="text-lg font-semibold">{(prizeAmount * 0.3).toFixed(3)} ETH</div>
                <div className="text-sm text-gray-600">30% of pool</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-orange-600">🥉 3rd Place</div>
                <div className="text-lg font-semibold">{(prizeAmount * 0.2).toFixed(3)} ETH</div>
                <div className="text-sm text-gray-600">20% of pool</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-purple-600">🏛️ Treasury</div>
                <div className="text-lg font-semibold">{(prizeAmount * 0.1).toFixed(3)} ETH</div>
                <div className="text-sm text-gray-600">10% of pool</div>
              </div>
            </div>
          </div>

          {/* Leaderboard */}
          <div className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Final Leaderboard</h2>
            <div className="space-y-3">
              {players.map((player, index) => (
                <div 
                  key={player.id} 
                  className={`flex items-center justify-between p-4 rounded-lg ${
                    index === 0 ? 'bg-yellow-50 border-2 border-yellow-300' :
                    index === 1 ? 'bg-gray-50 border-2 border-gray-300' :
                    index === 2 ? 'bg-orange-50 border-2 border-orange-300' :
                    'bg-gray-50 border border-gray-200'
                  }`}
                >
                  <div className="flex items-center">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold mr-4 ${
                      index === 0 ? 'bg-yellow-400 text-yellow-900' :
                      index === 1 ? 'bg-gray-400 text-gray-900' :
                      index === 2 ? 'bg-orange-400 text-orange-900' :
                      'bg-gray-200 text-gray-700'
                    }`}>
                      {index + 1}
                    </div>
                    <div>
                      <div className="font-semibold text-gray-900">{player.player_name}</div>
                      {player.wallet_address && (
                        <div className="text-sm text-gray-500 font-mono">
                          {player.wallet_address.slice(0, 6)}...{player.wallet_address.slice(-4)}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold text-gray-900">{player.total_score}</div>
                    <div className="text-sm text-gray-500">points</div>
                    {index < 3 && (
                      <div className="text-sm font-semibold text-green-600 mt-1">
                        Prize: {(prizeAmount * [0.4, 0.3, 0.2][index]).toFixed(3)} ETH
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-center space-x-4">
            <button
              onClick={() => navigate('/')}
              className="px-6 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
            >
              Home
            </button>
            
            {isCreator && !gameSession?.quizzes?.contract_tx_hash && (
              <button
                onClick={endGame}
                disabled={!gameSession?.id}
                className="px-6 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white rounded-md"
              >
                End Game & Distribute Prizes
              </button>
            )}

            {gameSession?.quizzes?.contract_tx_hash && (
              <div className="text-center">
                <p className="text-green-600 font-semibold">✅ Prizes Distributed!</p>
                <p className="text-sm text-gray-500">
                  Transaction: {gameSession.quizzes.contract_tx_hash}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default Results
