import { ethers } from 'ethers'
import { HOOT_QUIZ_MANAGER_ABI, getCurrentContractAddress, ZERO_ADDRESS } from './contracts'

/**
 * Create a quiz on-chain with ETH prize pool
 */
export async function createQuizOnChain(
  quizId: string,
  prizeAmount: string, // in ETH
  signer: ethers.Signer,
  network?: string
): Promise<{ txHash: string; receipt: ethers.TransactionReceipt }> {
  const contractAddress: string = getCurrentContractAddress(network);
  const contract = new ethers.Contract(contractAddress, HOOT_QUIZ_MANAGER_ABI, signer);

  // Convert prize amount to wei
  const prizeAmountWei = ethers.parseEther(prizeAmount);
  console.log('Creating quiz on-chain with prize:', prizeAmount, 'ETH (', prizeAmountWei.toString(), 'wei )');

  // Call createQuiz with ETH (prizeToken = ZERO_ADDRESS)
  const tx = await contract.createQuiz(quizId, ZERO_ADDRESS, prizeAmountWei, {
    value: prizeAmountWei
  })

  console.log('Transaction sent:', tx.hash)
  
  // Wait for transaction confirmation
  const receipt = await tx.wait()
  
  console.log('Transaction confirmed:', receipt.hash)

  return {
    txHash: receipt.hash,
    receipt
  }
}

/**
 * Distribute prizes to top 3 players and treasury
 */
export async function distributePrizes(
  quizId: string,
  winners: [string, string, string, string], // [1st, 2nd, 3rd, treasury]
  amounts: [bigint, bigint, bigint, bigint], // amounts in wei
  signer: ethers.Signer,
  network?: string
): Promise<{ txHash: string; receipt: ethers.TransactionReceipt }> {
  const contractAddress = getCurrentContractAddress(network)
  const contract = new ethers.Contract(contractAddress, HOOT_QUIZ_MANAGER_ABI, signer)

  // Call distributePrize
  const tx = await contract.distributePrize(quizId, winners, amounts)

  console.log('Prize distribution transaction sent:', tx.hash)
  
  // Wait for transaction confirmation
  const receipt = await tx.wait()
  
  console.log('Prize distribution confirmed:', receipt.hash)

  return {
    txHash: receipt.hash,
    receipt
  }
}

/**
 * Get quiz details from contract
 */
export async function getQuizDetails(
  quizId: string,
  provider: ethers.Provider,
  network?: string
): Promise<{
  quizId: string
  creator: string
  prizeToken: string
  prizeAmount: bigint
  status: number
  winners: [string, string, string]
  scores: [bigint, bigint, bigint]
}> {
  const contractAddress = getCurrentContractAddress(network)
  const contract = new ethers.Contract(contractAddress, HOOT_QUIZ_MANAGER_ABI, provider)

  const quiz = await contract.getQuiz(quizId)

  return quiz
}

/**
 * Check if quiz exists on-chain
 */
export async function quizExists(
  quizId: string,
  provider: ethers.Provider,
  network?: string
): Promise<boolean> {
  const contractAddress = getCurrentContractAddress(network)
  const contract = new ethers.Contract(contractAddress, HOOT_QUIZ_MANAGER_ABI, provider)

  return await contract.quizExists(quizId)
}

/**
 * Set quiz status to active
 */
export async function setQuizActive(
  quizId: string,
  signer: ethers.Signer,
  network?: string
): Promise<{ txHash: string; receipt: ethers.TransactionReceipt }> {
  const contractAddress = getCurrentContractAddress(network)
  const contract = new ethers.Contract(contractAddress, HOOT_QUIZ_MANAGER_ABI, signer)

  const tx = await contract.setQuizActive(quizId)
  
  console.log('Set quiz active transaction sent:', tx.hash)
  
  const receipt = await tx.wait()
  
  console.log('Set quiz active confirmed:', receipt.hash)

  return {
    txHash: receipt.hash,
    receipt
  }
}

/**
 * Cancel quiz and return funds to creator
 */
export async function cancelQuiz(
  quizId: string,
  signer: ethers.Signer,
  network?: string
): Promise<{ txHash: string; receipt: ethers.TransactionReceipt }> {
  const contractAddress = getCurrentContractAddress(network)
  const contract = new ethers.Contract(contractAddress, HOOT_QUIZ_MANAGER_ABI, signer)

  const tx = await contract.cancelQuiz(quizId)
  
  console.log('Cancel quiz transaction sent:', tx.hash)
  
  const receipt = await tx.wait()
  
  console.log('Cancel quiz confirmed:', receipt.hash)

  return {
    txHash: receipt.hash,
    receipt
  }
}

/**
 * Calculate prize distribution (10% treasury, 40/30/20 for top 3)
 */
export function calculatePrizeDistribution(totalPrize: bigint): {
  treasury: bigint
  first: bigint
  second: bigint
  third: bigint
} {
  const treasury = (totalPrize * 10n) / 100n
  const remaining = totalPrize - treasury
  
  const first = (remaining * 40n) / 100n
  const second = (remaining * 30n) / 100n
  const third = (remaining * 20n) / 100n

  return {
    treasury,
    first,
    second,
    third
  }
}

/**
 * Format wallet address for display (0x1234...5678)
 */
export function formatAddress(address: string): string {
  if (!address || address.length < 10) return address
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

/**
 * Get ETH balance for an address
 */
export async function getEthBalance(
  address: string,
  provider: ethers.Provider
): Promise<string> {
  const balance = await provider.getBalance(address)
  return ethers.formatEther(balance)
}


