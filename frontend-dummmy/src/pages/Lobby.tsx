import React, { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useSupabase } from '../contexts/SupabaseContext'
import { useGame } from '../contexts/GameContext'
import { useWallet } from '../contexts/WalletContext'

const Lobby: React.FC = () => {
  const { roomCode } = useParams<{ roomCode: string }>()
  const navigate = useNavigate()
  const { supabase } = useSupabase()
  const { playerSessionId, isCreator, channel, setChannel, setPlayerSessionId, setGameSessionId, setPlayerName, setIsCreator } = useGame()
  const { account } = useWallet()
  
  const [gameSession, setGameSession] = useState<Record<string, unknown> | null>(null)
  const [players, setPlayers] = useState<Record<string, unknown>[]>([])
  const [onlinePlayers, setOnlinePlayers] = useState<Record<string, unknown>[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isWaitingForWallet, setIsWaitingForWallet] = useState(false)
  const [wasReconnected, setWasReconnected] = useState(false)

  // Debug gameSession changes
  useEffect(() => {
    console.log('🎮 GameSession state changed:', gameSession)
    if (gameSession) {
      console.log('🎮 GameSession ID:', gameSession.id)
      console.log('🎮 GameSession status:', gameSession.status)
    }
  }, [gameSession])

  // Fetch game session details
  const fetchGameSession = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('game_sessions')
        .select(`
          id,
          status,
          current_question_index,
          started_at,
          quizzes (
            id,
            title,
            description,
            prize_amount,
            prize_token
          )
        `)
        .eq('room_code', roomCode)
        .single()

      if (error) throw error
      console.log('🎮 Fetched game session:', data)
      console.log('🎮 Game session ID:', data?.id)
      setGameSession(data)
      return data
    } catch (error) {
      console.error('Error fetching game session:', error)
      alert('Game session not found')
      navigate('/')
      return null
    }
  }, [supabase, roomCode, navigate])

  // Generate unique player name
  const generateUniquePlayerName = () => {
    const adjectives = ['Swift', 'Bright', 'Bold', 'Quick', 'Smart', 'Sharp', 'Fast', 'Wise', 'Cool', 'Epic']
    const nouns = ['Player', 'Gamer', 'Champion', 'Hero', 'Master', 'Pro', 'Ace', 'Star', 'Legend', 'Winner']
    
    const randomAdjective = adjectives[Math.floor(Math.random() * adjectives.length)]
    const randomNoun = nouns[Math.floor(Math.random() * nouns.length)]
    const randomNumber = Math.floor(Math.random() * 1000)
    const timestamp = Date.now().toString().slice(-4) // Last 4 digits of timestamp
    
    return `${randomAdjective}${randomNoun}${randomNumber}${timestamp}`
  }

  // Auto-join quiz when accessing lobby directly
  const autoJoinQuiz = useCallback(async () => {
    if (!roomCode) return
    
    if (!account) {
      console.log('⏳ Waiting for wallet connection...')
      setIsWaitingForWallet(true)
      return
    }
    
    setIsWaitingForWallet(false)

    try {
      console.log('🎮 Auto-joining quiz for room:', roomCode)
      
      // Try to join with retry mechanism for name conflicts
      let playerName = generateUniquePlayerName()
      let attempts = 0
      const maxAttempts = 5
      
      while (attempts < maxAttempts) {
        console.log(`🎮 Attempt ${attempts + 1}: Generated player name:`, playerName)
        
        const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/join-game`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
          },
          body: JSON.stringify({
            room_code: roomCode,
            player_name: playerName,
            wallet_address: account
          })
        })

        const result = await response.json()
        
        if (result.success) {
          console.log('✅ Auto-joined quiz successfully')
          console.log('🎯 Is creator:', result.is_creator)
          console.log('🎮 Player session ID:', result.player_session_id)
          console.log('🎮 Player name:', result.player_name)
          
          if (result.message && result.message.includes('Reconnected')) {
            console.log('🔄 Reconnected to existing player session')
            // Use the existing player name from the database
            setPlayerName(result.player_name)
            setWasReconnected(true)
            
            // Hide the reconnection notification after 5 seconds
            setTimeout(() => {
              setWasReconnected(false)
            }, 5000)
          } else {
            console.log('🆕 Created new player session')
            // Use the generated player name for new sessions
            setPlayerName(playerName)
            setWasReconnected(false)
          }
          
          // Update game context with the join results
          setPlayerSessionId(result.player_session_id)
          setGameSessionId(result.game_session_id)
          setIsCreator(result.is_creator || false)
          
          // Now fetch the game session details
          fetchGameSession()
          return // Success, exit the function
        } else if (result.error && result.error.includes('Player name already taken')) {
          console.log(`⚠️ Name conflict with "${playerName}", trying again...`)
          playerName = generateUniquePlayerName()
          attempts++
        } else {
          console.error('❌ Failed to auto-join quiz:', result.error)
          alert(`Failed to join quiz: ${result.error}`)
          navigate('/')
          return
        }
      }
      
      // If we get here, all attempts failed
      console.error('❌ Failed to join after', maxAttempts, 'attempts')
      alert('Failed to join quiz: Unable to find a unique player name')
      navigate('/')
    } catch (error) {
      console.error('❌ Error auto-joining quiz:', error)
      alert('Failed to join quiz')
      navigate('/')
    }
  }, [roomCode, account, setPlayerSessionId, setGameSessionId, setPlayerName, setIsCreator, fetchGameSession, navigate])

  // Handle wallet connection for auto-join
  useEffect(() => {
    if (!roomCode || !account) return
    
    // If no player session exists and wallet is connected, auto-join the quiz
    if (!playerSessionId) {
      autoJoinQuiz()
    }
  }, [account, roomCode, playerSessionId, autoJoinQuiz])

  useEffect(() => {
    if (!roomCode) return

    // If no player session exists, wait for wallet connection
    if (!playerSessionId) {
      return
    }


    const fetchPlayers = async (gameSessionId: string) => {
      try {
        const { data, error } = await supabase
          .from('player_sessions')
          .select('id, player_name, wallet_address, total_score, joined_at')
          .eq('game_session_id', gameSessionId)
          .order('joined_at', { ascending: true })

        if (error) throw error
        setPlayers(data || [])
      } catch (error) {
        console.error('Error fetching players:', error)
      }
    }

    // Setup realtime channel
    const setupRealtimeChannel = async () => {
      const session = await fetchGameSession()
      if (!session) return

      setIsLoading(false)
      await fetchPlayers(session.id)

      console.log('🎮 Setting up realtime channel for room:', roomCode)
      console.log('👤 Player session ID:', playerSessionId)
      console.log('🎯 Is creator:', isCreator)
      console.log('🔗 Supabase client:', supabase)

      // Check if Supabase client is properly initialized
      if (!supabase) {
        console.error('❌ Supabase client not initialized')
        return
      }

      // Create realtime channel using room code directly
      const channelName = `game:${roomCode}`
      console.log('📡 Creating channel with name:', channelName)
      
      const realtimeChannel = supabase.channel(channelName, {
        config: { presence: { key: playerSessionId } }
      })

      console.log('📡 Channel created:', roomCode)

      // Presence tracking
      realtimeChannel
        .on('presence', { event: 'sync' }, () => {
          const presenceState = realtimeChannel.presenceState()
          const onlineUsers = Object.values(presenceState).flat()
          console.log('🟢 Presence sync in room', roomCode, ':', onlineUsers)
          setOnlinePlayers(onlineUsers)
        })
        .on('presence', { event: 'join' }, ({ key, newPresences }) => {
          console.log('🟢 Player joined room', roomCode, '- Key:', key, 'Data:', newPresences)
        })
        .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
          console.log('🔴 Player left room', roomCode, '- Key:', key, 'Data:', leftPresences)
        })

      // Broadcast events for game control
      realtimeChannel
        .on('broadcast', { event: 'game:start' }, (payload) => {
          console.log('Game started by creator:', payload)
          navigate(`/play/${roomCode}`)
        })
        .on('broadcast', { event: 'game:end' }, (payload) => {
          console.log('Game ended by creator:', payload)
          navigate(`/results/${roomCode}`)
        })

      // Database changes for players
      realtimeChannel
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'player_sessions',
          filter: `game_session_id=eq.${session.id}`
        }, () => {
          fetchPlayers(session.id)
        })
        .on('postgres_changes', {
          event: 'UPDATE',
          schema: 'public',
          table: 'game_sessions',
          filter: `room_code=eq.${roomCode}`
        }, async (payload) => {
          console.log('Game session updated:', payload)
          console.log('🎮 Refetching full game session data...')
          // Refetch the full game session data to ensure we have all relations
          const updatedSession = await fetchGameSession()
          if (updatedSession) {
            console.log('🎮 Updated gameSession with full data:', updatedSession)
          }
        })

      // Subscribe to channel with a small delay to ensure proper setup
      setTimeout(() => {
        console.log('🔄 Subscribing to channel:', channelName)
        realtimeChannel.subscribe(async (status) => {
        console.log('📡 Channel subscription status for room', roomCode, ':', status)
        
        if (status === 'SUBSCRIBED') {
          console.log('✅ Successfully subscribed to room', roomCode)
          
          try {
            // Get player name from database
            const { data: playerData } = await supabase
              .from('player_sessions')
              .select('player_name')
              .eq('id', playerSessionId)
              .single()

            // Track presence
            const presenceData = {
              player_session_id: playerSessionId,
              player_name: playerData?.player_name || 'Player',
              is_creator: isCreator,
              joined_at: new Date().toISOString()
            }
            console.log('📡 Tracking presence in room', roomCode, ':', presenceData)
            await realtimeChannel.track(presenceData)
            console.log('✅ Presence tracked successfully for room', roomCode)
          } catch (error) {
            console.error('❌ Error tracking presence:', error)
          }
        } else if (status === 'CHANNEL_ERROR') {
          console.error('❌ Channel error for room', roomCode, '- attempting to reconnect...')
          // Attempt to reconnect after a short delay
          setTimeout(() => {
            console.log('🔄 Attempting to reconnect to room', roomCode)
            realtimeChannel.subscribe()
          }, 2000)
        } else if (status === 'TIMED_OUT') {
          console.error('⏰ Channel timeout for room', roomCode, '- attempting to reconnect...')
          setTimeout(() => {
            console.log('🔄 Attempting to reconnect to room', roomCode)
            realtimeChannel.subscribe()
          }, 2000)
        } else if (status === 'CLOSED') {
          console.log('🔒 Channel closed for room', roomCode)
        }
        })
      }, 100) // Small delay to ensure channel is properly set up

      setChannel(realtimeChannel)
    }

    setupRealtimeChannel()

    return () => {
      if (channel) {
        channel.unsubscribe()
        setChannel(null)
      }
    }
  }, [roomCode, playerSessionId, isCreator, supabase, navigate, channel, setChannel, fetchGameSession])

  const startGame = async () => {
    if (!gameSession?.id || !channel) return

    try {
      // Update database
      const { error } = await supabase
        .from('game_sessions')
        .update({ 
          status: 'in_progress',
          started_at: new Date().toISOString()
        })
        .eq('id', gameSession.id)

      if (error) throw error

      // Broadcast to all players
      await channel.send({
        type: 'broadcast',
        event: 'game:start',
        payload: { started_by: playerSessionId }
      })

      // Navigate creator to game
      navigate(`/play/${roomCode}`)
    } catch (error) {
      console.error('Error starting game:', error)
      alert('Failed to start game')
    }
  }


  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading game session...</p>
        </div>
      </div>
    )
  }

  if (isWaitingForWallet) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-pulse rounded-full h-12 w-12 border-2 border-orange-500 mx-auto mb-4"></div>
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Connect Your Wallet</h1>
          <p className="text-gray-600 mb-4">Please connect your wallet to join the quiz</p>
          <p className="text-sm text-gray-500">Room Code: <span className="font-mono bg-gray-100 px-2 py-1 rounded">{roomCode}</span></p>
        </div>
      </div>
    )
  }

  if (!gameSession) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Game Not Found</h1>
          <p className="text-gray-600 mb-4">The room code you entered doesn't exist</p>
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

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      {/* Reconnection notification */}
      {wasReconnected && (
        <div className="container mx-auto px-4 max-w-4xl mb-4">
          <div className="bg-blue-100 border border-blue-400 text-blue-700 px-4 py-3 rounded">
            <div className="flex items-center">
              <span className="mr-2">🔄</span>
              <span className="font-semibold">Welcome back!</span>
              <span className="ml-2">You've been reconnected to your existing player session.</span>
            </div>
          </div>
        </div>
      )}
      
      <div className="container mx-auto px-4 max-w-4xl">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {(gameSession.quizzes as any)?.title}
            </h1>
            <p className="text-gray-600 mb-4">
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {(gameSession.quizzes as any)?.description}
            </p>
            <div className="bg-blue-100 text-blue-800 px-4 py-2 rounded-lg inline-block">
              Room Code: {roomCode}
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            <div>
              <h2 className="text-xl font-semibold text-gray-900 mb-4">
                Players ({players.length}) - Online: {onlinePlayers.length}
              </h2>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {players.map((player, index) => {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const isOnline = onlinePlayers.some(online => (online as any).player_session_id === (player as any).id)
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const playerWalletAddress = (player as any).wallet_address?.toLowerCase()
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const quizCreatorAddress = (gameSession.quizzes as any)?.creator_address?.toLowerCase()
                  const isPlayerCreator = playerWalletAddress === quizCreatorAddress
                  return (
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    <div key={(player as any).id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center">
                        <div className="w-8 h-8 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center font-bold mr-3">
                          {index + 1}
                        </div>
                        <div className="flex items-center">
                          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                          <span className="font-medium">{(player as any).player_name}</span>
                          {isPlayerCreator && (
                            <span className="ml-2 bg-yellow-100 text-yellow-800 text-xs px-2 py-1 rounded-full">
                              Creator
                            </span>
                          )}
                          {isOnline && (
                            <div className="ml-2 w-2 h-2 bg-green-500 rounded-full" title="Online"></div>
                          )}
                        </div>
                      </div>
                      <span className="text-sm text-gray-500">
                        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                        {new Date((player as any).joined_at).toLocaleTimeString()}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>

            <div>
              <h2 className="text-xl font-semibold text-gray-900 mb-4">
                Game Info
              </h2>
              <div className="space-y-4">
                <div className="p-4 bg-green-50 rounded-lg">
                  <h3 className="font-semibold text-green-800">Prize Pool</h3>
                  <p className="text-green-600">
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    {(gameSession.quizzes as any)?.prize_amount} ETH
                  </p>
                </div>
                
                <div className="p-4 bg-yellow-50 rounded-lg">
                  <h3 className="font-semibold text-yellow-800">Distribution</h3>
                  <p className="text-yellow-600">
                    Treasury: 10% • 1st: 40% • 2nd: 30% • 3rd: 20%
                  </p>
                </div>

                <div className="p-4 bg-blue-50 rounded-lg">
                  <h3 className="font-semibold text-blue-800">Status</h3>
                  <p className="text-blue-600 capitalize">
                    {(gameSession.status as string).replace('_', ' ')}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-8 text-center space-y-4">
            {(gameSession.status as string) === 'waiting' && (
              <>
                {isCreator ? (
                  <>
                    <button
                      onClick={startGame}
                      disabled={players.length === 0}
                      className="bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-bold py-3 px-8 rounded-lg"
                    >
                      Start Game
                    </button>
                    <div className="text-sm text-gray-600">
                      Share this room code with players: <span className="font-mono bg-gray-100 px-2 py-1 rounded">{roomCode}</span>
                    </div>
                  </>
                ) : (
                  <div className="space-y-4">
                    <div className="text-lg text-gray-700">
                      Waiting for creator to start the game...
                    </div>
                    <div className="text-sm text-gray-600">
                      Room Code: <span className="font-mono bg-gray-100 px-2 py-1 rounded">{roomCode}</span>
                    </div>
                  </div>
                )}
                <div className="text-xs text-gray-500">
                  <button
                    onClick={() => navigate('/join')}
                    className="text-blue-600 hover:text-blue-700 underline"
                  >
                    Join as Player (for testing)
                  </button>
                </div>
              </>
            )}
            
            {(gameSession.status as string) === 'in_progress' && (
              <div className="space-y-4">
                <button
                  onClick={() => navigate(`/play/${roomCode}`)}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-8 rounded-lg"
                >
                  Continue Game
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default Lobby
