// Prize distribution percentages
export const TREASURY_FEE_PCT = 10n
export const FIRST_PLACE_PCT = 40n
export const SECOND_PLACE_PCT = 30n
export const THIRD_PLACE_PCT = 20n

// Point calculation constants
export const BASE_POINTS = 100
export const TIME_BONUS_MULTIPLIER = 1.5

// Game status constants
export const GAME_STATUS = {
  WAITING: 'waiting',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed'
} as const

export const QUIZ_STATUS = {
  PENDING: 'pending',
  ACTIVE: 'active',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled'
} as const

// Contract ABI for HootQuizManager
export const HOOT_QUIZ_MANAGER_ABI = [
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "quizId",
        "type": "string"
      },
      {
        "internalType": "address[4]",
        "name": "winners",
        "type": "address[4]"
      },
      {
        "internalType": "uint256[4]",
        "name": "amounts",
        "type": "uint256[4]"
      }
    ],
    "name": "distributePrize",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  }
]

export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

