import { getPrizePercentages } from './game-logic.ts'

export interface PrizeDistribution {
  totalPrize: bigint
  treasuryFee: bigint
  distributedPrize: bigint
  winners: string[]
  amounts: bigint[]
  prizeBreakdown: bigint[]
  extraBountyDistributed?: boolean
  extraBountyAmount?: bigint
  extraTreasuryAmount?: bigint
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
 * Calculate prize distribution for bonus games with extra bounty logic
 */
export function calculateBonusPrizeDistribution(
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
 * Calculate survival mode prize distribution (equal split among survivors)
 */
export function calculateSurvivalPrizeDistribution(
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
    winners: survivors, // survivors are the winners in survival mode
    amounts,
    prizeBreakdown
  }
}

/**
 * Calculate progressive question prize distribution
 */
export function calculateProgressiveModePrizeDistribution(
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