import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { ethers } from 'https://esm.sh/ethers@6'
import { handleCorsPreFlight } from '../_shared/cors.ts'
import { successResponse, errorResponse } from '../_shared/response.ts'
import { validateRequired, compareAddresses } from '../_shared/validation.ts'
import { initSupabaseClient } from '../_shared/supabase.ts'
import {
  HOOT_QUIZ_MANAGER_ABI,
  ZERO_ADDRESS,
  TREASURY_FEE_PCT,
  FIRST_PLACE_PCT,
  SECOND_PLACE_PCT,
  THIRD_PLACE_PCT,
  GAME_STATUS,
  QUIZ_STATUS
} from '../_shared/constants.ts'
import type { CompleteGameRequest, GameSession, PlayerSession } from '../_shared/types.ts'

async function fetchGameSession(supabase: ReturnType<typeof initSupabaseClient>, gameSessionId: string): Promise<GameSession | null> {
  const { data, error } = await supabase
    .from('game_sessions')
    .select(`
      *,
      quizzes (
        id,
        title,
        prize_amount,
        contract_address,
        creator_address,
        status
      )
    `)
    .eq('id', gameSessionId)
    .single()

  if (error) return null
  return data
}

function verifyCreatorAuthorization(gameSession: GameSession, creatorWalletAddress: string): string | null {
  if (!gameSession.quizzes?.creator_address) {
    return 'Quiz creator address not found in database'
  }

  if (!compareAddresses(gameSession.quizzes.creator_address, creatorWalletAddress)) {
    return 'Unauthorized: Only the quiz creator can distribute prizes'
  }

  return null
}

async function fetchQuestions(supabase: ReturnType<typeof initSupabaseClient>, quizId: string) {
  const { data, error } = await supabase
    .from('questions')
    .select('id')
    .eq('quiz_id', quizId)

  if (error) throw new Error('Failed to fetch questions')
  return data || []
}

async function fetchPlayerSessions(supabase: ReturnType<typeof initSupabaseClient>, gameSessionId: string): Promise<PlayerSession[]> {
  const { data, error } = await supabase
    .from('player_sessions')
    .select('id, player_name, wallet_address, total_score')
    .eq('game_session_id', gameSessionId)

  if (error) throw new Error('Failed to fetch players')
  return data || []
}

async function validateGameCompletion(
  supabase: ReturnType<typeof initSupabaseClient>,
  playerSessions: PlayerSession[],
  totalQuestions: number
): Promise<boolean> {
  for (const playerSession of playerSessions) {
    const { data: answers, error } = await supabase
      .from('answers')
      .select('question_id')
      .eq('player_session_id', playerSession.id)

    if (error || !answers || answers.length < totalQuestions) {
      return false
    }
  }
  return true
}

async function markGameAsCompleted(supabase: ReturnType<typeof initSupabaseClient>, gameSessionId: string) {
  const { error } = await supabase
    .from('game_sessions')
    .update({
      status: GAME_STATUS.COMPLETED,
      ended_at: new Date().toISOString()
    })
    .eq('id', gameSessionId)

  if (error) throw new Error('Failed to update game session')
}

function calculateTopPlayers(playerSessions: PlayerSession[], creatorAddress: string) {
  const topPlayers = playerSessions
    .sort((a, b) => (b.total_score || 0) - (a.total_score || 0))
    .slice(0, 3)

  const winners = topPlayers.map(p => p.wallet_address || creatorAddress)
  const scores = topPlayers.map(p => p.total_score || 0)

  // Pad to exactly 3 elements with creator address
  while (winners.length < 3) {
    winners.push(creatorAddress)
  }
  while (scores.length < 3) {
    scores.push(0)
  }

  return { winners, scores }
}

interface PrizeDistribution {
  totalPrize: bigint
  firstPlacePrize: bigint
  secondPlacePrize: bigint
  thirdPlacePrize: bigint
  treasuryFee: bigint
  winners4: string[]
  amounts4: bigint[]
}

function calculatePrizeDistribution(
  prizeAmount: number,
  winners: string[],
  treasuryAddress: string
): PrizeDistribution {
  const totalPrize = BigInt(Math.floor(prizeAmount * 1e18))
  const treasuryFee = (totalPrize * TREASURY_FEE_PCT) / 100n
  const firstPlacePrize = (totalPrize * FIRST_PLACE_PCT) / 100n
  const secondPlacePrize = (totalPrize * SECOND_PLACE_PCT) / 100n
  const thirdPlacePrize = (totalPrize * THIRD_PLACE_PCT) / 100n

  const winners4 = [
    winners[0],
    winners[1],
    winners[2],
    treasuryAddress
  ]

  const amounts4 = [
    firstPlacePrize,
    secondPlacePrize,
    thirdPlacePrize,
    treasuryFee
  ]

  return {
    totalPrize,
    firstPlacePrize,
    secondPlacePrize,
    thirdPlacePrize,
    treasuryFee,
    winners4,
    amounts4
  }
}

async function distributePrizesOnChain(
  contractAddress: string,
  quizId: string,
  distribution: PrizeDistribution
): Promise<string> {
  const privateKey = Deno.env.get('PRIZE_DISTRIBUTOR_PRIVATE_KEY')
  const rpcUrl = Deno.env.get('RPC_URL_LOCAL') || 'http://localhost:8545'

  if (!privateKey) {
    throw new Error('PRIZE_DISTRIBUTOR_PRIVATE_KEY environment variable is required')
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl)
  const wallet = new ethers.Wallet(privateKey, provider)
  const contract = new ethers.Contract(contractAddress, HOOT_QUIZ_MANAGER_ABI, wallet)

  const tx = await contract.distributePrize(
    quizId,
    distribution.winners4,
    distribution.amounts4
  )

  const receipt = await tx.wait()

  if (receipt.status !== 1) {
    throw new Error('Transaction failed')
  }

  return tx.hash
}

async function updateQuizWithTransaction(
  supabase: ReturnType<typeof initSupabaseClient>,
  quizId: string,
  txHash: string
) {
  await supabase
    .from('quizzes')
    .update({ 
      status: QUIZ_STATUS.COMPLETED,
      contract_tx_hash: txHash
    })
    .eq('id', quizId)
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCorsPreFlight()
  }

  try {
    const supabase = initSupabaseClient(true)
    const { game_session_id, creator_wallet_address }: CompleteGameRequest = await req.json()

    // Validate required fields
    const validationError = validateRequired({ game_session_id, creator_wallet_address })
    if (validationError) {
      return errorResponse(validationError, 400)
    }

    // Fetch game session with quiz details
    const gameSession = await fetchGameSession(supabase, game_session_id)
    if (!gameSession) {
      return errorResponse('Game session not found', 404)
    }

    // Verify creator authorization
    const authError = verifyCreatorAuthorization(gameSession, creator_wallet_address)
    if (authError) {
      return errorResponse(authError, 403)
    }

    // Check if already completed
    if (gameSession.status === GAME_STATUS.COMPLETED) {
      return successResponse({ message: 'Game already completed' })
    }

    // Fetch questions and players
    const questions = await fetchQuestions(supabase, gameSession.quiz_id)
    const playerSessions = await fetchPlayerSessions(supabase, game_session_id)

    // Validate all players have completed
    const allCompleted = await validateGameCompletion(supabase, playerSessions, questions.length)
    if (!allCompleted) {
      return errorResponse('Not all players have completed the game', 400)
    }

    // Mark game as completed
    await markGameAsCompleted(supabase, game_session_id)

    // Calculate top players
    const { winners, scores } = calculateTopPlayers(playerSessions, gameSession.quizzes!.creator_address)

    // Handle prize distribution
    let prizeDistributed = false
    const contractAddress = gameSession.quizzes?.contract_address
    const prizeAmount = gameSession.quizzes?.prize_amount || 0

    if (contractAddress && prizeAmount > 0) {
      const treasuryAddress = Deno.env.get('TREASURY_ADDRESS')
      if (!treasuryAddress) {
        throw new Error('TREASURY_ADDRESS environment variable is required')
      }

      const distribution = calculatePrizeDistribution(prizeAmount, winners, treasuryAddress)
      const txHash = await distributePrizesOnChain(contractAddress, gameSession.quiz_id, distribution)
      await updateQuizWithTransaction(supabase, gameSession.quiz_id, txHash)
      
      prizeDistributed = true
    }

    return successResponse({
      success: true,
      message: 'Game completed successfully',
      winners: winners.slice(0, 3),
      scores: scores.slice(0, 3),
      contract_address: contractAddress,
      prize_distributed: prizeDistributed
    })

  } catch (error) {
    console.error('Error completing game:', error)
    return errorResponse(error.message || 'Internal server error', 500)
  }
})
