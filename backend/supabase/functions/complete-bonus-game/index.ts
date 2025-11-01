import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { ethers } from 'https://esm.sh/ethers@6'
import { handleCorsPreFlight } from '../_shared/cors.ts'
import { successResponse, errorResponse } from '../_shared/response.ts'
import { validateRequired, compareAddresses } from '../_shared/validation.ts'
import { initSupabaseClient } from '../_shared/supabase.ts'
import {
  HOOT_BONUS_QUIZ_MANAGER_ABI,
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
  extraBountyDistributed: boolean
  extraBountyAmount: bigint
  extraTreasuryAmount: bigint
}

/**
 * Get token decimals from contract or return 18 for ETH
 */


/**
 * Calculate prize distribution with bonus logic
 */
function calculatePrizeDistribution(
  prizeAmount: number,
  extraBountyAmount: number,
  winners: string[],
  goldenQuestionsCorrect: boolean,
  decimals: number,
  treasuryFeePercent: bigint,
  feePrecision: bigint
): PrizeDistribution {
  // Convert amounts to token's native units
  const totalPrize = BigInt(Math.floor(prizeAmount * Math.pow(10, decimals)))
  const extraBounty = BigInt(Math.floor(extraBountyAmount * Math.pow(10, decimals)))

  // Calculate treasury fee for base prize
  const treasuryFee = (totalPrize * treasuryFeePercent) / feePrecision

  // Amount to distribute among winners for base prize
  const distributedPrize = totalPrize - treasuryFee

  // Prize percentages based on number of winners (same as standard quiz)
  const percentages = getPrizePercentages(winners.length)

  // Calculate base prize amounts
  const amounts: bigint[] = []
  const prizeBreakdown: bigint[] = []

  for (let i = 0; i < winners.length; i++) {
    const amount = (distributedPrize * percentages[i]) / 100n
    amounts.push(amount)
    prizeBreakdown.push(amount)
  }

  let extraBountyDistributed = false
  let extraTreasuryAmount = 0n

  if (extraBounty > 0) {
    if (goldenQuestionsCorrect && winners.length > 0) {
      // Split extra bounty equally among winners
      const extraPerWinner = extraBounty / BigInt(winners.length)
      extraBountyDistributed = true

      // Add extra bounty to each winner's amount
      for (let i = 0; i < winners.length; i++) {
        amounts[i] += extraPerWinner
      }
    } else {
      // Send full extra bounty to treasury (no additional fee)
      extraTreasuryAmount = extraBounty
    }
  }

  return {
    totalPrize,
    treasuryFee,
    distributedPrize,
    winners,
    amounts,
    prizeBreakdown,
    extraBountyDistributed,
    extraBountyAmount: extraBounty,
    extraTreasuryAmount
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
  distribution: PrizeDistribution,
  goldenQuestionsCorrect: boolean
): Promise<string> {
  const privateKey = Deno.env.get('PRIZE_DISTRIBUTOR_PRIVATE_KEY')
  const rpcUrl = Deno.env.get('RPC_URL') || 'http://localhost:8545'

  if (!privateKey) {
    throw new Error('PRIZE_DISTRIBUTOR_PRIVATE_KEY environment variable is required')
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl)
  const wallet = new ethers.Wallet(privateKey, provider)
  const contract = new ethers.Contract(contractAddress, HOOT_BONUS_QUIZ_MANAGER_ABI, wallet)

  // Set golden questions result
  await contract.setGoldenQuestionsResult(quizId, goldenQuestionsCorrect)

  // Call distributePrize with winners and amounts arrays
  const tx = await contract.distributePrize(
    quizId,
    distribution.winners,
    distribution.amounts
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
    console.log('?? complete-bonus-game function called')
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

    // Fetch game session with quiz details (including bonus fields)
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
      extra_bounty_amount: gameSession.quizzes?.extra_bounty_amount,
      contract_address: gameSession.quizzes?.contract_address,
      creator_address: gameSession.quizzes?.creator_address,
      mode: gameSession.quizzes?.mode,
      golden_question_ids: gameSession.quizzes?.golden_question_ids
    })

    // Verify this is a bonus quiz
    if (gameSession.quizzes?.mode !== 'bonus') {
      console.error('? Not a bonus quiz')
      return errorResponse('This function is only for bonus quizzes', 400)
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

    // Check golden questions
    console.log('?? Checking golden questions...')
    const goldenQuestionIds = gameSession.quizzes?.golden_question_ids || []
    console.log('Golden question IDs:', goldenQuestionIds)
    const goldenQuestionsCorrect = await checkGoldenQuestionsCorrect(supabase, playerSessions, goldenQuestionIds)
    console.log('? Golden questions correct:', goldenQuestionsCorrect)

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
    const extraBountyAmount = gameSession.quizzes?.extra_bounty_amount || 0
    const prizeToken = gameSession.quizzes?.prize_token || null

    console.log('?? Prize distribution check:')
    console.log('Contract address:', contractAddress)
    console.log('Prize amount:', prizeAmount)
    console.log('Extra bounty amount:', extraBountyAmount)
    console.log('Prize token:', prizeToken || 'ETH')

    if (contractAddress && (prizeAmount > 0 || extraBountyAmount > 0)) {
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

      // Calculate prize distribution with bonus logic
      const distribution = calculatePrizeDistribution(
        prizeAmount,
        extraBountyAmount,
        winners,
        goldenQuestionsCorrect,
        decimals,
        feePercent,
        feePrecision
      )
      console.log('?? Prize distribution calculated:')
      console.log('Total prize:', distribution.totalPrize.toString())
      console.log('Treasury fee:', distribution.treasuryFee.toString())
      console.log('Distributed to winners:', distribution.distributedPrize.toString())
      console.log('Extra bounty distributed:', distribution.extraBountyDistributed)
      console.log('Extra bounty amount:', distribution.extraBountyAmount.toString())
      console.log('Extra treasury amount:', distribution.extraTreasuryAmount.toString())
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

      txHash = await distributePrizesOnChain(contractAddress, gameSession.quiz_id, distribution, goldenQuestionsCorrect)
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
      message: 'Bonus game completed successfully',
      winners,
      scores,
      golden_questions_correct: goldenQuestionsCorrect,
      contract_address: contractAddress,
      prize_distributed: prizeDistributed,
      ...(txHash && { contract_tx_hash: txHash })
    }
    console.log('?? Sending success response:', JSON.stringify(responseData, null, 2))
    return successResponse(responseData)

  } catch (error) {
    console.error('? Error completing bonus game:', error)
    console.error('Error stack:', error.stack)
    return errorResponse(error.message || 'Internal server error', 500)
  }
})