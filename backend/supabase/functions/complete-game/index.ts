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
    console.log('🎯 complete-game function called')
    const supabase = initSupabaseClient(true)
    const requestBody = await req.json()
    console.log('📥 Request body:', JSON.stringify(requestBody, null, 2))
    
    const { game_session_id, creator_wallet_address }: CompleteGameRequest = requestBody

    // Validate required fields
    console.log('🔍 Validating required fields...')
    const validationError = validateRequired({ game_session_id, creator_wallet_address })
    if (validationError) {
      console.error('❌ Validation error:', validationError)
      return errorResponse(validationError, 400)
    }
    console.log('✅ Validation passed')

    // Fetch game session with quiz details
    console.log('🔍 Fetching game session:', game_session_id)
    const gameSession = await fetchGameSession(supabase, game_session_id)
    if (!gameSession) {
      console.error('❌ Game session not found')
      return errorResponse('Game session not found', 404)
    }
    console.log('✅ Game session found:', {
      id: gameSession.id,
      quiz_id: gameSession.quiz_id,
      status: gameSession.status,
      quiz_title: gameSession.quizzes?.title,
      prize_amount: gameSession.quizzes?.prize_amount,
      contract_address: gameSession.quizzes?.contract_address,
      creator_address: gameSession.quizzes?.creator_address
    })

    // Verify creator authorization
    console.log('🔍 Verifying creator authorization...')
    console.log('Creator from DB:', gameSession.quizzes?.creator_address)
    console.log('Creator from request:', creator_wallet_address)
    const authError = verifyCreatorAuthorization(gameSession, creator_wallet_address)
    if (authError) {
      console.error('❌ Authorization error:', authError)
      return errorResponse(authError, 403)
    }
    console.log('✅ Creator authorized')

    // Check if prizes have already been distributed
    const prizesAlreadyDistributed = gameSession.quizzes?.status === QUIZ_STATUS.COMPLETED || 
                                      gameSession.quizzes?.contract_tx_hash
    if (prizesAlreadyDistributed) {
      console.log('⚠️ Prizes already distributed')
      console.log('Quiz status:', gameSession.quizzes?.status)
      console.log('Contract tx hash:', gameSession.quizzes?.contract_tx_hash)
      return successResponse({ 
        success: true, 
        message: 'Prizes already distributed',
        contract_tx_hash: gameSession.quizzes?.contract_tx_hash
      })
    }

    // Fetch questions and players
    console.log('🔍 Fetching questions for quiz:', gameSession.quiz_id)
    const questions = await fetchQuestions(supabase, gameSession.quiz_id)
    console.log('✅ Questions fetched:', questions.length)
    
    console.log('🔍 Fetching player sessions...')
    const playerSessions = await fetchPlayerSessions(supabase, game_session_id)
    console.log('✅ Player sessions fetched:', playerSessions.length)
    console.log('Players:', playerSessions.map(p => ({
      id: p.id,
      name: p.player_name,
      wallet: p.wallet_address,
      score: p.total_score
    })))

    // Validate all players have completed
    console.log('🔍 Validating game completion...')
    const allCompleted = await validateGameCompletion(supabase, playerSessions, questions.length)
    if (!allCompleted) {
      console.error('❌ Not all players have completed the game')
      return errorResponse('Not all players have completed the game', 400)
    }
    console.log('✅ All players completed')

    // Mark game as completed (if not already)
    if (gameSession.status !== GAME_STATUS.COMPLETED) {
      console.log('🔍 Marking game as completed...')
      await markGameAsCompleted(supabase, game_session_id)
      console.log('✅ Game marked as completed')
    } else {
      console.log('⚠️ Game already marked as completed, skipping update')
    }

    // Calculate top players
    console.log('🔍 Calculating top players...')
    const { winners, scores } = calculateTopPlayers(playerSessions, gameSession.quizzes!.creator_address)
    console.log('✅ Top players calculated:')
    console.log('Winners:', winners)
    console.log('Scores:', scores)

    // Handle prize distribution
    let prizeDistributed = false
    const contractAddress = gameSession.quizzes?.contract_address
    const prizeAmount = gameSession.quizzes?.prize_amount || 0

    console.log('🔍 Prize distribution check:')
    console.log('Contract address:', contractAddress)
    console.log('Prize amount:', prizeAmount)

    if (contractAddress && prizeAmount > 0) {
      console.log('💰 Starting prize distribution...')
      
      const treasuryAddress = Deno.env.get('TREASURY_ADDRESS')
      console.log('Treasury address from env:', treasuryAddress)
      
      if (!treasuryAddress) {
        console.error('❌ TREASURY_ADDRESS environment variable is missing')
        throw new Error('TREASURY_ADDRESS environment variable is required')
      }

      const distribution = calculatePrizeDistribution(prizeAmount, winners, treasuryAddress)
      console.log('💰 Prize distribution calculated:')
      console.log('Total prize:', distribution.totalPrize.toString())
      console.log('First place:', distribution.firstPlacePrize.toString())
      console.log('Second place:', distribution.secondPlacePrize.toString())
      console.log('Third place:', distribution.thirdPlacePrize.toString())
      console.log('Treasury fee:', distribution.treasuryFee.toString())
      console.log('Winners array:', distribution.winners4)
      console.log('Amounts array:', distribution.amounts4.map(a => a.toString()))
      
      console.log('🔍 Calling smart contract...')
      console.log('Contract address:', contractAddress)
      console.log('Quiz ID:', gameSession.quiz_id)
      
      const txHash = await distributePrizesOnChain(contractAddress, gameSession.quiz_id, distribution)
      console.log('✅ Transaction successful! Hash:', txHash)
      
      console.log('🔍 Updating quiz with transaction...')
      await updateQuizWithTransaction(supabase, gameSession.quiz_id, txHash)
      console.log('✅ Quiz updated')
      
      prizeDistributed = true
    } else {
      console.log('⚠️ Skipping prize distribution (no contract or no prize)')
    }

    const responseData = {
      success: true,
      message: 'Game completed successfully',
      winners: winners.slice(0, 3),
      scores: scores.slice(0, 3),
      contract_address: contractAddress,
      prize_distributed: prizeDistributed
    }
    console.log('📤 Sending success response:', JSON.stringify(responseData, null, 2))
    return successResponse(responseData)

  } catch (error) {
    console.error('❌ Error completing game:', error)
    console.error('Error stack:', error.stack)
    return errorResponse(error.message || 'Internal server error', 500)
  }
})
