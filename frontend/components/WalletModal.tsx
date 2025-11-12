"use client";

import { useState, useEffect } from "react";
import { useAccount, useBalance, useSendTransaction, useWriteContract, useReadContract } from "wagmi";
import { parseEther, formatEther, parseUnits, formatUnits, isAddress } from "viem";
import { useAuth } from "@/lib/use-auth";
import QRCode from "react-qr-code";
import { USDC_ADDRESSES, ERC20_ABI } from "@/lib/contracts";

interface WalletModalProps {
  onClose: () => void;
}

type ViewMode = "main" | "send" | "receive";
type TokenType = "ETH" | "USDC";

export default function WalletModal({ onClose }: WalletModalProps) {
  const { address, chain } = useAccount();
  const { loggedUser } = useAuth();
  
  // Token selection
  const [selectedToken, setSelectedToken] = useState<TokenType>("ETH");
  
  // Get USDC address based on chain
  const usdcAddress = chain?.id === 8453 
    ? USDC_ADDRESSES.base 
    : USDC_ADDRESSES.baseSepolia;

  // ETH balance
  const { data: ethBalance } = useBalance({ address });
  
  // USDC balance and decimals
  const { data: usdcBalance } = useReadContract({
    address: usdcAddress as `0x${string}`,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: {
      enabled: !!address,
    },
  });

  const { data: usdcDecimals } = useReadContract({
    address: usdcAddress as `0x${string}`,
    abi: ERC20_ABI,
    functionName: "decimals",
    query: {
      enabled: true,
    },
  });

  // Transaction hooks
  const { sendTransaction, isPending: isSendingETH, error: sendError } = useSendTransaction();
  const { writeContractAsync, isPending: isSendingUSDC, error: writeError } = useWriteContract();

  const [viewMode, setViewMode] = useState<ViewMode>("main");
  const [sendTo, setSendTo] = useState("");
  const [sendAmount, setSendAmount] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Get wallet address from loggedUser or wagmi
  const walletAddress = address || loggedUser?.address;

  // Get current balance based on selected token
  const getCurrentBalance = () => {
    if (selectedToken === "ETH") {
      return ethBalance ? formatEther(ethBalance.value) : "0";
    } else {
      return usdcBalance && usdcDecimals 
        ? formatUnits(usdcBalance, Number(usdcDecimals))
        : "0";
    }
  };

  // Format balance for display
  const formattedBalance = (() => {
    const balance = getCurrentBalance();
    const decimals = selectedToken === "ETH" ? 4 : 2;
    return parseFloat(balance).toFixed(decimals);
  })();

  // Format address for display
  const formattedAddress = walletAddress
    ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`
    : "N/A";

  // Copy address to clipboard
  const copyAddress = async () => {
    if (!walletAddress) return;
    try {
      await navigator.clipboard.writeText(walletAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy address:", err);
    }
  };

  // Validate and send transaction
  const handleSend = async () => {
    setLocalError(null);

    // Validate address
    if (!sendTo || !isAddress(sendTo)) {
      setLocalError("Invalid Ethereum address");
      return;
    }

    // Validate amount
    if (!sendAmount || parseFloat(sendAmount) <= 0) {
      setLocalError("Please enter a valid amount");
      return;
    }

    const currentBalance = parseFloat(getCurrentBalance());
    if (parseFloat(sendAmount) > currentBalance) {
      setLocalError("Insufficient balance");
      return;
    }

    try {
      if (selectedToken === "ETH") {
        // Send ETH
        sendTransaction(
          {
            to: sendTo as `0x${string}`,
            value: parseEther(sendAmount),
          },
          {
            onSuccess: () => {
              setSendTo("");
              setSendAmount("");
              setViewMode("main");
              setTimeout(() => onClose(), 2000);
            },
            onError: (error) => {
              setLocalError(error.message || "Transaction failed");
            },
          }
        );
      } else {
        // Send USDC
        if (!usdcDecimals) {
          setLocalError("Unable to get token decimals");
          return;
        }

        const amountInUnits = parseUnits(sendAmount, Number(usdcDecimals));
        
        await writeContractAsync({
          address: usdcAddress as `0x${string}`,
          abi: ERC20_ABI,
          functionName: "transfer",
          args: [sendTo as `0x${string}`, amountInUnits],
        });

        // Reset form and close modal on success
        setSendTo("");
        setSendAmount("");
        setViewMode("main");
        setTimeout(() => onClose(), 2000);
      }
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "Transaction failed");
    }
  };

  // Reset form when switching views or tokens
  useEffect(() => {
    if (viewMode === "main") {
      setSendTo("");
      setSendAmount("");
      setLocalError(null);
    }
  }, [viewMode, selectedToken]);

  const isSending = isSendingETH || isSendingUSDC;
  const transactionError = sendError || writeError;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-end justify-center z-50"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-black border border-gray-800 rounded-t-2xl p-6 w-full max-w-md transform transition-transform duration-300 ease-out">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-bold text-white">
            {viewMode === "send" 
              ? `Send ${selectedToken}` 
              : viewMode === "receive" 
              ? `Receive ${selectedToken}` 
              : "Wallet"}
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Main View */}
        {viewMode === "main" && (
          <div className="space-y-6">
            {/* Token Selector */}
            <div className="flex gap-2 bg-gray-900 rounded-lg p-1">
              <button
                onClick={() => setSelectedToken("ETH")}
                className={`flex-1 py-2 px-4 rounded-md font-medium transition-colors ${
                  selectedToken === "ETH"
                    ? "bg-[#795AFF] text-white"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                ETH
              </button>
              <button
                onClick={() => setSelectedToken("USDC")}
                className={`flex-1 py-2 px-4 rounded-md font-medium transition-colors ${
                  selectedToken === "USDC"
                    ? "bg-[#795AFF] text-white"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                USDC
              </button>
            </div>

            {/* Balance Display */}
            <div className="bg-gray-900 rounded-lg p-4 text-center">
              <p className="text-gray-400 text-sm mb-1">Balance</p>
              <p className="text-2xl font-bold text-white">
                {formattedBalance} {selectedToken}
              </p>
            </div>

            {/* Address Display */}
            <div className="bg-gray-900 rounded-lg p-4">
              <p className="text-gray-400 text-sm mb-2">Address</p>
              <div className="flex items-center justify-between">
                <p className="text-white font-mono text-sm">{formattedAddress}</p>
                <button
                  onClick={copyAddress}
                  className="text-gray-400 hover:text-white transition-colors text-sm"
                >
                  {copied ? "✓ Copied" : "Copy"}
                </button>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => setViewMode("send")}
                className="bg-[#795AFF] hover:bg-[#6a4de6] text-white font-medium py-3 px-4 rounded-lg transition-colors"
              >
                Send
              </button>
              <button
                onClick={() => setViewMode("receive")}
                className="bg-[#795AFF] hover:bg-[#6a4de6] text-white font-medium py-3 px-4 rounded-lg transition-colors"
              >
                Receive
              </button>
            </div>
          </div>
        )}

        {/* Send View */}
        {viewMode === "send" && (
          <div className="space-y-4">
            {/* Back button */}
            <button
              onClick={() => setViewMode("main")}
              className="text-gray-400 hover:text-white transition-colors text-sm flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back
            </button>

            {/* Token Selector in Send View */}
            <div className="flex gap-2 bg-gray-900 rounded-lg p-1">
              <button
                onClick={() => setSelectedToken("ETH")}
                className={`flex-1 py-2 px-4 rounded-md font-medium transition-colors ${
                  selectedToken === "ETH"
                    ? "bg-[#795AFF] text-white"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                ETH
              </button>
              <button
                onClick={() => setSelectedToken("USDC")}
                className={`flex-1 py-2 px-4 rounded-md font-medium transition-colors ${
                  selectedToken === "USDC"
                    ? "bg-[#795AFF] text-white"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                USDC
              </button>
            </div>

            {/* Recipient Address */}
            <div>
              <label className="block text-sm text-gray-300 mb-2">To Address</label>
              <input
                type="text"
                value={sendTo}
                onChange={(e) => setSendTo(e.target.value)}
                placeholder="0x..."
                className="w-full px-3 py-2 bg-gray-900 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-[#795AFF] font-mono text-sm"
              />
            </div>

            {/* Amount */}
            <div>
              <label className="block text-sm text-gray-300 mb-2">
                Amount ({selectedToken})
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={sendAmount}
                  onChange={(e) => setSendAmount(e.target.value)}
                  placeholder="0.0"
                  step={selectedToken === "ETH" ? "0.000001" : "0.01"}
                  min="0"
                  className="flex-1 px-3 py-2 bg-gray-900 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-[#795AFF]"
                />
                <button
                  onClick={() => {
                    const balance = getCurrentBalance();
                    setSendAmount(balance);
                  }}
                  className="px-3 py-2 bg-gray-800 hover:bg-gray-700 text-white text-sm rounded-lg transition-colors"
                >
                  Max
                </button>
              </div>
              <p className="text-xs text-gray-400 mt-1">
                Available: {formattedBalance} {selectedToken}
              </p>
            </div>

            {/* Error Message */}
            {(localError || transactionError) && (
              <div className="bg-red-900/30 border border-red-500 rounded-lg p-3">
                <p className="text-red-400 text-sm">
                  {localError || (transactionError?.message || "Transaction failed")}
                </p>
              </div>
            )}

            {/* Send Button */}
            <button
              onClick={handleSend}
              disabled={isSending || !sendTo || !sendAmount}
              className="w-full bg-[#795AFF] hover:bg-[#6a4de6] disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-medium py-3 px-4 rounded-lg transition-colors"
            >
              {isSending ? `Sending ${selectedToken}...` : `Send ${selectedToken}`}
            </button>

            {/* Success Message */}
            {!isSending && !localError && !transactionError && sendTo && sendAmount && (
              <p className="text-green-400 text-sm text-center">
                Transaction will be sent to your wallet for confirmation
              </p>
            )}
          </div>
        )}

        {/* Receive View */}
        {viewMode === "receive" && (
          <div className="space-y-4">
            {/* Back button */}
            <button
              onClick={() => setViewMode("main")}
              className="text-gray-400 hover:text-white transition-colors text-sm flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back
            </button>

            {/* Token Selector in Receive View */}
            <div className="flex gap-2 bg-gray-900 rounded-lg p-1">
              <button
                onClick={() => setSelectedToken("ETH")}
                className={`flex-1 py-2 px-4 rounded-md font-medium transition-colors ${
                  selectedToken === "ETH"
                    ? "bg-[#795AFF] text-white"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                ETH
              </button>
              <button
                onClick={() => setSelectedToken("USDC")}
                className={`flex-1 py-2 px-4 rounded-md font-medium transition-colors ${
                  selectedToken === "USDC"
                    ? "bg-[#795AFF] text-white"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                USDC
              </button>
            </div>

            {/* Address Display */}
            <div className="bg-gray-900 rounded-lg p-6 text-center">
              <p className="text-gray-400 text-sm mb-4">Your Wallet Address</p>
              {walletAddress && (
                <div className="bg-white rounded-lg p-4 mb-4 flex justify-center">
                  <QRCode
                    value={walletAddress}
                    size={192}
                    style={{ height: "auto", maxWidth: "100%", width: "100%" }}
                    viewBox="0 0 256 256"
                  />
                </div>
              )}
              <div className="bg-gray-800 rounded-lg p-3 mb-4">
                <p className="text-white font-mono text-sm break-all">{walletAddress || "N/A"}</p>
              </div>
              <button
                onClick={copyAddress}
                className="w-full bg-[#795AFF] hover:bg-[#6a4de6] text-white font-medium py-3 px-4 rounded-lg transition-colors"
              >
                {copied ? "✓ Address Copied!" : "Copy Address"}
              </button>
            </div>

            {/* Info */}
            <p className="text-gray-400 text-xs text-center">
              Share this address to receive {selectedToken}. Only send {selectedToken} on Base network.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
