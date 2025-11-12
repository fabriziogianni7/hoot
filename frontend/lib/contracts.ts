import { getContractAddress as getEnvContractAddress } from './env-config'

// Legacy contract addresses for reference (kept for backward compatibility)
export const CONTRACT_ADDRESSES = {
  local: "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0",
  baseSepolia: "0x2dC5532610Fe67A185bC9199a2d5975a130ec7f8", 
  base: "0xe210C6Ae4a88327Aad8cd52Cb08cAAa90D8b0f27" // Deployed to Base mainnet
}

// Get contract address based on current network (legacy function)
export const getContractAddress = (network: string = 'local') => {
  return CONTRACT_ADDRESSES[network as keyof typeof CONTRACT_ADDRESSES] || CONTRACT_ADDRESSES.local
}

// Get current contract address from environment configuration
export const getCurrentContractAddress = () => {
  return getEnvContractAddress()
}

// Contract ABI for HootQuizManager
export const HOOT_QUIZ_MANAGER_ABI =  [
  {
    "type": "constructor",
    "inputs": [
      { "name": "_treasury", "type": "address", "internalType": "address" },
      {
        "name": "_treasuryFeePercent",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "_feePrecision",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "cancelQuiz",
    "inputs": [
      { "name": "quizId", "type": "string", "internalType": "string" }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "createQuiz",
    "inputs": [
      { "name": "quizId", "type": "string", "internalType": "string" },
      { "name": "prizeToken", "type": "address", "internalType": "address" },
      { "name": "prizeAmount", "type": "uint256", "internalType": "uint256" }
    ],
    "outputs": [],
    "stateMutability": "payable"
  },
  {
    "type": "function",
    "name": "distributePrize",
    "inputs": [
      { "name": "quizId", "type": "string", "internalType": "string" },
      { "name": "winners", "type": "address[]", "internalType": "address[]" },
      { "name": "amounts", "type": "uint256[]", "internalType": "uint256[]" }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "feePrecision",
    "inputs": [],
    "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getFeePrecision",
    "inputs": [],
    "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getQuiz",
    "inputs": [
      { "name": "quizId", "type": "string", "internalType": "string" }
    ],
    "outputs": [
      {
        "name": "",
        "type": "tuple",
        "internalType": "struct HootQuizManager.Quiz",
        "components": [
          { "name": "quizId", "type": "string", "internalType": "string" },
          { "name": "creator", "type": "address", "internalType": "address" },
          {
            "name": "prizeToken",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "prizeAmount",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "status",
            "type": "uint8",
            "internalType": "enum HootQuizManager.QuizStatus"
          },
          {
            "name": "winners",
            "type": "address[3]",
            "internalType": "address[3]"
          }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getTreasury",
    "inputs": [],
    "outputs": [{ "name": "", "type": "address", "internalType": "address" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getTreasuryFeePercent",
    "inputs": [],
    "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "owner",
    "inputs": [],
    "outputs": [{ "name": "", "type": "address", "internalType": "address" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "quizDistributors",
    "inputs": [{ "name": "", "type": "string", "internalType": "string" }],
    "outputs": [{ "name": "", "type": "address", "internalType": "address" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "quizExists",
    "inputs": [
      { "name": "quizId", "type": "string", "internalType": "string" }
    ],
    "outputs": [{ "name": "", "type": "bool", "internalType": "bool" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "quizzes",
    "inputs": [{ "name": "", "type": "string", "internalType": "string" }],
    "outputs": [
      { "name": "quizId", "type": "string", "internalType": "string" },
      { "name": "creator", "type": "address", "internalType": "address" },
      { "name": "prizeToken", "type": "address", "internalType": "address" },
      { "name": "prizeAmount", "type": "uint256", "internalType": "uint256" },
      {
        "name": "status",
        "type": "uint8",
        "internalType": "enum HootQuizManager.QuizStatus"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "renounceOwnership",
    "inputs": [],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setFeePrecision",
    "inputs": [
      { "name": "newPrecision", "type": "uint256", "internalType": "uint256" }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setQuizActive",
    "inputs": [
      { "name": "quizId", "type": "string", "internalType": "string" }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setTreasury",
    "inputs": [
      { "name": "newTreasury", "type": "address", "internalType": "address" }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setTreasuryFeePercent",
    "inputs": [
      {
        "name": "newFeePercent",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "transferOwnership",
    "inputs": [
      { "name": "newOwner", "type": "address", "internalType": "address" }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "treasury",
    "inputs": [],
    "outputs": [{ "name": "", "type": "address", "internalType": "address" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "treasuryFeePercent",
    "inputs": [],
    "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "event",
    "name": "FeePrecisionUpdated",
    "inputs": [
      {
        "name": "newPrecision",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "OwnershipTransferred",
    "inputs": [
      {
        "name": "previousOwner",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "newOwner",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "PrizeCalculations",
    "inputs": [
      {
        "name": "totalPrize",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "treasuryFee",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "prizeAmounts",
        "type": "uint256[]",
        "indexed": false,
        "internalType": "uint256[]"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "PrizeDistributed",
    "inputs": [
      {
        "name": "quizId",
        "type": "string",
        "indexed": true,
        "internalType": "string"
      },
      {
        "name": "winners",
        "type": "address[]",
        "indexed": false,
        "internalType": "address[]"
      },
      {
        "name": "amounts",
        "type": "uint256[]",
        "indexed": false,
        "internalType": "uint256[]"
      },
      {
        "name": "treasuryAmount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "PrizeDistributionStarted",
    "inputs": [
      {
        "name": "quizId",
        "type": "string",
        "indexed": true,
        "internalType": "string"
      },
      {
        "name": "winners",
        "type": "address[]",
        "indexed": false,
        "internalType": "address[]"
      },
      {
        "name": "amounts",
        "type": "uint256[]",
        "indexed": false,
        "internalType": "uint256[]"
      },
      {
        "name": "treasuryAmount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "QuizCancelled",
    "inputs": [
      {
        "name": "quizId",
        "type": "string",
        "indexed": true,
        "internalType": "string"
      },
      {
        "name": "creator",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "QuizCreated",
    "inputs": [
      {
        "name": "quizId",
        "type": "string",
        "indexed": true,
        "internalType": "string"
      },
      {
        "name": "creator",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "prizeToken",
        "type": "address",
        "indexed": false,
        "internalType": "address"
      },
      {
        "name": "prizeAmount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "TreasuryFeePercentUpdated",
    "inputs": [
      {
        "name": "newFeePercent",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "TreasuryTransfer",
    "inputs": [
      {
        "name": "treasury",
        "type": "address",
        "indexed": false,
        "internalType": "address"
      },
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "TreasuryTransferSuccess",
    "inputs": [
      {
        "name": "treasury",
        "type": "address",
        "indexed": false,
        "internalType": "address"
      },
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "TreasuryUpdated",
    "inputs": [
      {
        "name": "newTreasury",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "WinnerTransfer",
    "inputs": [
      {
        "name": "winner",
        "type": "address",
        "indexed": false,
        "internalType": "address"
      },
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "position",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "WinnerTransferSuccess",
    "inputs": [
      {
        "name": "winner",
        "type": "address",
        "indexed": false,
        "internalType": "address"
      },
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "position",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  { "type": "error", "name": "InsufficientBalance", "inputs": [] },
  { "type": "error", "name": "InvalidArrayLength", "inputs": [] },
  { "type": "error", "name": "InvalidFeePrecision", "inputs": [] },
  { "type": "error", "name": "InvalidPrizeAmount", "inputs": [] },
  { "type": "error", "name": "InvalidTreasuryFeePercent", "inputs": [] },
  { "type": "error", "name": "InvalidWinnersCount", "inputs": [] },
  {
    "type": "error",
    "name": "OwnableInvalidOwner",
    "inputs": [
      { "name": "owner", "type": "address", "internalType": "address" }
    ]
  },
  {
    "type": "error",
    "name": "OwnableUnauthorizedAccount",
    "inputs": [
      { "name": "account", "type": "address", "internalType": "address" }
    ]
  },
  { "type": "error", "name": "QuizAlreadyCompleted", "inputs": [] },
  { "type": "error", "name": "QuizNotActive", "inputs": [] },
  { "type": "error", "name": "QuizNotFound", "inputs": [] },
  { "type": "error", "name": "ReentrancyGuardReentrantCall", "inputs": [] },
  {
    "type": "error",
    "name": "SafeERC20FailedOperation",
    "inputs": [
      { "name": "token", "type": "address", "internalType": "address" }
    ]
  },
  { "type": "error", "name": "TransferFailed", "inputs": [] },
  { "type": "error", "name": "UnauthorizedDistributor", "inputs": [] }
] as const

// Zero address constant
export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

// USDC token addresses
export const USDC_ADDRESSES = {
  base: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',  // Base mainnet USDC
  baseSepolia: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'  // Base Sepolia (using mainnet for now)
} as const

// ERC20 ABI for token operations (approve, balanceOf, allowance, transfer)
export const ERC20_ABI = [
  {
    "type": "function",
    "name": "approve",
    "inputs": [
      { "name": "spender", "type": "address", "internalType": "address" },
      { "name": "amount", "type": "uint256", "internalType": "uint256" }
    ],
    "outputs": [{ "name": "", "type": "bool", "internalType": "bool" }],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "allowance",
    "inputs": [
      { "name": "owner", "type": "address", "internalType": "address" },
      { "name": "spender", "type": "address", "internalType": "address" }
    ],
    "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "balanceOf",
    "inputs": [
      { "name": "account", "type": "address", "internalType": "address" }
    ],
    "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "decimals",
    "inputs": [],
    "outputs": [{ "name": "", "type": "uint8", "internalType": "uint8" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "transfer",
    "inputs": [
      { "name": "to", "type": "address", "internalType": "address" },
      { "name": "amount", "type": "uint256", "internalType": "uint256" }
    ],
    "outputs": [{ "name": "", "type": "bool", "internalType": "bool" }],
    "stateMutability": "nonpayable"
  }
] as const


