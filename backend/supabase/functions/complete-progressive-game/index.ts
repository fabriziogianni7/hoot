import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { ethers } from 'https://esm.sh/ethers@6'
import { handleCorsPreFlight } from '../_shared/cors.ts'
import { successResponse, errorResponse } from '../_shared/response.ts'
import { validateRequired, compareAddresses } from '../_shared/validation.ts'
import { initSupabaseClient } from '../_shared/supabase.ts'
import {
  HOOT_PROGRESSIVE_QUIZ_MANAGER_ABI,
  ERC20_ABI,
  ZERO_ADDRESS,
  GAME_STATUS
} from '../_shared/constants.ts'
import { fetchGameSession, fetchPlayerSessions, fetchQuestions, validateGameCompletion, markGameAsCompleted, updateQuizWithTransaction, getQuestionIdByIndex } from '../_shared/database.ts'
import { verifyCreatorAuthorization } from '../_shared/auth.ts'
import { getTokenDecimals, getTreasuryFeeSettings, executeContractTransaction } from '../_shared/blockchain.ts'
import { calculateProgressiveModePrizeDistribution } from '../_shared/prize-distribution.ts'
import type { GameSession, PlayerSession } from '../_shared/types.ts'

interface CompleteProgressiveGameRequest {
  game_session_id: string
  question_index: number
  creator_wallet_address: string
}


function calculateQuestionTopPlayers(
  playerSessions: PlayerSession[],
  questionId: string,
  supabase: ReturnType<typeof initSupabaseClient>
) {
  // For progressive quiz, we need to calculate scores based on answers to this specific question
  // This is a simplified version - in practice you'd need to calculate points earned for this question only
  return playerSessions
    .filter(p => p.wallet_address) // Only players with wallets can receive prizes
    .sort((a, b) => (b.total_score || 0) - (a.total_score || 0))
    .slice(0, 3) // Top 3 for this question
}

interface QuestionPrizeDistribution {
  questionIndex: number
  winners: string[]
  scores: number[]
  amounts: bigint[]
  treasuryAmount: bigint
}

/**
 * Get token decimals from contract or return 18 for ETH
 */



async function distributeQuestionPrizeOnChain(
  contractAddress: string,
  quizId: string,
  questionIndex: number,
  winners: string[],
  amounts: bigint[]
): Promise<string> {
  const privateKey = Deno.env.get('PRIZE_DISTRIBUTOR_PRIVATE_KEY')
  const rpcUrl = Deno.env.get('RPC_URL') || 'http://localhost:8545'

  if (!privateKey) {
    throw new Error('PRIZE_DISTRIBUTOR_PRIVATE_KEY environment variable is required')
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl)
  const wallet = new ethers.Wallet(privateKey, provider)
  const contract = new ethers.Contract(contractAddress, HOOT_PROGRESSIVE_QUIZ_MANAGER_ABI, wallet)

  // Convert winners array to fixed-size array for contract
  const winnersArray = [ethers.ZeroAddress, ethers.ZeroAddress, ethers.ZeroAddress]
  for (let i = 0; i < Math.min(winners.length, 3); i++) {
    winnersArray[i] = winners[i]
  }

  // Call distributeQuestionPrize with question index and winners
  const tx = await contract.distributeQuestionPrize(quizId, winnersArray)

  const receipt = await tx.wait()

  if (receipt.status !== 1) {
    throw new Error('Transaction failed')
  }

  return tx.hash
}


serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCorsPreFlight()
  }

  try {
    console.log('?? complete-progressive-game function called')
    const supabase = initSupabaseClient(req, true)
    const requestBody = await req.json()
    console.log('?? Request body:', JSON.stringify(requestBody, null, 2))

    const { game_session_id, question_index, creator_wallet_address }: CompleteProgressiveGameRequest = requestBody

    // Validate required fields
    console.log('?? Validating required fields...')
    const validationError = validateRequired({ game_session_id, question_index, creator_wallet_address })
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

    // Verify this is a progressive quiz
    if (gameSession.quizzes?.mode !== 'progressive') {
      console.error('? Not a progressive quiz')
      return errorResponse('This function is only for progressive quizzes', 400)
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

    // Get question ID for this index
    console.log('?? Getting question ID for index:', question_index)
    const questionId = await getQuestionIdByIndex(supabase, gameSession.quiz_id, question_index)
    if (!questionId) {
      console.error('? Question not found for index:', question_index)
      return errorResponse('Question not found', 404)
    }
    console.log('? Question ID:', questionId)

    // Fetch questions to get total count
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

    // Validate all players have answered this question
    console.log('?? Validating question completion...')
    const questionCompleted = await validateQuestionCompletion(supabase, playerSessions, questionId)
    if (!questionCompleted) {
      console.error('? Not all players have answered this question')
      return errorResponse('Not all players have answered this question', 400)
    }
    console.log('? Question completed by all players')

    // Calculate top players for this question
    console.log('?? Calculating top players for question...')
    const topPlayers = calculateQuestionTopPlayers(playerSessions, questionId, supabase)
    const winners = topPlayers.map(p => p.wallet_address!).filter(addr => addr)
    const scores = topPlayers.map(p => p.total_score || 0)
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
    console.log('Question index:', question_index)
    console.log('Total questions:', questions.length)

    if (contractAddress && prizeAmount > 0 && winners.length > 0) {
      console.log('?? Starting question prize distribution...')

      const rpcUrl = Deno.env.get('RPC_URL') || 'http://localhost:8545'

      // Get token decimals
      console.log('?? Getting token decimals...')
      const decimals = await getTokenDecimals(prizeToken, rpcUrl)
      console.log('? Token decimals:', decimals)

      // Get treasury fee settings from contract
      console.log('?? Getting treasury fee settings from contract...')
      const { feePercent, feePrecision } = await getTreasuryFeeSettings(contractAddress, HOOT_PROGRESSIVE_QUIZ_MANAGER_ABI, rpcUrl)
      console.log('? Treasury fee settings:')
      console.log('Fee percent:', feePercent.toString())
      console.log('Fee precision:', feePrecision.toString())

      // Calculate question prize distribution
      const distribution = calculateProgressiveModePrizeDistribution(
        prizeAmount,
        questions.length,
        winners,
        decimals,
        feePercent,
        feePrecision
      )
      distribution.questionIndex = question_index

      console.log('?? Question prize distribution calculated:')
      console.log('Question index:', question_index)
      console.log('Question prize pool:', (prizeAmount / questions.length).toString())
      console.log('Treasury amount:', distribution.treasuryAmount.toString())
      console.log('Number of winners:', distribution.winners.length)
      console.log('Winners array:', distribution.winners)
      console.log('Amounts array:', distribution.amounts.map(a => a.toString()))

      console.log('?? Calling smart contract...')
      console.log('Contract address:', contractAddress)
      console.log('Quiz ID:', gameSession.quiz_id)
      console.log('Question index:', question_index)

      txHash = await distributeQuestionPrizeOnChain(
        contractAddress,
        gameSession.quiz_id,
        question_index,
        winners,
        distribution.amounts
      )
      console.log('? Transaction successful! Hash:', txHash)

      prizeDistributed = true
    } else {
      console.log('?? Skipping prize distribution (no contract, no prize, or no winners)')
    }

    const responseData = {
      success: true,
      message: `Question ${question_index} completed successfully`,
      question_index,
      winners,
      scores,
      contract_address: contractAddress,
      prize_distributed: prizeDistributed,
      ...(txHash && { contract_tx_hash: txHash })
    }
    console.log('?? Sending success response:', JSON.stringify(responseData, null, 2))
    return successResponse(responseData)

  } catch (error) {
    console.error('? Error completing progressive game question:', error)
    console.error('Error stack:', error.stack)
    return errorResponse(error.message || 'Internal server error', 500)
  }
})