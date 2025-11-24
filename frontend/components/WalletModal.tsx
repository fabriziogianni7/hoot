"use client";

import { useState, useEffect, useMemo } from "react";
import {
  useAccount,
  useBalance,
  useSendTransaction,
  useWriteContract,
  useReadContract,
  useReadContracts,
} from "wagmi";
import { parseEther, formatEther, parseUnits, formatUnits, isAddress } from "viem";
import { useAuth } from "@/lib/use-auth";
import QRCode from "react-qr-code";
import { ERC20_ABI } from "@/lib/contracts";
import {
  getTokensForNetwork,
  getDefaultTokenForNetwork,
  TokenConfig,
} from "@/lib/token-config";

interface WalletModalProps {
  onClose: () => void;
}

type ViewMode = "main" | "send" | "receive";

export default function WalletModal({ onClose }: WalletModalProps) {
  const { address, chain } = useAccount();
  const { loggedUser } = useAuth();

  const chainId = chain?.id ?? 8453;
  const tokensForNetwork = useMemo(() => getTokensForNetwork(chainId), [chainId]);
  const defaultToken = useMemo(
    () => getDefaultTokenForNetwork(chainId) ?? tokensForNetwork[0],
    [chainId, tokensForNetwork]
  );

  const [selectedTokenId, setSelectedTokenId] = useState<string>(defaultToken?.id ?? "eth");

  useEffect(() => {
    if (defaultToken) {
      setSelectedTokenId(defaultToken.id);
    }
  }, [defaultToken]);

  const selectedToken = tokensForNetwork.find((token) => token.id === selectedTokenId) ?? defaultToken;

  const erc20Tokens = useMemo(
    () => tokensForNetwork.filter((token) => !token.isNative),
    [tokensForNetwork]
  );

  // ETH balance (native)
  const { data: nativeBalance } = useBalance({ address });

  const erc20Contracts = useMemo(() => {
    if (!address) return [];
    return erc20Tokens.map((token) => ({
      address: token.address as `0x${string}`,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [address as `0x${string}`],
    }));
  }, [erc20Tokens, address]);

  const { data: erc20BalancesData } = useReadContracts({
    contracts: erc20Contracts,
    query: {
      enabled: erc20Contracts.length > 0,
    },
  });

  const { data: erc20Decimals } = useReadContract({
    address: selectedToken && !selectedToken.isNative ? selectedToken.address : undefined,
    abi: ERC20_ABI,
    functionName: "decimals",
    query: {
      enabled: !!selectedToken && !selectedToken.isNative,
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

  const tokenBalances = useMemo(() => {
    const map: Record<string, string> = {};
    tokensForNetwork.forEach((token) => {
      if (token.isNative) {
        map[token.id] = nativeBalance ? formatEther(nativeBalance.value) : "0";
      } else {
        const idx = erc20Tokens.findIndex((t) => t.id === token.id);
        const balanceResult = erc20BalancesData?.[idx]?.result as bigint | undefined;
        map[token.id] = balanceResult
          ? formatUnits(balanceResult, token.decimals)
          : "0";
      }
    });
    return map;
  }, [tokensForNetwork, nativeBalance, erc20Tokens, erc20BalancesData]);

  const decimals = selectedToken?.isNative
    ? 18
    : erc20Decimals
    ? Number(erc20Decimals)
    : selectedToken?.decimals ?? 18;

  // Get current balance based on selected token
  const getCurrentBalance = () => {
    if (!selectedToken) return "0";
    return tokenBalances[selectedToken.id] ?? "0";
  };

  const formatBalanceDisplay = (balance: string, token?: TokenConfig | null) => {
    const precision = token?.isNative ? 4 : 2;
    const numericBalance = parseFloat(balance);
    if (Number.isNaN(numericBalance)) return (0).toFixed(precision);
    return numericBalance.toFixed(precision);
  };

  // Format balance for display
  const formattedBalance = formatBalanceDisplay(getCurrentBalance(), selectedToken);

  const TokenSelector = () => (
    <div className="bg-gray-900 rounded-lg p-3">
      <div className="flex flex-col gap-2">
        {tokensForNetwork.map((token) => {
          const tokenBalance = formatBalanceDisplay(tokenBalances[token.id] ?? "0", token);
          const isSelected = selectedTokenId === token.id;
          return (
            <button
              key={token.id}
              onClick={() => setSelectedTokenId(token.id)}
              className={`w-full rounded-lg border px-4 py-3 text-left transition-colors flex items-center justify-between gap-4 ${
                isSelected
                  ? "border-[#795AFF] bg-[#795AFF]/10 text-white"
                  : "border-gray-800 text-gray-300 hover:text-white hover:border-gray-600"
              }`}
            >
              <div>
                <p className="font-semibold">{token.symbol}</p>
                <p className="text-xs text-gray-400">{token.name}</p>
              </div>
              <div className="text-right">
                <p className="font-semibold text-white">{tokenBalance}</p>
                <p className="text-xs text-gray-400">{token.symbol}</p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );

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
      if (selectedToken?.isNative) {
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
      } else if (selectedToken) {
        // Send ERC20
        if (!decimals) {
          setLocalError("Unable to get token decimals");
          return;
        }

        const amountInUnits = parseUnits(sendAmount, decimals);
        
        await writeContractAsync({
          address: selectedToken.address as `0x${string}`,
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
              ? `Send ${selectedToken?.symbol ?? ""}` 
              : viewMode === "receive" 
              ? `Receive ${selectedToken?.symbol ?? ""}` 
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
            <TokenSelector />

            {/* Balance Display */}
            <div className="bg-gray-900 rounded-lg p-4 text-center">
              <p className="text-gray-400 text-sm mb-1">Balance</p>
              <p className="text-2xl font-bold text-white">
                {formattedBalance} {selectedToken?.symbol ?? ""}
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
            <TokenSelector />

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
                Amount ({selectedToken?.symbol ?? ""})
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={sendAmount}
                  onChange={(e) => setSendAmount(e.target.value)}
                  placeholder="0.0"
                  step={selectedToken?.isNative ? "0.000001" : "0.01"}
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
                Available: {formattedBalance} {selectedToken?.symbol ?? ""}
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
              {isSending ? `Sending ${selectedToken?.symbol ?? ""}...` : `Send ${selectedToken?.symbol ?? ""}`}
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
            <TokenSelector />

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
              Share this address to receive {selectedToken?.symbol ?? ""}. Only send {selectedToken?.symbol ?? ""} on this network.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
