import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { handleCorsPreFlight } from '../_shared/cors.ts'
import { successResponse, errorResponse } from '../_shared/response.ts'
import { validateRequired, compareAddresses } from '../_shared/validation.ts'
import { initSupabaseClient } from '../_shared/supabase.ts'
import { GAME_STATUS } from '../_shared/constants.ts'
import type { JoinGameRequest, GameSession, PlayerSession } from '../_shared/types.ts'

async function fetchGameSession(supabase: ReturnType<typeof initSupabaseClient>, roomCode: string): Promise<GameSession | null> {
  const { data, error } = await supabase
    .from('game_sessions')
    .select(`
      id,
      quiz_id,
      status,
      current_question_index,
      started_at,
      ended_at,
      creator_session_id,
      quizzes (
        id,
        title,
        description,
        prize_amount,
        prize_token,
        creator_address,
        status
      )
    `)
    .eq('room_code', roomCode)
    .single()

  if (error) return null
  return data
}

function validateGameSession(gameSession: GameSession | null): string | null {
  if (!gameSession) {
    return 'Game session not found'
  }
  
  if (gameSession.status !== GAME_STATUS.WAITING) {
    return 'Game is not accepting new players'
  }
  
  return null
}

async function checkExistingPlayerByWallet(
  supabase: ReturnType<typeof initSupabaseClient>, 
  gameSessionId: string, 
  walletAddress: string
): Promise<PlayerSession | null> {
  const { data } = await supabase
    .from('player_sessions')
    .select('id, player_name, total_score, joined_at')
    .eq('game_session_id', gameSessionId)
    .eq('wallet_address', walletAddress)
    .single()

  return data
}

async function checkExistingPlayerByName(
  supabase: ReturnType<typeof initSupabaseClient>, 
  gameSessionId: string, 
  playerName: string
): Promise<PlayerSession | null> {
  const { data } = await supabase
    .from('player_sessions')
    .select('id, player_name, wallet_address, total_score, joined_at')
    .eq('game_session_id', gameSessionId)
    .eq('player_name', playerName)
    .single()

  return data
}

async function createPlayerSession(
  supabase: ReturnType<typeof initSupabaseClient>, 
  gameSessionId: string, 
  playerName: string,
  walletAddress?: string
): Promise<PlayerSession> {
  const { data, error } = await supabase
    .from('player_sessions')
    .insert({
      game_session_id: gameSessionId,
      player_name: playerName,
      wallet_address: walletAddress || null,
      total_score: 0
    })
    .select()
    .single()

  if (error) {
    throw new Error('Failed to join game')
  }

  return data
}

async function updateCreatorSession(
  supabase: ReturnType<typeof initSupabaseClient>, 
  gameSessionId: string,
  playerSessionId: string
) {
  await supabase
    .from('game_sessions')
    .update({ creator_session_id: playerSessionId })
    .eq('id', gameSessionId)
}

async function fetchAllPlayers(
  supabase: ReturnType<typeof initSupabaseClient>, 
  gameSessionId: string
): Promise<PlayerSession[]> {
  const { data } = await supabase
    .from('player_sessions')
    .select('id, player_name, wallet_address, total_score, joined_at')
    .eq('game_session_id', gameSessionId)
    .order('joined_at', { ascending: true })

  return data || []
}

function isCreator(creatorAddress?: string, playerAddress?: string): boolean {
  return compareAddresses(creatorAddress, playerAddress)
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCorsPreFlight()
  }

  try {
    const supabase = initSupabaseClient()
    const { room_code, player_name, wallet_address }: JoinGameRequest = await req.json()

    // Validate required fields
    const validationError = validateRequired({ room_code, player_name })
    if (validationError) {
      return errorResponse(validationError, 400)
    }

    // Fetch game session
    const gameSession = await fetchGameSession(supabase, room_code)
    
    // Validate game session
    const sessionError = validateGameSession(gameSession)
    if (sessionError) {
      return errorResponse(sessionError, gameSession ? 400 : 404)
    }

    // Check for existing player by wallet address first (if provided)
    let existingPlayer: PlayerSession | null = null
    if (wallet_address) {
      existingPlayer = await checkExistingPlayerByWallet(supabase, gameSession!.id, wallet_address)
      
      if (existingPlayer) {
        const playerIsCreator = isCreator(gameSession!.quizzes?.creator_address, wallet_address)
        
        // Fetch all players for the response
        const allPlayers = await fetchAllPlayers(supabase, gameSession!.id)
        
        return successResponse({ 
          success: true,
          player_session_id: existingPlayer.id,
          game_session_id: gameSession!.id,
          player_name: existingPlayer.player_name,
          is_creator: playerIsCreator,
          message: 'Reconnected to existing player session',
          game_session: {
            id: gameSession!.id,
            room_code,
            status: gameSession!.status,
            current_question_index: gameSession!.current_question_index,
            started_at: gameSession!.started_at,
            ended_at: gameSession!.ended_at
          },
          quiz: gameSession!.quizzes,
          players: allPlayers
        })
      }
    }

    // Check for existing player by name (only if no wallet match found)
    const existingPlayerByName = await checkExistingPlayerByName(supabase, gameSession!.id, player_name)
    if (existingPlayerByName) {
      // If someone tries to join with the same name but different wallet
      if (wallet_address && existingPlayerByName.wallet_address && 
          !compareAddresses(existingPlayerByName.wallet_address, wallet_address)) {
        return errorResponse('Player name already taken by a different wallet in this game', 400)
      }
      
      // If someone tries to join with the same name but no wallet (or same wallet)
      // Allow them to reconnect to the existing player
      const playerIsCreator = isCreator(gameSession!.quizzes?.creator_address, wallet_address)
      
      // Fetch all players for the response
      const allPlayers = await fetchAllPlayers(supabase, gameSession!.id)
      
      return successResponse({ 
        success: true,
        player_session_id: existingPlayerByName.id,
        game_session_id: gameSession!.id,
        player_name: existingPlayerByName.player_name,
        is_creator: playerIsCreator,
        message: 'Reconnected to existing player session',
        game_session: {
          id: gameSession!.id,
          room_code,
          status: gameSession!.status,
          current_question_index: gameSession!.current_question_index,
          started_at: gameSession!.started_at,
          ended_at: gameSession!.ended_at
        },
        quiz: gameSession!.quizzes,
        players: allPlayers
      })
    }

    // Create new player session
    const playerSession = await createPlayerSession(supabase, gameSession!.id, player_name, wallet_address)

    // Update creator session if applicable
    const playerIsCreator = isCreator(gameSession!.quizzes?.creator_address, wallet_address)
    if (playerIsCreator && !gameSession!.creator_session_id) {
      await updateCreatorSession(supabase, gameSession!.id, playerSession.id)
    }

    // Fetch all players
    const allPlayers = await fetchAllPlayers(supabase, gameSession!.id)

    return successResponse({ 
      success: true,
      player_session_id: playerSession.id,
      is_creator: playerIsCreator,
      game_session: {
        id: gameSession!.id,
        room_code,
        status: gameSession!.status,
        current_question_index: gameSession!.current_question_index,
        started_at: gameSession!.started_at,
        ended_at: gameSession!.ended_at
      },
      quiz: gameSession!.quizzes,
      players: allPlayers
    })

  } catch (error) {
    console.error('Error in join-game:', error)
    return errorResponse(error.message || 'Internal server error', 500)
  }
})
