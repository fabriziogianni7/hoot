import { BASE_POINTS, TIME_BONUS_MULTIPLIER } from './constants.ts'
import type { PlayerSession } from './types.ts'

/**
 * Calculate points for an answer based on correctness and time taken
 */
export function calculatePoints(
  isCorrect: boolean,
  timeTakenMs: number,
  timeLimitSeconds: number
): number {
  if (!isCorrect) {
    return 0
  }

  const timeLimitMs = timeLimitSeconds * 1000
  const remainingTimeSeconds = Math.max(0, timeLimitMs - timeTakenMs) / 1000
  const timeBonus = remainingTimeSeconds * TIME_BONUS_MULTIPLIER

  return Math.floor(BASE_POINTS + timeBonus)
}

/**
 * Calculate top players based on scores
 */
export function calculateTopPlayers(
  playerSessions: PlayerSession[],
  maxWinners: number = 3
) {
  const topPlayers = playerSessions
    .sort((a, b) => (b.total_score || 0) - (a.total_score || 0))
    .slice(0, maxWinners)

  // Only include players with valid wallet addresses and scores > 0
  const winners = topPlayers
    .filter(p => p.wallet_address && p.total_score && p.total_score > 0)
    .map(p => p.wallet_address!)

  const scores = topPlayers
    .filter(p => p.wallet_address && p.total_score && p.total_score > 0)
    .map(p => p.total_score || 0)

  return { winners, scores }
}

/**
 * Validate answer submission timing
 */
export function validateAnswerSubmission(
  timeTakenMs: number,
  timeLimitSeconds: number
): string | null {
  const timeLimitMs = timeLimitSeconds * 1000

  if (timeTakenMs > timeLimitMs) {
    return 'Answer submitted too late'
  }

  return null
}

/**
 * Get prize distribution percentages based on number of winners
 */
export function getPrizePercentages(winnerCount: number): bigint[] {
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
      // Fallback to equal distribution
      const equal = 100n / BigInt(winnerCount)
      return Array(winnerCount).fill(equal)
    }
  }
}