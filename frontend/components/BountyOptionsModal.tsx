import { useState } from "react";
import { useAccount, useSwitchChain, useBalance } from "wagmi";
import { USDC_ADDRESSES, ZERO_ADDRESS } from "@/lib/contracts";

interface BountyOptionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onFreeQuiz: () => void;
  onBountyQuiz: () => void;
  selectedCurrency: string;
  setSelectedCurrency: (currency: string) => void;
  bountyAmount: string;
  setBountyAmount: (amount: string) => void;
}

export default function BountyOptionsModal({
  isOpen,
  onClose,
  onFreeQuiz,
  onBountyQuiz,
  selectedCurrency,
  setSelectedCurrency,
  bountyAmount,
  setBountyAmount,
}: BountyOptionsModalProps) {
  const { chain } = useAccount();
  const { switchChain } = useSwitchChain();

  // Get balance for selected currency
  const { data: balance } = useBalance({
    address: undefined, // Will use connected account
    token: selectedCurrency === "usdc"
      ? (USDC_ADDRESSES[chain?.id === 8453 ? 8453 : 84532] as `0x${string}`)
      : undefined,
  });

  const displayBalance = balance ? balance.formatted : "0";

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end justify-center z-50">
      <div className="bg-black border border-white rounded-t-lg p-6 w-full max-w-md mx-4 mb-0 relative">
        {/* X button to close modal */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-white hover:text-gray-300 transition-colors z-10"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
        <div className="text-center mb-6">
          <h3 className="text-white text-lg font-semibold mb-2">
            Choose Quiz Type
          </h3>
          <p className="text-gray-300 text-sm">
            How would you like to create your quiz?
          </p>
        </div>

        <div className="space-y-4">
          {/* Free Quiz Option */}
          <button
            onClick={onFreeQuiz}
            className="w-full p-4 bg-purple-600/20 border border-gray-600 rounded-lg text-white hover:bg-purple-700 transition-colors"
          >
            <div className="text-left">
              <div className="font-semibold text-lg">Free Quiz</div>
              <div className="text-sm text-gray-300">
                Create quiz without bounty
              </div>
            </div>
          </button>

          {/* Quiz Bounty Option with Input */}
          <div className="bg-purple-600/20 rounded-lg p-4">
            <button
              onClick={onBountyQuiz}
              className="w-full p-3 bg-purple-600/40 border border-purple-500 rounded-lg text-white hover:bg-purple-700 transition-colors mb-3"
            >
              <div className="text-left">
                <div className="font-semibold">Quiz with Bounty</div>
                <div className="text-sm text-purple-200">
                  Add bounty from your wallet
                </div>
              </div>
            </button>

            {/* Network Switcher */}
            <div className="p-3 bg-purple-600/20 rounded-lg mb-3">
              <button
                onClick={() => {
                  const newNetworkid = chain?.id === 84532 ? 8453 : 84532;
                  console.log("newNetworkid", newNetworkid);
                  switchChain({ chainId: newNetworkid });
                }}
                className="w-full flex items-center justify-between p-2 bg-gray-600 hover:bg-gray-500 rounded text-white transition-colors"
              >
                <div className="flex items-center space-x-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <span className="text-sm font-medium">
                    {chain?.id === 84532
                      ? "Base Sepolia"
                      : chain?.id === 8453
                      ? "Base Mainnet"
                      : "Base Sepolia"}
                  </span>
                </div>
                <svg
                  className="w-4 h-4 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
                  />
                </svg>
              </button>
            </div>

            {/* Currency Selector */}
            <div className="p-3 bg-purple-600/20 rounded-lg mb-3">
              <label className="block text-white text-sm font-medium mb-2">
                Bounty Currency
              </label>
              <div className="flex gap-2">
                <button
                  onClick={() => setSelectedCurrency("usdc")}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    selectedCurrency === "usdc"
                      ? "bg-purple-600/40 text-white"
                      : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                  }`}
                >
                  USDC
                </button>
                <button
                  onClick={() => setSelectedCurrency("eth")}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    selectedCurrency === "eth"
                      ? "bg-purple-600/40 text-white"
                      : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                  }`}
                >
                  ETH
                </button>
              </div>
            </div>

            {/* Quiz Bounty Amount Input */}
            <div className="p-3 bg-purple-600/20 rounded-lg">
              <label className="block text-white text-sm font-medium mb-2">
                Quiz Bounty (
                {selectedCurrency === "usdc"
                  ? "USDC"
                  : selectedCurrency === "eth"
                  ? "ETH"
                  : "Tokens"}
                )
              </label>
              <input
                type="number"
                step="1"
                min="0"
                value={bountyAmount}
                onChange={(e) => setBountyAmount(e.target.value)}
                className="w-full px-3 py-2 bg-gray-600 border border-gray-500 rounded text-white focus:outline-none focus:border-purple-500"
                placeholder={
                  selectedCurrency === "usdc"
                    ? "10"
                    : selectedCurrency === "eth"
                    ? "0.001"
                    : "100"
                }
              />
              <div className="text-xs text-gray-400 mt-1">
                Current balance: {parseFloat(displayBalance).toFixed(
                  selectedCurrency === "eth" ? 4 : 2
                )} {selectedCurrency === "usdc"
                  ? "USDC"
                  : selectedCurrency === "eth"
                  ? "ETH"
                  : "Tokens"}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}