// Contract addresses for different networks
export const CONTRACT_ADDRESSES = {
  local: "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0",
  baseSepolia: "", // Add when deployed
  base: "" // Add when deployed
}

// Get contract address based on current network
export const getContractAddress = (network: string = 'local') => {
  return CONTRACT_ADDRESSES[network as keyof typeof CONTRACT_ADDRESSES] || CONTRACT_ADDRESSES.local
}

// Contract ABI for HootQuizManager
export const HOOT_QUIZ_MANAGER_ABI = [
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
      {"internalType": "string", "name": "quizId", "type": "string"}
    ],
    "name": "setQuizActive",
    "outputs": [],
    "stateMutability": "nonpayable",
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
  }
]
