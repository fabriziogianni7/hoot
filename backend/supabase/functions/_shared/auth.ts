import { compareAddresses } from './validation.ts'
import type { GameSession } from './types.ts'

/**
 * Verify that the caller is the quiz creator
 */
export function verifyCreatorAuthorization(gameSession: GameSession, creatorWalletAddress: string): string | null {
  if (!gameSession.quizzes?.creator_address) {
    return 'Quiz creator address not found in database'
  }

  if (!compareAddresses(gameSession.quizzes.creator_address, creatorWalletAddress)) {
    return 'Unauthorized: Only the quiz creator can distribute prizes'
  }

  return null
}

/**
 * Check if a wallet address belongs to the quiz creator
 */
export function isCreator(creatorAddress: string, walletAddress: string): boolean {
  if (!creatorAddress || !walletAddress) return false
  return compareAddresses(creatorAddress, walletAddress)
}

/**
 * Validate game session exists and is in correct state
 */
export function validateGameSession(gameSession: GameSession | null): string | null {
  if (!gameSession) {
    return 'Game session not found'
  }

  // Add more validation logic as needed
  return null
}