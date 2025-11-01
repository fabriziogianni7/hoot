import { ethers } from 'https://esm.sh/ethers@6'
import { ERC20_ABI, ZERO_ADDRESS } from './constants.ts'

/**
 * Get token decimals from contract or return 18 for ETH
 */
export async function getTokenDecimals(
  prizeToken: string | null,
  rpcUrl: string
): Promise<number> {
  // ETH uses 18 decimals
  if (!prizeToken || prizeToken === ZERO_ADDRESS) {
    return 18
  }

  try {
    const provider = new ethers.JsonRpcProvider(rpcUrl)
    const tokenContract = new ethers.Contract(prizeToken, ERC20_ABI, provider)
    const decimals = await tokenContract.decimals()
    return Number(decimals)
  } catch (error) {
    console.warn('Failed to get token decimals, defaulting to 18:', error)
    return 18
  }
}

/**
 * Get treasury fee settings from contract
 */
export async function getTreasuryFeeSettings(
  contractAddress: string,
  abi: any[],
  rpcUrl: string
): Promise<{ feePercent: bigint; feePrecision: bigint }> {
  try {
    const provider = new ethers.JsonRpcProvider(rpcUrl)
    const contract = new ethers.Contract(contractAddress, abi, provider)

    const feePercent = await contract.getTreasuryFeePercent()
    const feePrecision = await contract.getFeePrecision()

    return {
      feePercent: BigInt(feePercent.toString()),
      feePrecision: BigInt(feePrecision.toString())
    }
  } catch (error) {
    console.warn('Failed to get treasury fee settings from contract, using defaults:', error)
    // Default: 10% with precision of 1000000 (4 decimals)
    return {
      feePercent: 100000n,
      feePrecision: 1000000n
    }
  }
}

/**
 * Execute a contract transaction and wait for confirmation
 */
export async function executeContractTransaction(
  contractAddress: string,
  abi: any[],
  functionName: string,
  args: any[],
  privateKey: string,
  rpcUrl: string,
  value?: bigint
): Promise<string> {
  if (!privateKey) {
    throw new Error('Private key is required for contract transactions')
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl)
  const wallet = new ethers.Wallet(privateKey, provider)
  const contract = new ethers.Contract(contractAddress, abi, wallet)

  const tx = await contract[functionName](...args, value ? { value } : {})
  const receipt = await tx.wait()

  if (receipt.status !== 1) {
    throw new Error('Transaction failed')
  }

  return tx.hash
}

/**
 * Get contract signer for read operations
 */
export function getContractSigner(
  contractAddress: string,
  abi: any[],
  privateKey: string,
  rpcUrl: string
) {
  const provider = new ethers.JsonRpcProvider(rpcUrl)
  const wallet = new ethers.Wallet(privateKey, provider)
  return new ethers.Contract(contractAddress, abi, wallet)
}

/**
 * Get contract for read-only operations
 */
export function getContract(
  contractAddress: string,
  abi: any[],
  rpcUrl: string
) {
  const provider = new ethers.JsonRpcProvider(rpcUrl)
  return new ethers.Contract(contractAddress, abi, provider)
}