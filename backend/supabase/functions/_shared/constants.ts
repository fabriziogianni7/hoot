// Prize distribution percentages
export const TREASURY_FEE_PCT = 10n
export const FIRST_PLACE_PCT = 40n
export const SECOND_PLACE_PCT = 30n
export const THIRD_PLACE_PCT = 20n

// Point calculation constants
export const BASE_POINTS = 100
export const TIME_BONUS_MULTIPLIER = 10.5

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
        "internalType": "address[]",
        "name": "winners",
        "type": "address[]"
      },
      {
        "internalType": "uint256[]",
        "name": "amounts",
        "type": "uint256[]"
      }
    ],
    "name": "distributePrize",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getTreasuryFeePercent",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getFeePrecision",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  }
]

// ERC20 ABI for checking token decimals
export const ERC20_ABI = [
  {
    "inputs": [],
    "name": "decimals",
    "outputs": [
      {
        "internalType": "uint8",
        "name": "",
        "type": "uint8"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  }
]

// Contract ABI for HootBonusQuizManager
export const HOOT_BONUS_QUIZ_MANAGER_ABI = [
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "quizId",
        "type": "string"
      },
      {
        "internalType": "uint256",
        "name": "amount",
        "type": "uint256"
      }
    ],
    "name": "depositExtraBounty",
    "outputs": [],
    "stateMutability": "payable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "quizId",
        "type": "string"
      },
      {
        "internalType": "bool",
        "name": "allCorrect",
        "type": "bool"
      }
    ],
    "name": "setGoldenQuestionsResult",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "quizId",
        "type": "string"
      },
      {
        "internalType": "address[]",
        "name": "winners",
        "type": "address[]"
      },
      {
        "internalType": "uint256[]",
        "name": "amounts",
        "type": "uint256[]"
      }
    ],
    "name": "distributePrize",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getTreasuryFeePercent",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getFeePrecision",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  }
]

// Contract ABI for HootProgressiveQuizManager
export const HOOT_PROGRESSIVE_QUIZ_MANAGER_ABI = [
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "quizId",
        "type": "string"
      },
      {
        "internalType": "address[3]",
        "name": "winners",
        "type": "address[3]"
      }
    ],
    "name": "distributeQuestionPrize",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getTreasuryFeePercent",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getFeePrecision",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  }
]

// Contract ABI for HootSurvivalQuizManager
export const HOOT_SURVIVAL_QUIZ_MANAGER_ABI = [
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "quizId",
        "type": "string"
      },
      {
        "internalType": "address[]",
        "name": "survivors",
        "type": "address[]"
      }
    ],
    "name": "setSurvivors",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "quizId",
        "type": "string"
      }
    ],
    "name": "distributePrize",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getTreasuryFeePercent",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getFeePrecision",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  }
]

export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

