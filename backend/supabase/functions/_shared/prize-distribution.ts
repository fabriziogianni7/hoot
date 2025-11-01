import { getPrizePercentages } from './game-logic.ts'

export interface PrizeDistribution {
  totalPrize: bigint
  treasuryFee: bigint
  distributedPrize: bigint
  winners: string[]
  amounts: bigint[]
  prizeBreakdown: bigint[]
}

/**
 * Calculate prize distribution with dynamic winner count and token decimals
 */
export function calculatePrizeDistribution(
  prizeAmount: number,
  winners: string[],
  decimals: number,
  treasuryFeePercent: bigint,
  feePrecision: bigint
): PrizeDistribution {
  // Convert prize amount to token's native units
  const totalPrize = BigInt(Math.floor(prizeAmount * Math.pow(10, decimals)))

  // Calculate treasury fee
  const treasuryFee = (totalPrize * treasuryFeePercent) / feePrecision

  // Amount to distribute among winners
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
 * Calculate progressive question prize distribution
 */
export function calculateQuestionPrizeDistribution(
  totalPrizeAmount: number,
  totalQuestions: number,
  winners: string[],
  decimals: number,
  treasuryFeePercent: bigint,
  feePrecision: bigint
) {
  // Prize per question
  const questionPrize = BigInt(Math.floor((totalPrizeAmount / totalQuestions) * Math.pow(10, decimals)))

  // Progressive distribution ratios (40/30/20/10)
  const firstPlaceRatio = 400000n  // 40%
  const secondPlaceRatio = 300000n // 30%
  const thirdPlaceRatio = 200000n  // 20%
  const treasuryRatio = 100000n    // 10%

  const amounts: bigint[] = []

  if (winners.length >= 1) {
    amounts.push((questionPrize * firstPlaceRatio) / feePrecision)
  }
  if (winners.length >= 2) {
    amounts.push((questionPrize * secondPlaceRatio) / feePrecision)
  }
  if (winners.length >= 3) {
    amounts.push((questionPrize * thirdPlaceRatio) / feePrecision)
  }

  const treasuryAmount = (questionPrize * treasuryRatio) / feePrecision

  return {
    questionPrize,
    amounts,
    treasuryAmount
  }
}