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
export const HOOT_QUIZ_MANAGER_ABI = [
  {
    "inputs": [
      {"internalType": "address", "name": "_treasury", "type": "address"}
    ],
    "stateMutability": "nonpayable",
    "type": "constructor"
  },
  {
    "inputs": [],
    "name": "InsufficientBalance",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InvalidPrizeAmount",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "QuizAlreadyCompleted",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "QuizNotActive",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "QuizNotFound",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "TransferFailed",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "UnauthorizedDistributor",
    "type": "error"
  },
  {
    "anonymous": false,
    "inputs": [
      {"indexed": true, "internalType": "string", "name": "quizId", "type": "string"},
      {"indexed": false, "internalType": "address[4]", "name": "winners", "type": "address[4]"},
      {"indexed": false, "internalType": "uint256[4]", "name": "amounts", "type": "uint256[4]"}
    ],
    "name": "PrizeDistributed",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {"indexed": true, "internalType": "string", "name": "quizId", "type": "string"},
      {"indexed": false, "internalType": "address[4]", "name": "winners", "type": "address[4]"},
      {"indexed": false, "internalType": "uint256[4]", "name": "amounts", "type": "uint256[4]"}
    ],
    "name": "PrizeDistributionStarted",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {"indexed": true, "internalType": "string", "name": "quizId", "type": "string"},
      {"indexed": true, "internalType": "address", "name": "creator", "type": "address"}
    ],
    "name": "QuizCancelled",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {"indexed": true, "internalType": "string", "name": "quizId", "type": "string"},
      {"indexed": true, "internalType": "address", "name": "creator", "type": "address"},
      {"indexed": false, "internalType": "address", "name": "prizeToken", "type": "address"},
      {"indexed": false, "internalType": "uint256", "name": "prizeAmount", "type": "uint256"}
    ],
    "name": "QuizCreated",
    "type": "event"
  },
  {
    "inputs": [
      {"internalType": "string", "name": "quizId", "type": "string"}
    ],
    "name": "cancelQuiz",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {"internalType": "string", "name": "quizId", "type": "string"},
      {"internalType": "address", "name": "prizeToken", "type": "address"},
      {"internalType": "uint256", "name": "prizeAmount", "type": "uint256"}
    ],
    "name": "createQuiz",
    "outputs": [],
    "stateMutability": "payable",
    "type": "function"
  },
  {
    "inputs": [
      {"internalType": "string", "name": "quizId", "type": "string"},
      {"internalType": "address[4]", "name": "winners", "type": "address[4]"},
      {"internalType": "uint256[4]", "name": "amounts", "type": "uint256[4]"}
    ],
    "name": "distributePrize",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {"internalType": "string", "name": "quizId", "type": "string"}
    ],
    "name": "getQuiz",
    "outputs": [
      {
        "components": [
          {"internalType": "string", "name": "quizId", "type": "string"},
          {"internalType": "address", "name": "creator", "type": "address"},
          {"internalType": "address", "name": "prizeToken", "type": "address"},
          {"internalType": "uint256", "name": "prizeAmount", "type": "uint256"},
          {"internalType": "enum HootQuizManager.QuizStatus", "name": "status", "type": "uint8"},
          {"internalType": "address[3]", "name": "winners", "type": "address[3]"},
          {"internalType": "uint256[3]", "name": "scores", "type": "uint256[3]"}
        ],
        "internalType": "struct HootQuizManager.Quiz",
        "name": "",
        "type": "tuple"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {"internalType": "string", "name": "quizId", "type": "string"}
    ],
    "name": "quizExists",
    "outputs": [
      {"internalType": "bool", "name": "", "type": "bool"}
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {"internalType": "string", "name": "quizId", "type": "string"}
    ],
    "name": "setQuizActive",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {"internalType": "address", "name": "newTreasury", "type": "address"}
    ],
    "name": "setTreasury",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "treasury",
    "outputs": [
      {"internalType": "address", "name": "", "type": "address"}
    ],
    "stateMutability": "view",
    "type": "function"
  }
] as const

// Zero address constant
export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'


