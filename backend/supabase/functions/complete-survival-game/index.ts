import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { ethers } from 'https://esm.sh/ethers@6'
import { handleCorsPreFlight } from '../_shared/cors.ts'
import { successResponse, errorResponse } from '../_shared/response.ts'
import { validateRequired, compareAddresses } from '../_shared/validation.ts'
import { initSupabaseClient } from '../_shared/supabase.ts'
import {
  HOOT_SURVIVAL_QUIZ_MANAGER_ABI,
  ERC20_ABI,
  ZERO_ADDRESS,
  GAME_STATUS,
  QUIZ_STATUS
} from '../_shared/constants.ts'
import { fetchGameSession, fetchPlayerSessions, fetchQuestions, validateGameCompletion, markGameAsCompleted, updateQuizWithTransaction } from '../_shared/database.ts'
import { verifyCreatorAuthorization } from '../_shared/auth.ts'
import { getTokenDecimals, getTreasuryFeeSettings, executeContractTransaction } from '../_shared/blockchain.ts'
import { calculateTopPlayers } from '../_shared/game-logic.ts'
import { calculatePrizeDistribution } from '../_shared/prize-distribution.ts'
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
        prize_token,
        contract_address,
        creator_address,
        status,
        mode
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

async function identifySurvivors(
  supabase: ReturnType<typeof initSupabaseClient>,
  playerSessions: PlayerSession[],
  questionIds: string[]
): Promise<{ survivors: string[], eliminated: string[] }> {
  const survivors: string[] = []
  const eliminated: string[] = []

  for (const playerSession of playerSessions) {
    if (!playerSession.wallet_address) {
      // Skip players without wallet addresses
      continue
    }

    let allCorrect = true

    for (const questionId of questionIds) {
      const { data: answer, error } = await supabase
        .from('answers')
        .select('is_correct')
        .eq('player_session_id', playerSession.id)
        .eq('question_id', questionId)
        .single()

      if (error || !answer || !answer.is_correct) {
        allCorrect = false
        break
      }
    }

    if (allCorrect) {
      survivors.push(playerSession.wallet_address)
    } else {
      eliminated.push(playerSession.wallet_address)
    }
  }

  return { survivors, eliminated }
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

interface PrizeDistribution {
  totalPrize: bigint
  treasuryFee: bigint
  distributedPrize: bigint
  survivors: string[]
  amounts: bigint[]
  prizeBreakdown: bigint[]
}

/**
 * Get token decimals from contract or return 18 for ETH
 */
async function getTokenDecimals(
  prizeToken: string | null,
  rpcUrl: string
): Promise<number> {
  // ETH uses 18 decimals
  if (!prizeToken || prizeToken === ZERO_ADDRESS) {
    return 18
  }

  try {
    const provider = new ethers.JsonRpcProvider(rpcUrl)
    const tokenContract = new ethers.Contract(prizeToken, ERC20_ABI, provider)
    const decimals = await tokenContract.decimals()
    return Number(decimals)
  } catch (error) {
    console.warn('Failed to get token decimals, defaulting to 18:', error)
    return 18
  }
}

/**
 * Get treasury fee settings from contract
 */
async function getTreasuryFeeSettings(
  contractAddress: string,
  rpcUrl: string
): Promise<{ feePercent: bigint; feePrecision: bigint }> {
  try {
    const provider = new ethers.JsonRpcProvider(rpcUrl)
    const contract = new ethers.Contract(contractAddress, HOOT_SURVIVAL_QUIZ_MANAGER_ABI, provider)

    const feePercent = await contract.getTreasuryFeePercent()
    const feePrecision = await contract.getFeePrecision()

    return {
      feePercent: BigInt(feePercent.toString()),
      feePrecision: BigInt(feePrecision.toString())
    }
  } catch (error) {
    console.warn('Failed to get treasury fee settings from contract, using defaults:', error)
    // Default: 10% with precision of 1000000 (4 decimals)
    return {
      feePercent: 100000n,
      feePrecision: 1000000n
    }
  }
}

/**
 * Calculate survival prize distribution
 * Prize is split equally among survivors
 */
function calculatePrizeDistribution(
  prizeAmount: number,
  survivors: string[],
  decimals: number,
  treasuryFeePercent: bigint,
  feePrecision: bigint
): PrizeDistribution {
  // Convert prize amount to token's native units
  const totalPrize = BigInt(Math.floor(prizeAmount * Math.pow(10, decimals)))

  // Calculate treasury fee
  const treasuryFee = (totalPrize * treasuryFeePercent) / feePrecision

  // Amount to distribute among survivors
  const distributedPrize = totalPrize - treasuryFee

  // Calculate prize per survivor
  const amounts: bigint[] = []
  const prizeBreakdown: bigint[] = []

  if (survivors.length > 0) {
    const prizePerSurvivor = distributedPrize / BigInt(survivors.length)

    for (let i = 0; i < survivors.length; i++) {
      amounts.push(prizePerSurvivor)
      prizeBreakdown.push(prizePerSurvivor)
    }

    // Handle rounding - add remainder to first survivor
    const totalCalculated = prizePerSurvivor * BigInt(survivors.length)
    if (totalCalculated < distributedPrize) {
      amounts[0] += (distributedPrize - totalCalculated)
      prizeBreakdown[0] += (distributedPrize - totalCalculated)
    }
  }

  return {
    totalPrize,
    treasuryFee,
    distributedPrize,
    survivors,
    amounts,
    prizeBreakdown
  }
}

async function distributePrizesOnChain(
  contractAddress: string,
  quizId: string,
  survivors: string[]
): Promise<string> {
  const privateKey = Deno.env.get('PRIZE_DISTRIBUTOR_PRIVATE_KEY')
  const rpcUrl = Deno.env.get('RPC_URL') || 'http://localhost:8545'

  if (!privateKey) {
    throw new Error('PRIZE_DISTRIBUTOR_PRIVATE_KEY environment variable is required')
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl)
  const wallet = new ethers.Wallet(privateKey, provider)
  const contract = new ethers.Contract(contractAddress, HOOT_SURVIVAL_QUIZ_MANAGER_ABI, wallet)

  // Set survivors
  await contract.setSurvivors(quizId, survivors)

  // Call distributePrize
  const tx = await contract.distributePrize(quizId)

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
    console.log('?? complete-survival-game function called')
    const supabase = initSupabaseClient(req, true)
    const requestBody = await req.json()
    console.log('?? Request body:', JSON.stringify(requestBody, null, 2))

    const { game_session_id, creator_wallet_address }: CompleteGameRequest = requestBody

    // Validate required fields
    console.log('?? Validating required fields...')
    const validationError = validateRequired({ game_session_id, creator_wallet_address })
    if (validationError) {
      console.error('? Validation error:', validationError)
      return errorResponse(validationError, 400)
    }
    console.log('? Validation passed')

    // Fetch game session with quiz details
    console.log('?? Fetching game session:', game_session_id)
    const gameSession = await fetchGameSession(supabase, game_session_id)
    if (!gameSession) {
      console.error('? Game session not found')
      return errorResponse('Game session not found', 404)
    }
    console.log('? Game session found:', {
      id: gameSession.id,
      quiz_id: gameSession.quiz_id,
      status: gameSession.status,
      quiz_title: gameSession.quizzes?.title,
      prize_amount: gameSession.quizzes?.prize_amount,
      contract_address: gameSession.quizzes?.contract_address,
      creator_address: gameSession.quizzes?.creator_address,
      mode: gameSession.quizzes?.mode
    })

    // Verify this is a survival quiz
    if (gameSession.quizzes?.mode !== 'survival') {
      console.error('? Not a survival quiz')
      return errorResponse('This function is only for survival quizzes', 400)
    }

    // Verify creator authorization
    console.log('?? Verifying creator authorization...')
    console.log('Creator from DB:', gameSession.quizzes?.creator_address)
    console.log('Creator from request:', creator_wallet_address)
    const authError = verifyCreatorAuthorization(gameSession, creator_wallet_address)
    if (authError) {
      console.error('? Authorization error:', authError)
      return errorResponse(authError, 403)
    }
    console.log('? Creator authorized')

    // Check if prizes have already been distributed
    const prizesAlreadyDistributed = gameSession.quizzes?.status === QUIZ_STATUS.COMPLETED ||
                                      gameSession.quizzes?.contract_tx_hash
    if (prizesAlreadyDistributed) {
      console.log('?? Prizes already distributed')
      console.log('Quiz status:', gameSession.quizzes?.status)
      console.log('Contract tx hash:', gameSession.quizzes?.contract_tx_hash)
      return successResponse({
        success: true,
        message: 'Prizes already distributed',
        contract_tx_hash: gameSession.quizzes?.contract_tx_hash
      })
    }

    // Fetch questions and players
    console.log('?? Fetching questions for quiz:', gameSession.quiz_id)
    const questions = await fetchQuestions(supabase, gameSession.quiz_id)
    console.log('? Questions fetched:', questions.length)

    console.log('?? Fetching player sessions...')
    const playerSessions = await fetchPlayerSessions(supabase, game_session_id)
    console.log('? Player sessions fetched:', playerSessions.length)
    console.log('Players:', playerSessions.map(p => ({
      id: p.id,
      name: p.player_name,
      wallet: p.wallet_address,
      score: p.total_score
    })))

    // Validate all players have completed
    console.log('?? Validating game completion...')
    const allCompleted = await validateGameCompletion(supabase, playerSessions, questions.length)
    if (!allCompleted) {
      console.error('? Not all players have completed the game')
      return errorResponse('Not all players have completed the game', 400)
    }
    console.log('? All players completed')

    // Identify survivors
    console.log('?? Identifying survivors...')
    const questionIds = questions.map(q => q.id)
    const { survivors, eliminated } = await identifySurvivors(supabase, playerSessions, questionIds)
    console.log('? Survivors identified:')
    console.log('Survivors:', survivors)
    console.log('Eliminated:', eliminated)
    console.log('Survival rate:', survivors.length, '/', survivors.length + eliminated.length)

    // Mark game as completed (if not already)
    if (gameSession.status !== GAME_STATUS.COMPLETED) {
      console.log('?? Marking game as completed...')
      await markGameAsCompleted(supabase, game_session_id)
      console.log('? Game marked as completed')
    } else {
      console.log('?? Game already marked as completed, skipping update')
    }

    // Handle prize distribution
    let prizeDistributed = false
    let txHash: string | undefined
    const contractAddress = gameSession.quizzes?.contract_address
    const prizeAmount = gameSession.quizzes?.prize_amount || 0
    const prizeToken = gameSession.quizzes?.prize_token || null

    console.log('?? Prize distribution check:')
    console.log('Contract address:', contractAddress)
    console.log('Prize amount:', prizeAmount)
    console.log('Prize token:', prizeToken || 'ETH')
    console.log('Number of survivors:', survivors.length)

    if (contractAddress && prizeAmount > 0) {
      console.log('?? Starting prize distribution...')

      const rpcUrl = Deno.env.get('RPC_URL') || 'http://localhost:8545'

      // Get token decimals
      console.log('?? Getting token decimals...')
      const decimals = await getTokenDecimals(prizeToken, rpcUrl)
      console.log('? Token decimals:', decimals)

      // Get treasury fee settings from contract
      console.log('?? Getting treasury fee settings from contract...')
      const { feePercent, feePrecision } = await getTreasuryFeeSettings(contractAddress, rpcUrl)
      console.log('? Treasury fee settings:')
      console.log('Fee percent:', feePercent.toString())
      console.log('Fee precision:', feePrecision.toString())
      console.log('Effective fee rate:', Number(feePercent) / Number(feePrecision) * 100, '%')

      // Calculate prize distribution with survival logic
      const distribution = calculatePrizeDistribution(
        prizeAmount,
        survivors,
        decimals,
        feePercent,
        feePrecision
      )
      console.log('?? Prize distribution calculated:')
      console.log('Total prize:', distribution.totalPrize.toString())
      console.log('Treasury fee:', distribution.treasuryFee.toString())
      console.log('Distributed to survivors:', distribution.distributedPrize.toString())
      console.log('Number of survivors:', distribution.survivors.length)
      console.log('Survivors array:', distribution.survivors)
      console.log('Amounts array:', distribution.amounts.map(a => a.toString()))
      console.log('Prize breakdown:')
      distribution.prizeBreakdown.forEach((prize, i) => {
        console.log(`  Survivor ${i + 1}: ${prize.toString()}`)
      })

      console.log('?? Calling smart contract...')
      console.log('Contract address:', contractAddress)
      console.log('Quiz ID:', gameSession.quiz_id)

      txHash = await distributePrizesOnChain(contractAddress, gameSession.quiz_id, survivors)
      console.log('? Transaction successful! Hash:', txHash)

      console.log('?? Updating quiz with transaction...')
      await updateQuizWithTransaction(supabase, gameSession.quiz_id, txHash)
      console.log('? Quiz updated')

      prizeDistributed = true
    } else {
      console.log('?? Skipping prize distribution (no contract or no prize)')
    }

    const responseData = {
      success: true,
      message: 'Survival game completed successfully',
      survivors,
      eliminated,
      survival_count: survivors.length,
      eliminated_count: eliminated.length,
      contract_address: contractAddress,
      prize_distributed: prizeDistributed,
      ...(txHash && { contract_tx_hash: txHash })
    }
    console.log('?? Sending success response:', JSON.stringify(responseData, null, 2))
    return successResponse(responseData)

  } catch (error) {
    console.error('? Error completing survival game:', error)
    console.error('Error stack:', error.stack)
    return errorResponse(error.message || 'Internal server error', 500)
  }
})