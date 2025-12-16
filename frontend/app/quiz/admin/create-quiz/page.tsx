"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  useAccount,
  useSwitchChain,
  usePublicClient,
  useWriteContract,
  useBalance,
  useReadContract,
} from "wagmi";
import { NETWORK_TOKENS, getDefaultTokenForNetwork } from "@/lib/token-config";
import Footer from "@/components/Footer";
import { useAuth } from "@/lib/use-auth";

enum CreationStep {
  NONE = "",
  SAVING_QUIZ = "Saving quiz...",
  CREATING_ROOM = "Creating room...",
  PREPARING_BOUNTY = "Preparing bounty...",
  CHECKING_ALLOWANCE = "Checking token allowance...",
  REQUESTING_APPROVAL = "Requesting token approval...",
  WAITING_APPROVAL = "Waiting for approval confirmation...",
  CREATING_ON_CHAIN = "Creating quiz with bounty on-chain...",
}

export default function CreateQuizPage() {
  const router = useRouter();
  const {
    address,
    chain,
  } = useAccount();
  const { switchChain } = useSwitchChain();
  const publicClient = usePublicClient();
  const { data: ethBalance } = useBalance({ address });
  const { loggedUser, triggerAuth } = useAuth();

  const [bountyAmount, setBountyAmount] = useState("10");
  const [selectedCurrency, setSelectedCurrency] = useState<string>("usdc");
  const [scheduledStartTime, setScheduledStartTime] = useState<string>("");
  const [isScheduled, setIsScheduled] = useState(false);
  const [isPrivate, setIsPrivate] = useState(false);
  const [creationStep, setCreationStep] = useState<CreationStep>(CreationStep.NONE);
  const [error, setError] = useState("");

  // Get available tokens for current network
  const availableTokens = NETWORK_TOKENS[chain?.id || 8453] || [];
  const selectedToken = availableTokens.find(token => token.id === selectedCurrency);

  // Get token balance
  const tokenAddress = selectedToken?.isNative ? undefined : (selectedToken?.address as `0x${string}` | undefined);
  const { data: tokenBalance } = useBalance({
    address,
    token: tokenAddress,
  });

  const displayBalance = selectedToken?.isNative
    ? ethBalance?.formatted || "0"
    : tokenBalance?.formatted || "0";

  // Get token decimals
  const { data: tokenDecimals } = useReadContract({
    address: tokenAddress,
    abi: [
      {
        inputs: [],
        name: "decimals",
        outputs: [{ name: "", type: "uint8" }],
        stateMutability: "view",
        type: "function",
      },
    ],
    functionName: "decimals",
    query: { enabled: !!tokenAddress },
  });

  const minScheduledTime = useMemo(() => {
    const date = new Date(Date.now() + 60_000);
    const offset = date.getTimezoneOffset();
    const local = new Date(date.getTime() - offset * 60_000);
    return local.toISOString().slice(0, 16);
  }, []);

  const handleFreeQuiz = () => {
    // Save options to localStorage and navigate back to admin page
    if (typeof window !== "undefined") {
      localStorage.setItem("quizCreationOptions", JSON.stringify({
        type: "free",
        isPrivate,
        isScheduled,
        scheduledStartTime: isScheduled ? scheduledStartTime : "",
      }));
    }
    router.push("/quiz/admin?create=free");
  };

  const handleBountyQuiz = () => {
    if (!address) {
      setError("Please connect your wallet to add a bounty");
      return;
    }

    // Validate bounty amount
    const bountyAmountNum = parseFloat(bountyAmount);
    if (isNaN(bountyAmountNum) || bountyAmountNum <= 0) {
      setError("Invalid bounty amount");
      return;
    }

    // Check balance
    if (selectedToken?.isNative) {
      if (ethBalance && parseFloat(ethBalance.formatted) < bountyAmountNum) {
        setError(
          `Insufficient ${selectedToken.symbol} balance. You have ${ethBalance.formatted} ${selectedToken.symbol} but need ${bountyAmount} ${selectedToken.symbol}`
        );
        return;
      }
    } else if (selectedToken) {
      const tokenBalanceNum = parseFloat(displayBalance);
      if (tokenBalanceNum < bountyAmountNum) {
        setError(
          `Insufficient ${selectedToken.symbol} balance. You have ${displayBalance} ${selectedToken.symbol} but need ${bountyAmount} ${selectedToken.symbol}`
        );
        return;
      }
    } else {
      setError("Invalid token selection");
      return;
    }

    // Save options to localStorage and navigate back to admin page
    if (typeof window !== "undefined") {
      localStorage.setItem("quizCreationOptions", JSON.stringify({
        type: "bounty",
        isPrivate,
        isScheduled,
        scheduledStartTime: isScheduled ? scheduledStartTime : "",
        bountyAmount,
        selectedCurrency,
      }));
    }
    router.push("/quiz/admin?create=bounty");
  };

  // Update default amount when token changes
  useEffect(() => {
    if (selectedToken?.id === "usdc") {
      setBountyAmount("10");
    } else if (selectedToken?.isNative) {
      setBountyAmount("0.001");
    } else {
      setBountyAmount("100");
    }
  }, [selectedToken?.id]);

  return (
    <div
      style={{
        minHeight: "100vh",
        width: "100%",
        backgroundColor: "var(--color-background)",
        color: "var(--color-text)",
        position: "relative",
        paddingBottom: "80px",
      }}
    >
      {/* Background network effect */}
      <div className="background-network-effect"></div>

      {/* Back button */}
      <button
        onClick={() => router.back()}
        className="btn btn--secondary"
        style={{
          position: "absolute",
          top: "var(--spacing-md)",
          left: "var(--spacing-md)",
          zIndex: 10,
        }}
      >
        Back
      </button>

      {/* Main content */}
      <div
        style={{
          padding: `calc(var(--spacing-xl) + 3rem) var(--spacing-md) var(--spacing-lg)`,
          maxWidth: "600px",
          margin: "0 auto",
        }}
      >
        <div className="text-center mb-6">
          <h1 className="text-h1" style={{ marginBottom: "var(--spacing-xs)" }}>
            Choose Quiz Type
          </h1>

        </div>

        {error && (
          <div
            className="rounded-lg p-4"
            style={{
              backgroundColor: "rgba(239, 68, 68, 0.2)",
              border: "1px solid var(--color-error)",
              color: "var(--color-error)",
              textAlign: "center",
              marginBottom: "var(--spacing-md)",
            }}
          >
            {error}
          </div>
        )}

        {/* Privacy configuration */}
        <div 
          className="mb-4 rounded-lg p-4"
          style={{ 
            backgroundColor: "var(--color-surface-elevated)",
            border: "1px solid var(--color-border-light)"
          }}
        >
          <label className="flex items-start gap-3 cursor-pointer">
            <div
              onClick={() => setIsPrivate(!isPrivate)}
              style={{
                position: "relative",
                width: "44px",
                height: "24px",
                borderRadius: "12px",
                backgroundColor: isPrivate ? "var(--color-primary)" : "var(--color-background)",
                border: "1px solid rgba(255, 255, 255, 0.2)",
                cursor: "pointer",
                transition: "background-color 0.2s",
                flexShrink: 0,
                marginTop: "2px",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  top: "2px",
                  left: isPrivate ? "22px" : "2px",
                  width: "18px",
                  height: "18px",
                  borderRadius: "50%",
                  backgroundColor: "var(--color-text)",
                  transition: "left 0.2s",
                }}
              />
            </div>
            <div>
              <span className="font-medium block" style={{ color: "var(--color-text)" }}>Make this quiz private</span>
              <p className="text-body text-sm" style={{ color: "var(--color-text-secondary)", marginTop: "var(--spacing-xs)" }}>
                Only players with the room code can join.
              </p>
            </div>
          </label>
        </div>

        {/* Scheduled start configuration */}
        <div 
          className="mb-6 rounded-lg p-4"
          style={{ 
            backgroundColor: "var(--color-surface-elevated)",
            border: "1px solid var(--color-border-light)"
          }}
        >
          <label className="flex items-center gap-3 cursor-pointer">
            <div
              onClick={() => {
                setIsScheduled(!isScheduled);
                if (isScheduled) {
                  setScheduledStartTime("");
                }
              }}
              style={{
                position: "relative",
                width: "44px",
                height: "24px",
                borderRadius: "12px",
                backgroundColor: isScheduled ? "var(--color-primary)" : "var(--color-background)",
                border: "1px solid rgba(255, 255, 255, 0.2)",
                cursor: "pointer",
                transition: "background-color 0.2s",
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  position: "absolute",
                  top: "2px",
                  left: isScheduled ? "22px" : "2px",
                  width: "18px",
                  height: "18px",
                  borderRadius: "50%",
                  backgroundColor: "var(--color-text)",
                  transition: "left 0.2s",
                }}
              />
            </div>
            <span className="font-medium" style={{ color: "var(--color-text)" }}>
              Schedule this quiz to start automatically
            </span>
          </label>
          {isScheduled && (
            <div style={{ marginTop: "var(--spacing-md)", display: "flex", flexDirection: "column", gap: "var(--spacing-xs)" }}>
              <input
                type="datetime-local"
                value={scheduledStartTime}
                onChange={(e) => setScheduledStartTime(e.target.value)}
                min={minScheduledTime}
                style={{
                  width: "100%",
                  padding: "var(--spacing-sm) var(--spacing-md)",
                  backgroundColor: "var(--color-background)",
                  border: "1px solid var(--color-border)",
                  borderRadius: "var(--radius-md)",
                  color: "var(--color-text)",
                  outline: "none",
                }}
              />
              <p className="text-body text-sm" style={{ color: "var(--color-text-secondary)" }}>
                Times are shown in your local timezone. The quiz will move to
                the lobby automatically and generate a room code.
              </p>
            </div>
          )}
        </div>

        {/* Quiz Type Selection Container */}
        <div 
          className="rounded-lg p-4 mb-6"
          style={{ 
            backgroundColor: "var(--color-surface-elevated)",
            border: "1px solid var(--color-border-light)",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-md)" }}>
            {/* Quiz Bounty Option with Input */}
          <div 
            className="rounded-lg p-4"
            style={{ 
              backgroundColor: "var(--color-surface-elevated)",
              border: "1px solid var(--color-border-light)"
            }}
          >
            {/* Network Switcher */}
            <div 
              className="mb-3 rounded-lg p-3"
              style={{ 
                backgroundColor: "var(--color-surface-elevated)",
              }}
            >
              <button
                onClick={() => {
                  const newNetworkid = chain?.id === 84532 ? 8453 : 84532;
                  switchChain({ chainId: newNetworkid });
                }}
                style={{ 
                  width: "100%", 
                  display: "flex", 
                  alignItems: "center", 
                  justifyContent: "space-between",
                  padding: "var(--spacing-sm)",
                  backgroundColor: "var(--color-background)",
                  border: "none",
                  borderRadius: "var(--radius-md)",
                  color: "var(--color-text)",
                  cursor: "pointer",
                  transition: "background-color 0.2s",
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "var(--color-surface)"}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "var(--color-background)"}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-sm)" }}>
                  <div style={{ width: "12px", height: "12px", backgroundColor: "#0052FF", borderRadius: "2px", marginRight: "var(--spacing-xs)" }}></div>
                  <span className="text-body" style={{ color: "var(--color-text)", fontWeight: "500" }}>
                    {chain?.id === 84532
                      ? "Base Sepolia"
                      : chain?.id === 8453
                      ? "Base"
                      : "Base Sepolia"}
                  </span>
                </div>
                <svg
                  style={{ width: "16px", height: "16px", color: "var(--color-text-secondary)" }}
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
            <div 
              className="mb-3 rounded-lg p-3"
              style={{ 
                backgroundColor: "var(--color-surface-elevated)",
              }}
            >
              <label className="text-body" style={{ display: "block", marginBottom: "var(--spacing-xs)", fontWeight: "500", color: "var(--color-text)" }}>
                Bounty Currency
              </label>
              <div style={{ display: "flex", gap: "var(--spacing-xs)", flexWrap: "wrap" }}>
                {availableTokens.map((token) => (
                  <button
                    key={token.id}
                    onClick={() => setSelectedCurrency(token.id)}
                    style={{ 
                      fontSize: "var(--font-size-sm)",
                      padding: "var(--spacing-xs) var(--spacing-md)",
                      borderRadius: "var(--radius-md)",
                      border: "none",
                      cursor: "pointer",
                      transition: "background-color 0.2s",
                      color: "var(--color-text)",
                      fontWeight: "500",
                      backgroundColor: selectedCurrency === token.id ? "var(--color-primary)" : "var(--color-background)",
                    }}
                    onMouseEnter={(e) => {
                      if (selectedCurrency !== token.id) {
                        e.currentTarget.style.backgroundColor = "var(--color-surface)";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (selectedCurrency !== token.id) {
                        e.currentTarget.style.backgroundColor = "var(--color-background)";
                      }
                    }}
                  >
                    {token.symbol}
                  </button>
                ))}
              </div>
            </div>

            {/* Quiz Bounty Amount Input */}
            <div 
              className="rounded-lg p-3"
              style={{ 
                backgroundColor: "var(--color-surface-elevated)",
              }}
            >
              <label className="text-body" style={{ display: "block", marginBottom: "var(--spacing-xs)", fontWeight: "500", color: "var(--color-text)" }}>
                Quiz Bounty ({selectedToken?.symbol || "Tokens"})
              </label>
              <input
                type="number"
                step="1"
                min="0"
                value={bountyAmount}
                onChange={(e) => setBountyAmount(e.target.value)}
                style={{
                  width: "100%",
                  padding: "var(--spacing-sm) var(--spacing-md)",
                  backgroundColor: "var(--color-background)",
                  border: "1px solid var(--color-border)",
                  borderRadius: "var(--radius-md)",
                  color: "var(--color-text)",
                  outline: "none",
                }}
                placeholder={
                  selectedToken?.id === "usdc"
                    ? "10"
                    : selectedToken?.isNative
                    ? "0.001"
                    : "100"
                }
              />
              <div className="text-body text-sm" style={{ color: "var(--color-text-secondary)", marginTop: "var(--spacing-xs)" }}>
                Current balance:{" "}
                {parseFloat(displayBalance).toFixed(
                  selectedToken?.isNative ? 4 : 2
                )}{" "}
                {selectedToken?.symbol || "Tokens"}
              </div>
            </div>

            {/* Quiz with Bounty Button */}
            <button
              onClick={handleBountyQuiz}
              style={{ 
                width: "100%",
                padding: "var(--spacing-md)",
                backgroundColor: "var(--color-primary)",
                border: "1px solid var(--color-border-medium)",
                borderRadius: "var(--radius-md)",
                color: "var(--color-text)",
                textAlign: "left",
                marginTop: "var(--spacing-md)",
                cursor: "pointer",
                transition: "background-color 0.2s",
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "var(--color-primary-hover)"}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "var(--color-primary)"}
            >
              <div>
                <div className="text-h3" style={{ color: "var(--color-text)", fontWeight: "600" }}>Quiz with Bounty</div>
                <div className="text-body text-sm" style={{ color: "var(--color-text-secondary)" }}>
                  Add bounty from your wallet
                </div>
              </div>
            </button>
          </div>

            {/* Free Quiz Option */}
            <button
              onClick={handleFreeQuiz}
              style={{ 
                width: "100%",
                padding: "var(--spacing-md)",
                backgroundColor: "var(--color-surface-elevated)",
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-md)",
                color: "var(--color-text)",
                textAlign: "left",
                cursor: "pointer",
                transition: "background-color 0.2s",
              }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "var(--color-surface)"}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "var(--color-surface-elevated)"}
            >
              <div>
                <div className="text-h3" style={{ color: "var(--color-text)", fontWeight: "600" }}>Free Quiz</div>
                <div className="text-body text-sm" style={{ color: "var(--color-text-secondary)" }}>
                  Create quiz without bounty
                </div>
              </div>
            </button>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
}


