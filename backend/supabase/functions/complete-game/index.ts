import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { ethers } from 'https://esm.sh/ethers@6'
import { handleCorsPreFlight } from '../_shared/cors.ts'
import { successResponse, errorResponse } from '../_shared/response.ts'
import { validateRequired } from '../_shared/validation.ts'
import { initSupabaseClient } from '../_shared/supabase.ts'
import {
  HOOT_QUIZ_MANAGER_ABI,
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


interface PrizeDistribution {
  totalPrize: bigint
  treasuryFee: bigint
  distributedPrize: bigint
  winners: string[]
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
    const contract = new ethers.Contract(contractAddress, HOOT_QUIZ_MANAGER_ABI, provider)
    
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
 * Calculate prize distribution with dynamic winner count and token decimals
 * Treasury fee is handled on-chain, so we only calculate winner prizes
 */
function calculatePrizeDistribution(
  prizeAmount: number,
  winners: string[],
  decimals: number,
  treasuryFeePercent: bigint,
  feePrecision: bigint
): PrizeDistribution {
  // Convert prize amount to token's native units (e.g., 18 decimals for ETH, 6 for USDC)
  const totalPrize = BigInt(Math.floor(prizeAmount * Math.pow(10, decimals)))
  
  // Calculate treasury fee (same as contract does)
  const treasuryFee = (totalPrize * treasuryFeePercent) / feePrecision
  
  // Amount to distribute among winners (excluding treasury)
  const distributedPrize = totalPrize - treasuryFee
  
  // Prize percentages based on number of winners
  const percentages = getPrizePercentages(winners.length)
  
  // Calculate individual prizes
  const amounts: bigint[] = []
  const prizeBreakdown: bigint[] = []
  
  for (let i = 0; i < winners.length; i++) {
    const amount = (distributedPrize * percentages[i]) / 100n
    amounts.push(amount)
    prizeBreakdown.push(amount)
  }

  return {
    totalPrize,
    treasuryFee,
    distributedPrize,
    winners,
    amounts,
    prizeBreakdown
  }
}

/**
 * Get prize distribution percentages based on number of winners
 * Returns array of percentages that sum to 100
 */
function getPrizePercentages(winnerCount: number): bigint[] {
  switch (winnerCount) {
    case 1:
      return [100n]
    case 2:
      return [60n, 40n]
    case 3:
      return [50n, 30n, 20n]
    case 4:
      return [40n, 30n, 20n, 10n]
    case 5:
      return [35n, 25n, 20n, 12n, 8n]
    default: {
      // Shouldn't happen, but fallback to equal distribution
      const equal = 100n / BigInt(winnerCount)
      return Array(winnerCount).fill(equal)
    }
  }
}

async function distributePrizesOnChain(
  contractAddress: string,
  quizId: string,
  distribution: any
): Promise<string> {
  const privateKey = Deno.env.get('PRIZE_DISTRIBUTOR_PRIVATE_KEY')
  const rpcUrl = Deno.env.get('RPC_URL') || 'http://localhost:8545'

  return await executeContractTransaction(
    contractAddress,
    HOOT_QUIZ_MANAGER_ABI,
    'distributePrize',
    [quizId, distribution.winners, distribution.amounts],
    privateKey,
    rpcUrl
  )
}


serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCorsPreFlight()
  }

  try {
    console.log('?? complete-game function called')
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
      creator_address: gameSession.quizzes?.creator_address
    })

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

    // Mark game as completed (if not already)
    if (gameSession.status !== GAME_STATUS.COMPLETED) {
      console.log('?? Marking game as completed...')
      await markGameAsCompleted(supabase, game_session_id)
      console.log('? Game marked as completed')
    } else {
      console.log('?? Game already marked as completed, skipping update')
    }

    // Calculate top players (up to 5 winners)
    console.log('?? Calculating top players...')
    const { winners, scores } = calculateTopPlayers(playerSessions, gameSession.quizzes!.creator_address, 5)
    console.log('? Top players calculated:')
    console.log('Winners:', winners)
    console.log('Scores:', scores)

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

      // Calculate prize distribution
      const distribution = calculatePrizeDistribution(
        prizeAmount,
        winners,
        decimals,
        feePercent,
        feePrecision
      )
      console.log('?? Prize distribution calculated:')
      console.log('Total prize:', distribution.totalPrize.toString())
      console.log('Treasury fee:', distribution.treasuryFee.toString())
      console.log('Distributed to winners:', distribution.distributedPrize.toString())
      console.log('Number of winners:', distribution.winners.length)
      console.log('Winners array:', distribution.winners)
      console.log('Amounts array:', distribution.amounts.map(a => a.toString()))
      console.log('Prize breakdown:')
      distribution.prizeBreakdown.forEach((prize, i) => {
        console.log(`  Place ${i + 1}: ${prize.toString()}`)
      })
      
      console.log('?? Calling smart contract...')
      console.log('Contract address:', contractAddress)
      console.log('Quiz ID:', gameSession.quiz_id)
      
      txHash = await distributePrizesOnChain(contractAddress, gameSession.quiz_id, distribution)
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
      message: 'Game completed successfully',
      winners,
      scores,
      contract_address: contractAddress,
      prize_distributed: prizeDistributed,
      ...(txHash && { contract_tx_hash: txHash })
    }
    console.log('?? Sending success response:', JSON.stringify(responseData, null, 2))
    return successResponse(responseData)

  } catch (error) {
    console.error('? Error completing game:', error)
    console.error('Error stack:', error.stack)
    return errorResponse(error.message || 'Internal server error', 500)
  }
})
