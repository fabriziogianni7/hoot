"use client";

import { useState, useEffect } from "react";
import { useWallet } from "@/lib/wallet-context";
import { useNetwork } from "@/lib/network-context";

interface SwapBoxProps {
  onClose: () => void;
  rewardAmount?: number;
}

interface TokenInfo {
  symbol: string;
  name: string;
  address: string;
  decimals: number;
}

interface QuoteResponse {
  toAmount: string;
  fromAmount: string;
  protocols: any[];
  estimatedGas: string;
}

const TOKENS: Record<string, TokenInfo> = {
  ETH: {
    symbol: "ETH",
    name: "Ethereum",
    address: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
    decimals: 18
  },
  USDC: {
    symbol: "USDC",
    name: "USD Coin",
    address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // Base mainnet USDC
    decimals: 6
  }
};

export default function SwapBox({ onClose, rewardAmount = 0 }: SwapBoxProps) {
  const { account, provider, signer } = useWallet();
  const { currentNetwork } = useNetwork();
  
  const [fromToken, setFromToken] = useState<TokenInfo>(TOKENS.ETH);
  const [toToken, setToToken] = useState<TokenInfo>(TOKENS.USDC);
  const [fromAmount, setFromAmount] = useState<string>("");
  const [toAmount, setToAmount] = useState<string>("");
  const [isLoadingQuote, setIsLoadingQuote] = useState(false);
  const [isSwapping, setIsSwapping] = useState(false);
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [error, setError] = useState<string>("");
  const [showTokens, setShowTokens] = useState<'from' | 'to' | null>(null);

  // Set initial amount to reward amount
  useEffect(() => {
    if (rewardAmount > 0) {
      setFromAmount(rewardAmount.toString());
    }
  }, [rewardAmount]);

  // Get 1inch API base URL based on network
  const getApiBaseUrl = () => {
    switch (currentNetwork) {
      case 'base':
        return 'https://api.1inch.io/v6.0/8453';
      case 'baseSepolia':
        return 'https://api.1inch.io/v6.0/84532';
      case 'local':
        return 'https://api.1inch.io/v6.0/84532'; // Use Base Sepolia for local testing
      default:
        return 'https://api.1inch.io/v6.0/8453';
    }
  };

  // Get quote from 1inch
  const getQuote = async (fromTokenAddress: string, toTokenAddress: string, amount: string) => {
    if (!amount || parseFloat(amount) <= 0) return null;

    const apiBaseUrl = getApiBaseUrl();
    const fromTokenInfo = Object.values(TOKENS).find(t => t.address === fromTokenAddress);
    const amountInWei = (parseFloat(amount) * Math.pow(10, fromTokenInfo?.decimals || 18)).toString();

    try {
      const response = await fetch(
        `${apiBaseUrl}/quote?fromTokenAddress=${fromTokenAddress}&toTokenAddress=${toTokenAddress}&amount=${amountInWei}`
      );
      
      if (!response.ok) {
        throw new Error(`Quote failed: ${response.statusText}`);
      }
      
      return await response.json();
    } catch (err) {
      console.error('Error getting quote:', err);
      throw err;
    }
  };

  // Handle quote request
  const handleGetQuote = async () => {
    if (!fromAmount || parseFloat(fromAmount) <= 0) {
      setError("Please enter a valid amount");
      return;
    }

    setIsLoadingQuote(true);
    setError("");
    
    try {
      const quoteData = await getQuote(fromToken.address, toToken.address, fromAmount);
      if (quoteData) {
        setQuote(quoteData);
        const toTokenInfo = Object.values(TOKENS).find(t => t.address === toToken.address);
        const toAmountFormatted = (parseInt(quoteData.toAmount) / Math.pow(10, toTokenInfo?.decimals || 6)).toFixed(6);
        setToAmount(toAmountFormatted);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to get quote");
    } finally {
      setIsLoadingQuote(false);
    }
  };

  // Execute swap
  const handleSwap = async () => {
    if (!signer || !account || !quote) {
      setError("Wallet not connected or quote not available");
      return;
    }

    setIsSwapping(true);
    setError("");

    try {
      const apiBaseUrl = getApiBaseUrl();
      const fromTokenInfo = Object.values(TOKENS).find(t => t.address === fromToken.address);
      const amountInWei = (parseFloat(fromAmount) * Math.pow(10, fromTokenInfo?.decimals || 18)).toString();

      // Get swap data from 1inch using GET request
      const swapUrl = `${apiBaseUrl}/swap?fromTokenAddress=${fromToken.address}&toTokenAddress=${toToken.address}&amount=${amountInWei}&fromAddress=${account}&slippage=1`;
      
      const swapResponse = await fetch(swapUrl);

      if (!swapResponse.ok) {
        throw new Error(`Swap data failed: ${swapResponse.statusText}`);
      }

      const swapData = await swapResponse.json();
      
      // Execute the transaction
      const tx = await signer.sendTransaction({
        to: swapData.tx.to,
        data: swapData.tx.data,
        value: swapData.tx.value,
        gasLimit: swapData.tx.gas
      });

      console.log('Swap transaction sent:', tx.hash);
      
      // Wait for confirmation
      const receipt = await tx.wait();
      console.log('Swap completed:', receipt);
      
      // Close the swap box on success
      onClose();
      
    } catch (err) {
      console.error('Swap error:', err);
      setError(err instanceof Error ? err.message : "Swap failed");
    } finally {
      setIsSwapping(false);
    }
  };

  const swapTokens = () => {
    const tempToken = fromToken;
    setFromToken(toToken);
    setToToken(tempToken);
    setFromAmount(toAmount);
    setToAmount(fromAmount);
    setQuote(null);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-50">
      <div className="bg-black border border-gray-800 rounded-t-2xl p-6 w-full max-w-md transform transition-transform duration-300 ease-out animate-slide-up">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-bold text-white">Swap Tokens 🔄</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        <div className="space-y-4">
          {/* From Token */}
          <div>
            <label className="block text-sm text-gray-300 mb-2">From</label>
            <div className="flex items-center space-x-3">
              <button
                onClick={() => setShowTokens('from')}
                className="flex items-center space-x-2 bg-gray-900 rounded-lg px-3 py-2 hover:bg-gray-800 transition-colors"
              >
                <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center text-xs font-bold">
                  {fromToken.symbol.charAt(0)}
                </div>
                <span>{fromToken.symbol}</span>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              
              <input
                type="number"
                value={fromAmount}
                onChange={(e) => setFromAmount(e.target.value)}
                placeholder="0.0"
                className="flex-1 px-3 py-2 bg-gray-900 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                step="0.000001"
              />
            </div>
          </div>

          {/* Swap Button */}
          <div className="flex justify-center">
            <button
              onClick={swapTokens}
              className="p-2 bg-gray-900 rounded-full hover:bg-gray-800 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
              </svg>
            </button>
          </div>

          {/* To Token */}
          <div>
            <label className="block text-sm text-gray-300 mb-2">To</label>
            <div className="flex items-center space-x-3">
              <button
                onClick={() => setShowTokens('to')}
                className="flex items-center space-x-2 bg-gray-900 rounded-lg px-3 py-2 hover:bg-gray-800 transition-colors"
              >
                <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center text-xs font-bold">
                  {toToken.symbol.charAt(0)}
                </div>
                <span>{toToken.symbol}</span>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              
              <input
                type="text"
                value={toAmount}
                readOnly
                placeholder="0.0"
                className="flex-1 px-3 py-2 bg-gray-900 rounded-lg text-white focus:outline-none"
              />
            </div>
          </div>

          {/* Token Selection Modal */}
          {showTokens && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-10">
              <div className="bg-gray-900 rounded-lg p-4 w-full max-w-xs">
                <h4 className="text-lg font-semibold mb-3">Select Token</h4>
                <div className="space-y-2">
                  {Object.values(TOKENS).map((token) => (
                    <button
                      key={token.symbol}
                      onClick={() => {
                        if (showTokens === 'from') {
                          setFromToken(token);
                        } else {
                          setToToken(token);
                        }
                        setShowTokens(null);
                        setQuote(null);
                        setToAmount("");
                      }}
                      className="w-full flex items-center space-x-3 p-2 hover:bg-gray-800 rounded-lg transition-colors"
                    >
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                        token.symbol === 'ETH' ? 'bg-blue-500' : 'bg-green-500'
                      }`}>
                        {token.symbol.charAt(0)}
                      </div>
                      <span>{token.symbol}</span>
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => setShowTokens(null)}
                  className="w-full mt-3 py-2 bg-gray-600 hover:bg-gray-500 rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="bg-red-500/20 border border-red-500 rounded-lg p-3 text-red-200 text-sm">
              {error}
            </div>
          )}

          {/* Quote Info */}
          {quote && (
            <div className="bg-blue-500/20 border border-blue-500 rounded-lg p-3 text-sm">
              <div className="flex justify-between mb-1">
                <span>Rate:</span>
                <span>1 {fromToken.symbol} = {(parseFloat(toAmount) / parseFloat(fromAmount)).toFixed(6)} {toToken.symbol}</span>
              </div>
              <div className="flex justify-between">
                <span>Estimated Gas:</span>
                <span>{quote.estimatedGas}</span>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3">
            <button
              onClick={handleGetQuote}
              disabled={!fromAmount || parseFloat(fromAmount) <= 0 || isLoadingQuote}
              className="flex-1 py-3 px-4 rounded-lg font-medium bg-blue-600 hover:bg-blue-700 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoadingQuote ? 'Getting Quote...' : 'Get Quote'}
            </button>
            
            <button
              onClick={handleSwap}
              disabled={!quote || isSwapping}
              className="flex-1 py-3 px-4 rounded-lg font-medium bg-green-600 hover:bg-green-700 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSwapping ? 'Swapping...' : 'Swap'}
            </button>
          </div>

          <div className="text-center">
            <p className="text-xs text-gray-400">
              Powered by 1inch • Slippage: 1%
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
