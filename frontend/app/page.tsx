"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useMiniKit } from "@coinbase/onchainkit/minikit";
import { useRouter } from "next/navigation";
import { useQuiz } from "@/lib/quiz-context";
import { useSupabase } from "@/lib/supabase-context";
import { sdk } from "@farcaster/miniapp-sdk";
import { useAuth } from "@/lib/use-auth";
import WalletModal from "@/components/WalletModal";
import { generateQuizViaAI } from "@/lib/supabase-client";
import { extractPdfText, extractTextFile } from "@/lib/utils";
import type { GenerateQuizResponse } from "@/lib/backend-types";
import { getTokensForNetwork } from "@/lib/token-config";

export default function Home() {
  const { isFrameReady, setFrameReady } = useMiniKit();
  const [gamePin, setGamePin] = useState("");
  const router = useRouter();
  const { supabase } = useSupabase();
  const [error, setError] = useState("");
  const { findGameByRoomCode } = useQuiz();
  const [isJoining, setIsJoining] = useState(false);
  const [isPinFocused, setIsPinFocused] = useState(false);

  // Use the shared authentication hook
  const {
    loggedUser,
    isAuthLoading,
    authError,
    triggerAuth,
    signatureModal,
    authFlowState,
    isMiniapp,
    miniappClient,
    isWalletReady,
  } = useAuth();

  // Badge text state
  const [badgeText, setBadgeText] = useState<{
    primary: string | null;
    secondary: string | null;
    statusColor?: string;
  }>({
    primary: "Connecting...",
    secondary: null,
    statusColor: "#fbbf24",
  });
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [showQuickMenu, setShowQuickMenu] = useState(false);
  const [showMethodModal, setShowMethodModal] = useState(false);
  const [showAiModal, setShowAiModal] = useState(false);
  const [isAddingMiniApp, setIsAddingMiniApp] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiForm, setAiForm] = useState({
    topic: "",
    questionCount: 5,
    difficulty: "medium" as "easy" | "medium" | "hard",
    context: "",
    documents: [] as { name: string; content: string }[],
  });

  type NextPublicSession = {
    quizId: string;
    title: string;
    scheduled_start_time: string;
    room_code: string | null;
    prize_amount?: number | null;
    prize_token?: string | null; // contract address
    network_id?: number | null;
  };

  const [nextSession, setNextSession] = useState<NextPublicSession | null>(
    null
  );
  const [timeRemainingMs, setTimeRemainingMs] = useState<number | null>(null);

  const isFarcasterMiniapp = Boolean(isMiniapp && miniappClient === "farcaster");

  // Fetch next upcoming public quiz (and its room code)
  useEffect(() => {
    let cancelled = false;

    const fetchNextSession = async () => {
      try {
        console.log("[Home] Fetching next public quiz session...");
        const nowIso = new Date().toISOString();
        // First, find the next public scheduled quiz
        const { data: quizzes, error: quizError } = await supabase
          .from("quizzes")
          .select(
            "id,title,scheduled_start_time,is_private,status,prize_amount,prize_token,network_id"
          )
          .eq("is_private", false)
          .not("scheduled_start_time", "is", null)
          .gt("scheduled_start_time", nowIso)
          .in("status", ["pending", "starting"])
          .order("scheduled_start_time", { ascending: true })
          .limit(1);

        if (quizError) {
          console.error("Error fetching next public quiz:", quizError);
          return;
        }

        const quizRow = (quizzes || [])[0] as
          | {
              id: string;
              title: string;
              scheduled_start_time: string | null;
              prize_amount?: number | null;
              prize_token?: string | null;
              network_id?: number | null;
            }
          | undefined;

        console.log("[Home] Next quiz candidate:", quizRow);

        if (!quizRow || !quizRow.scheduled_start_time) {
          console.log("[Home] No suitable quiz found for banner.");
          if (!cancelled) {
            setNextSession(null);
            setTimeRemainingMs(null);
          }
          return;
        }

        // Then, find a waiting/starting game session for that quiz to get the room code
        const { data: sessions, error: sessionError } = await supabase
          .from("game_sessions")
          .select("room_code,status,created_at")
          .eq("quiz_id", quizRow.id)
          .in("status", ["waiting", "starting"])
          .order("created_at", { ascending: true })
          .limit(1);

        if (sessionError) {
          console.error("Error fetching game session for quiz:", sessionError);
          return;
        }

        const sessionRow = (sessions || [])[0] as
          | { room_code: string; status: string }
          | undefined;

        console.log("[Home] Session candidate for quiz:", sessionRow);

        if (!sessionRow) {
          // No active session yet – don't show banner
          console.log(
            "[Home] No waiting/starting session for quiz; hiding banner."
          );
          if (!cancelled) {
            setNextSession(null);
            setTimeRemainingMs(null);
          }
          return;
        }

        const scheduledTime = new Date(quizRow.scheduled_start_time).getTime();
        const diff = scheduledTime - Date.now();
        if (diff <= 0) {
          console.log(
            "[Home] Scheduled quiz time already passed; hiding banner."
          );
          if (!cancelled) {
            setNextSession(null);
            setTimeRemainingMs(null);
          }
          return;
        }

        if (!cancelled) {
          console.log("[Home] Setting nextSession/banner data", {
            quizId: quizRow.id,
            title: quizRow.title,
            scheduled_start_time: quizRow.scheduled_start_time,
            room_code: sessionRow.room_code ?? null,
            diffMs: diff,
          });
          setNextSession({
            quizId: quizRow.id,
            title: quizRow.title,
            scheduled_start_time: quizRow.scheduled_start_time,
            room_code: sessionRow.room_code ?? null,
            prize_amount: quizRow.prize_amount ?? null,
            prize_token: quizRow.prize_token ?? null,
            network_id: quizRow.network_id ?? null,
          });
          setTimeRemainingMs(diff);
        }
      } catch (err) {
        console.error(
          "Unexpected error loading next public quiz session:",
          err
        );
      }
    };

    console.log("[Home] useEffect[supabase] running", {
      hasSupabase: Boolean(supabase),
    });

    if (!supabase) {
      console.warn("[Home] Supabase client not available, skipping fetch.");
      return;
    }
    fetchNextSession();

    return () => {
      cancelled = true;
    };
  }, [supabase]);

  // Countdown timer for the next session
  useEffect(() => {
    if (!nextSession || !nextSession.scheduled_start_time) {
      return;
    }

    const scheduledTime = new Date(nextSession.scheduled_start_time).getTime();

    const update = () => {
      const diff = scheduledTime - Date.now();
      if (diff <= 0) {
        setTimeRemainingMs(0);
        return false;
      }
      setTimeRemainingMs(diff);
      return true;
    };

    // Run once immediately
    if (!update()) return;

    const interval = setInterval(() => {
      const keepRunning = update();
      if (!keepRunning) {
        clearInterval(interval);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [nextSession]);

  const formatTimeRemaining = (ms: number) => {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const parts = [
      hours.toString().padStart(2, "0"),
      minutes.toString().padStart(2, "0"),
      seconds.toString().padStart(2, "0"),
    ];
    return parts.join(":");
  };

  const getPrizeLabel = (session: NextPublicSession) => {
    if (
      session.prize_amount == null ||
      !session.prize_token ||
      !session.network_id
    ) {
      return null;
    }

    const tokens = getTokensForNetwork(session.network_id);
    const token = tokens.find(
      (t) => t.address.toLowerCase() === session.prize_token!.toLowerCase()
    );

    if (!token) {
      return null;
    }

    return `${session.prize_amount} ${token.symbol}`;
  };

  // Initialize the miniapp
  useEffect(() => {
    if (!isFrameReady) {
      setFrameReady();
    }

    // Force the body to have a black background
    document.body.style.backgroundColor = "black";

    // Call sdk.actions.ready() to hide splash screen and display content
    // This is required for Farcaster Mini Apps
    const initializeFarcasterSDK = async () => {
      try {
        await sdk.actions.ready();
        console.log("✅ Farcaster SDK ready - splash screen hidden");
      } catch (error) {
        console.error("❌ Error initializing Farcaster SDK:", error);
      }
    };
    if (!isFrameReady) {
      initializeFarcasterSDK();
    }

    // Cleanup function to reset the background color when component unmounts
    return () => {
      document.body.style.backgroundColor = "";
    };
  }, [setFrameReady, isFrameReady]);

  // Effect 1: Handle loading state
  useEffect(() => {
    if (isAuthLoading) {
      setBadgeText({
        primary: "Connecting...",
        secondary: null,
        statusColor: "#fbbf24", // Yellow for loading
      });
    }
  }, [isAuthLoading]);

  // Effect 2: Handle error state
  useEffect(() => {
    if (authError && !isAuthLoading) {
      setBadgeText({
        primary: "Not Connected",
        secondary: null,
        statusColor: "#ef4444", // Red for error
      });
    }
  }, [authError, isAuthLoading]);

  // Effect 3: Handle authenticated user data
  useEffect(() => {
    if (loggedUser?.isAuthenticated) {
      // ← Add the isAuthenticated check
      let primary: string | null = null;
      let secondary: string | null = null;
      let statusColor = "#4ade80"; // Green for connected

      // Check if user is authenticated and has data
      if (loggedUser.session?.user?.user_metadata?.display_name) {
        primary = loggedUser.session.user.user_metadata.display_name;
      }

      // Add Farcaster badge if user has FID
      if (loggedUser.fid || loggedUser.session?.user?.user_metadata?.fid) {
        secondary = "Farcaster";
      }

      // Add wallet address as tertiary info
      if (loggedUser.address) {
        const walletInfo = `${loggedUser.address.slice(
          0,
          6
        )}...${loggedUser.address.slice(-4)}`;
        if (secondary) {
          secondary = `${secondary} • ${walletInfo}`;
        } else {
          secondary = walletInfo;
        }
      } else if (!secondary) {
        secondary = "No wallet connected";
        statusColor = "#ef4444"; // Red for not connected
      }

      setBadgeText({
        primary: primary,
        secondary: secondary || null,
        statusColor: statusColor,
      });
    }
  }, [loggedUser]);

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();

    if (gamePin.trim() && !isJoining) {
      setIsJoining(true);
      setError("");

      try {
        // Find game session by room code
        const gameSession = await findGameByRoomCode(
          gamePin.trim().toUpperCase()
        );

        if (gameSession) {
          // Navigate to lobby with room code
          router.push(`/quiz/lobby/${gamePin.trim().toUpperCase()}`);
        } else {
          // Game session not found
          setError(
            `Game with PIN "${gamePin}" not found. Check the PIN and try again.`
          );
          setTimeout(() => setError(""), 5000);
        }
      } catch (err) {
        console.error("Error joining game:", err);
        setError("Error joining game. Please try again.");
        setTimeout(() => setError(""), 5000);
      } finally {
        setIsJoining(false);
      }
    }
  };

  const handleAuthenticate = async () => {
    if (authFlowState === "signing" || authFlowState === "checking") {
      return;
    }
    await triggerAuth(8453);
  };

  const handleGenerateQuiz = async () => {
    if (!aiForm.topic.trim()) {
      return;
    }

    try {
      setIsGenerating(true);

      const response: GenerateQuizResponse = await generateQuizViaAI(
        aiForm.topic,
        aiForm.questionCount,
        aiForm.difficulty,
        aiForm.context || undefined,
        aiForm.documents.length > 0 ? aiForm.documents : undefined
      );

      if (response.success && response.quiz) {
        // Encode the quiz data in the URL to pass to admin page
        const quizData = encodeURIComponent(
          JSON.stringify({
            title: response.quiz.title || aiForm.topic,
            description: response.quiz.description,
            questions: response.quiz.questions,
          })
        );

        // Navigate to admin page with quiz data
        router.push(`/quiz/admin?aiQuiz=${quizData}`);
      }
    } catch (err) {
      console.error("Error generating quiz:", err);
      setIsGenerating(false);
      setShowAiModal(false);
      // Show error - could add error state here
    }
  };

  const handleNotifyMeClick = async () => {
    if (!isFarcasterMiniapp || isAddingMiniApp) {
      return;
    }

    try {
      setIsAddingMiniApp(true);
      await sdk.actions.addMiniApp();
      console.log("✅ Requested to add Mini App via Farcaster");
    } catch (error) {
      console.error("❌ Failed to add Mini App via Farcaster", error);
    } finally {
      setIsAddingMiniApp(false);
    }
  };

  const handleFileUpload = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const newDocuments: { name: string; content: string }[] = [];

    for (
      let i = 0;
      i < Math.min(files.length, 3 - aiForm.documents.length);
      i++
    ) {
      const file = files[i];
      if (file.size > 5 * 1024 * 1024) {
        continue;
      }

      try {
        let content: string;
        if (file.type === "application/pdf") {
          content = await extractPdfText(file);
        } else if (file.type.startsWith("text/")) {
          content = await extractTextFile(file);
        } else {
          continue;
        }

        newDocuments.push({
          name: file.name,
          content,
        });
      } catch (err) {
        console.error(`Error processing file ${file.name}:`, err);
      }
    }

    if (newDocuments.length > 0) {
      setAiForm({
        ...aiForm,
        documents: [...aiForm.documents, ...newDocuments],
      });
    }

    event.target.value = "";
  };

  const handleRemoveDocument = (index: number) => {
    setAiForm({
      ...aiForm,
      documents: aiForm.documents.filter((_, i) => i !== index),
    });
  };

  // Check if wallet is ready (for miniapp context)
  const walletNotReady = isMiniapp && !isWalletReady;
  const isAuthActionDisabled =
    isAuthLoading ||
    authFlowState === "signing" ||
    authFlowState === "checking" ||
    walletNotReady;

  const prizeLabel = nextSession ? getPrizeLabel(nextSession) : null;

  return (
    <div
      style={{
        minHeight: "100vh",
        width: "100%",
        backgroundColor: "black",
        color: "white",
        position: "relative",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      {/* Background network effect */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundImage: "url('/network-bg.svg')",
          backgroundSize: "cover",
          backgroundPosition: "center",
          opacity: 0.4,
          zIndex: 0,
        }}
      />

      {/* Farcaster Auth / Quick Menu trigger in top right corner */}
      <div
        style={{
          position: "absolute",
          top: "1rem",
          right: "1rem",
          zIndex: 10,
        }}
      >
        <button
          type="button"
          onClick={() => setShowQuickMenu(true)}
          style={{
            backgroundColor: "#795AFF",
            color: "white",
            padding: "0.5rem 1rem",
            borderRadius: "0.5rem",
            fontSize: "0.875rem",
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            cursor: "pointer",
            transition: "opacity 0.2s, transform 0.2s",
            opacity:
              loggedUser?.isAuthenticated && loggedUser?.address ? 1 : 0.7,
            border: "none",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.opacity = "0.9";
            e.currentTarget.style.transform = "scale(1.02)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.opacity = "1";
            e.currentTarget.style.transform = "scale(1)";
          }}
        >
          {/* Status dot */}
          <div
            style={{
              width: "8px",
              height: "8px",
              borderRadius: "50%",
              backgroundColor: badgeText.statusColor || "#4ade80",
            }}
          ></div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "0.125rem",
            }}
          >
            {badgeText.primary && <div>{badgeText.primary}</div>}
            {badgeText.secondary &&
              !badgeText.secondary.includes("Farcaster") && (
                <div style={{ fontSize: "0.75rem", opacity: 0.8 }}>
                  {badgeText.secondary}
                </div>
              )}
          </div>
          {/* Burger / menu icon */}
          <div
            style={{
              marginLeft: "0.25rem",
              fontSize: "1rem",
              opacity: 0.9,
            }}
          >
            ☰
          </div>
        </button>
      </div>

      {/* Logo and description */}
      <div
        style={{
          position: "absolute",
          top: "2rem",
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 10,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        <img
          src="/Logo.png"
          alt="Hoot Logo"
          style={{
            height: "230px",
            width: "auto",
          }}
        />
        {/* Description text - hide when PIN input is focused */}
        {!isPinFocused && (
          <p
            style={{
              color: "white",
              fontSize: "0.8rem",
              textAlign: "center",
              lineHeight: "1.3",
              opacity: 0.9,
              marginTop: "0.05rem",
              width: "250px",
            }}
          >
            You can use Hoot to join an existing quiz or to create new ones
          </p>
        )}
      </div>

      {/* Main content */}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          width: "100%",
          maxWidth: "400px",
          padding: "0 1.5rem",
          marginTop: "200px", // Reduced margin to move content higher
        }}
      >
        {/* Section 1 - Game pin input form */}
        <div
          style={{
            width: "100%",
            background:
              "linear-gradient(135deg, rgba(121, 90, 255, 0.1) 0%, rgba(121, 90, 255, 0.05) 100%)",
            borderRadius: "0.75rem",
            padding: "1.5rem",
            marginBottom: "1.5rem",
            border:
              gamePin.trim().length === 6
                ? "3px solid rgba(121, 90, 255, 0.8)"
                : "3px solid rgba(121, 90, 255, 0.2)",
            boxShadow:
              gamePin.trim().length === 6
                ? "0 8px 32px rgba(121, 90, 255, 0.4)"
                : "0 8px 32px rgba(121, 90, 255, 0.1)",
            transition: "border 0.2s ease, boxShadow 0.2s ease",
          }}
        >
          {/* Section label */}
          <div
            style={{
              color: "#795AFF",
              fontSize: "0.75rem",
              fontWeight: "500",
              marginBottom: "1rem",
              textAlign: "center",
            }}
          ></div>

          <form onSubmit={handleJoin} style={{ width: "100%" }}>
            <input
              type="text"
              value={gamePin}
              onChange={(e) => {
                const value = e.target.value
                  .toUpperCase()
                  .replace(/[^A-Z0-9]/g, "");
                if (value.length <= 6) {
                  setGamePin(value);
                }
              }}
              onFocus={() => setIsPinFocused(true)}
              onBlur={() => setIsPinFocused(false)}
              placeholder="Insert PIN"
              maxLength={6}
              style={{
                width: "100%",
                padding: "0.75rem",
                background:
                  "linear-gradient(135deg, rgba(121, 90, 255, 0.3) 0%, rgba(121, 90, 255, 0.2) 100%)",
                color: "white",
                border: `1px solid ${
                  gamePin.length === 6
                    ? "rgba(34, 197, 94, 0.5)"
                    : "rgba(121, 90, 255, 0.3)"
                }`,
                borderRadius: "0.5rem",
                marginBottom: "0.75rem",
                textAlign: "center",
                fontSize: "1rem",
                backdropFilter: "blur(5px)",
              }}
            />

            <button
              type="submit"
              disabled={isJoining || gamePin.trim().length !== 6}
              style={{
                width: "100%",
                padding: "0.75rem",
                backgroundColor:
                  isJoining || gamePin.trim().length !== 6
                    ? "rgba(121, 90, 255, 0.3)"
                    : "#795AFF",
                color: "white",
                border: "none",
                borderRadius: "0.5rem",
                cursor:
                  isJoining || gamePin.trim().length !== 6
                    ? "not-allowed"
                    : "pointer",
                fontSize: "1rem",
                fontWeight: "500",
                opacity: isJoining || gamePin.trim().length !== 6 ? 0.7 : 1,
              }}
            >
              {isJoining ? "Joining..." : "Join"}
            </button>
          </form>
        </div>

        {/* Error message */}
        {error && (
          <div
            style={{
              backgroundColor: "rgba(239, 68, 68, 0.2)",
              border: "1px solid #ef4444",
              borderRadius: "0.5rem",
              padding: "0.75rem",
              marginBottom: "2rem",
              width: "100%",
              textAlign: "center",
              color: "#fca5a5",
            }}
          >
            {error}
          </div>
        )}

        {/* Create quiz button */}
        {isAuthLoading ? (
          // Show loading state while checking authentication
          <div
            style={{
              width: "100%",
              padding: "0.75rem",
              backgroundColor: "rgba(121, 90, 255, 0.3)",
              color: "white",
              border: "none",
              borderRadius: "0.5rem",
              fontSize: "1rem",
              fontWeight: "500",
              textAlign: "center",
              opacity: 0.7,
            }}
          >
            Loading...
          </div>
        ) : loggedUser?.isAuthenticated && loggedUser?.session ? (
          // User is authenticated - show button that opens modal
          <button
            onClick={() => setShowMethodModal(true)}
            disabled={gamePin.trim().length === 6}
            style={{
              width: "100%",
              padding: "0.75rem",
              backgroundColor:
                gamePin.trim().length === 6
                  ? "rgba(121, 90, 255, 0.3)"
                  : "#795AFF",
              color: "white",
              border: "none",
              borderRadius: "0.5rem",
              cursor: gamePin.trim().length === 6 ? "not-allowed" : "pointer",
              fontSize: "1rem",
              fontWeight: "500",
              marginBottom: "0",
              textAlign: "center",
              opacity: gamePin.trim().length === 6 ? 0.7 : 1,
            }}
          >
            Create Quiz
          </button>
        ) : (
          // User is not authenticated - show disabled button or prompt to connect
          <div style={{ width: "100%" }}>
            <button
              disabled={!!isAuthActionDisabled}
              onClick={() => handleAuthenticate()}
              style={{
                width: "100%",
                padding: "0.75rem",
                backgroundColor: isAuthActionDisabled
                  ? "rgba(121, 90, 255, 0.4)"
                  : "#795AFF",
                color: "white",
                border: "none",
                borderRadius: "0.5rem",
                fontSize: "1rem",
                fontWeight: "500",
                textAlign: "center",
                cursor: isAuthActionDisabled ? "not-allowed" : "pointer",
                opacity: isAuthActionDisabled ? 0.7 : 1,
                transition: "opacity 0.2s",
              }}
              onMouseEnter={(e) => {
                if (!isAuthActionDisabled) {
                  e.currentTarget.style.opacity = "0.8";
                }
              }}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
            >
              {walletNotReady
                ? "Waiting for wallet..."
                : isAuthActionDisabled
                ? "Connecting..."
                : "Connect To Hoot & Create Quiz"}
            </button>
            {walletNotReady && (
              <p
                style={{
                  marginTop: "0.5rem",
                  fontSize: "0.75rem",
                  color: "#9ca3af",
                  textAlign: "center",
                }}
              >
                Please wait while your wallet initializes...
              </p>
            )}
          </div>
        )}

        {/* Help text */}
        <div
          style={{
            textAlign: "center",
            color: "#6b7280",
            fontSize: "0.875rem",
            lineHeight: "1.5",
          }}
        >
          <p>
            Need help?
            <a
              href="https://t.me/hoot_quiz"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                color: "#6b7280",
                textDecoration: "underline",
                cursor: "pointer",
                marginLeft: "0.25rem",
              }}
            >
              Contact us
            </a>
          </p>
        </div>
      </div>

      {/* Signature confirmation modal */}
      {signatureModal}

      {/* Wallet Modal */}
      {showWalletModal && (
        <WalletModal onClose={() => setShowWalletModal(false)} />
      )}

      {/* Quick Menu Bottom Sheet */}
      {showQuickMenu && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
            zIndex: 60,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowQuickMenu(false);
            }
          }}
        >
          <div
            style={{
              backgroundColor: "#000",
              border: "1px solid white",
              borderTopLeftRadius: "0.75rem",
              borderTopRightRadius: "0.75rem",
              padding: "1.5rem",
              width: "100%",
              maxWidth: "28rem",
              margin: "0 1rem",
              marginBottom: 0,
              position: "relative",
            }}
          >
            <button
              onClick={() => setShowQuickMenu(false)}
              style={{
                position: "absolute",
                top: "1rem",
                right: "1rem",
                color: "white",
                background: "none",
                border: "none",
                cursor: "pointer",
                fontSize: "1.25rem",
              }}
            >
              ×
            </button>

            <div style={{ textAlign: "center", marginBottom: "1.5rem" }}>
              <h3
                style={{
                  color: "white",
                  fontSize: "1.125rem",
                  fontWeight: 600,
                  marginBottom: "0.5rem",
                }}
              >
                Quick Actions
              </h3>
              <p style={{ color: "#d1d5db", fontSize: "0.875rem" }}>
                Jump to your quizzes or open your wallet
              </p>
            </div>

            <div
              style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
            >
              {/* Your Quizzes */}
              <button
                type="button"
                onClick={() => {
                  setShowQuickMenu(false);
                  router.push("/quiz/admin/my-quizzes");
                }}
                style={{
                  width: "100%",
                  padding: "1rem",
                  backgroundColor: "rgba(121, 90, 255, 0.4)",
                  border: "2px solid #795AFF",
                  borderRadius: "0.5rem",
                  color: "white",
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <div
                  style={{
                    fontWeight: 600,
                    fontSize: "1.125rem",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                  }}
                >
                  <span>📚</span>
                  <span>Your quizzes</span>
                </div>
                <div
                  style={{
                    fontSize: "0.875rem",
                    color: "#c084fc",
                    marginTop: "0.25rem",
                  }}
                >
                  View and manage the quizzes you have created
                </div>
              </button>

              {/* Wallet */}
              <button
                type="button"
                onClick={() => {
                  // Mirror the existing badge behavior:
                  // only open wallet if the user is authenticated and has a wallet address
                  if (loggedUser?.isAuthenticated && loggedUser?.address) {
                    setShowQuickMenu(false);
                    setShowWalletModal(true);
                  }
                }}
                style={{
                  width: "100%",
                  padding: "1rem",
                  backgroundColor: "rgba(31, 41, 55, 0.9)",
                  border: "1px solid #4b5563",
                  borderRadius: "0.5rem",
                  color: "white",
                  cursor: "pointer",
                  textAlign: "left",
                  opacity:
                    loggedUser?.isAuthenticated && loggedUser?.address ? 1 : 0.7,
                }}
              >
                <div
                  style={{
                    fontWeight: 600,
                    fontSize: "1.125rem",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                  }}
                >
                  <span>👛</span>
                  <span>Wallet</span>
                </div>
                <div
                  style={{
                    fontSize: "0.875rem",
                    color: "#d1d5db",
                    marginTop: "0.25rem",
                  }}
                >
                  {loggedUser?.isAuthenticated && loggedUser?.address
                    ? "Open your wallet to view balances and activity"
                    : "Connect and create your wallet first to open it here"}
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Method Chooser Modal */}
      {showMethodModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
            zIndex: 50,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget && !isGenerating) {
              setShowMethodModal(false);
            }
          }}
        >
          <div
            style={{
              backgroundColor: "#000",
              border: "1px solid white",
              borderTopLeftRadius: "0.5rem",
              borderTopRightRadius: "0.5rem",
              padding: "1.5rem",
              width: "100%",
              maxWidth: "28rem",
              margin: "0 1rem",
              marginBottom: 0,
              position: "relative",
            }}
          >
            <button
              onClick={() => {
                if (!isGenerating) {
                  setShowMethodModal(false);
                }
              }}
              disabled={isGenerating}
              style={{
                position: "absolute",
                top: "1rem",
                right: "1rem",
                color: isGenerating ? "#6b7280" : "white",
                background: "none",
                border: "none",
                cursor: isGenerating ? "not-allowed" : "pointer",
                fontSize: "1.25rem",
              }}
            >
              ×
            </button>
            <div style={{ textAlign: "center", marginBottom: "1.5rem" }}>
              <h3
                style={{
                  color: "white",
                  fontSize: "1.125rem",
                  fontWeight: 600,
                  marginBottom: "0.5rem",
                }}
              >
                Create Quiz
              </h3>
              <p style={{ color: "#d1d5db", fontSize: "0.875rem" }}>
                Choose how you want to create your quiz
              </p>
            </div>

            <div
              style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
            >
              {/* AI Option - First/Primary */}
              <button
                onClick={() => {
                  setShowMethodModal(false);
                  setShowAiModal(true);
                }}
                disabled={isGenerating}
                style={{
                  width: "100%",
                  padding: "1rem",
                  backgroundColor: "rgba(121, 90, 255, 0.4)",
                  border: "2px solid #795AFF",
                  borderRadius: "0.5rem",
                  color: "white",
                  cursor: isGenerating ? "not-allowed" : "pointer",
                  opacity: isGenerating ? 0.5 : 1,
                  textAlign: "left",
                }}
              >
                <div
                  style={{
                    fontWeight: 600,
                    fontSize: "1.125rem",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                  }}
                >
                  <span>✨</span>
                  <span>Create with AI (Recommended)</span>
                </div>
                <div
                  style={{
                    fontSize: "0.875rem",
                    color: "#c084fc",
                    marginTop: "0.25rem",
                  }}
                >
                  Generate quiz questions automatically using AI
                </div>
              </button>

              {/* Manual Option */}
              <button
                onClick={() => {
                  setShowMethodModal(false);
                  router.push("/quiz/admin");
                }}
                disabled={isGenerating}
                style={{
                  width: "100%",
                  padding: "1rem",
                  backgroundColor: "rgba(121, 90, 255, 0.2)",
                  border: "1px solid #4b5563",
                  borderRadius: "0.5rem",
                  color: "white",
                  cursor: isGenerating ? "not-allowed" : "pointer",
                  opacity: isGenerating ? 0.5 : 1,
                  textAlign: "left",
                }}
              >
                <div style={{ fontWeight: 600, fontSize: "1.125rem" }}>
                  Build Manually
                </div>
                <div
                  style={{
                    fontSize: "0.875rem",
                    color: "#d1d5db",
                    marginTop: "0.25rem",
                  }}
                >
                  Create quiz questions one by one
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI Generation Modal */}
      {showAiModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
            zIndex: 50,
            overflowY: "auto",
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget && !isGenerating) {
              setShowAiModal(false);
            }
          }}
        >
          <div
            style={{
              backgroundColor: "#000",
              border: "1px solid white",
              borderTopLeftRadius: "0.5rem",
              borderTopRightRadius: "0.5rem",
              padding: "1.5rem",
              width: "100%",
              maxWidth: "28rem",
              margin: "0 1rem",
              marginBottom: 0,
              marginTop: "2rem",
              position: "relative",
            }}
          >
            <button
              onClick={() => {
                if (!isGenerating) {
                  setShowAiModal(false);
                }
              }}
              disabled={isGenerating}
              style={{
                position: "absolute",
                top: "1rem",
                right: "1rem",
                color: isGenerating ? "#6b7280" : "white",
                background: "none",
                border: "none",
                cursor: isGenerating ? "not-allowed" : "pointer",
                fontSize: "1.25rem",
              }}
            >
              ×
            </button>
            <div style={{ textAlign: "center", marginBottom: "1.5rem" }}>
              <h3
                style={{
                  color: "white",
                  fontSize: "1.125rem",
                  fontWeight: 600,
                  marginBottom: "0.5rem",
                }}
              >
                Generate Quiz with AI
              </h3>
              <p style={{ color: "#d1d5db", fontSize: "0.875rem" }}>
                Let AI create your quiz questions
              </p>
            </div>

            {isGenerating ? (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "3rem 1rem",
                  gap: "1rem",
                }}
              >
                <div
                  style={{
                    width: "3rem",
                    height: "3rem",
                    border: "4px solid rgba(121, 90, 255, 0.3)",
                    borderTopColor: "#795AFF",
                    borderRadius: "50%",
                    animation: "spin 1s linear infinite",
                  }}
                />
                <p style={{ color: "white", fontSize: "1rem" }}>
                  Generating your quiz...
                </p>
                <style>{`
                  @keyframes spin {
                    to { transform: rotate(360deg); }
                  }
                `}</style>
              </div>
            ) : (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "1rem",
                }}
              >
                {/* Topic Input */}
                <div>
                  <label
                    style={{
                      display: "block",
                      color: "white",
                      fontSize: "0.875rem",
                      fontWeight: 500,
                      marginBottom: "0.5rem",
                    }}
                  >
                    Topic <span style={{ color: "#ef4444" }}>*</span>
                  </label>
                  <input
                    type="text"
                    value={aiForm.topic}
                    onChange={(e) =>
                      setAiForm({ ...aiForm, topic: e.target.value })
                    }
                    placeholder="e.g., Ethereum, Web3, History of Bitcoin"
                    disabled={isGenerating}
                    style={{
                      width: "100%",
                      padding: "0.5rem 1rem",
                      backgroundColor: "#1f2937",
                      border: "1px solid #4b5563",
                      borderRadius: "0.5rem",
                      color: "white",
                      fontSize: "0.875rem",
                    }}
                  />
                </div>

                {/* Question Count Slider */}
                <div>
                  <label
                    style={{
                      display: "block",
                      color: "white",
                      fontSize: "0.875rem",
                      fontWeight: 500,
                      marginBottom: "0.5rem",
                    }}
                  >
                    Number of Questions: {aiForm.questionCount}
                  </label>
                  <input
                    type="range"
                    min="1"
                    max="10"
                    value={aiForm.questionCount}
                    onChange={(e) =>
                      setAiForm({
                        ...aiForm,
                        questionCount: parseInt(e.target.value),
                      })
                    }
                    disabled={isGenerating}
                    style={{
                      width: "100%",
                      height: "0.5rem",
                      backgroundColor: "#374151",
                      borderRadius: "0.25rem",
                      outline: "none",
                    }}
                  />
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: "0.75rem",
                      color: "#9ca3af",
                      marginTop: "0.25rem",
                    }}
                  >
                    <span>1</span>
                    <span>10</span>
                  </div>
                </div>

                {/* Difficulty Level */}
                <div>
                  <label
                    style={{
                      display: "block",
                      color: "white",
                      fontSize: "0.875rem",
                      fontWeight: 500,
                      marginBottom: "0.5rem",
                    }}
                  >
                    Difficulty Level
                  </label>
                  <select
                    value={aiForm.difficulty}
                    onChange={(e) =>
                      setAiForm({
                        ...aiForm,
                        difficulty: e.target.value as
                          | "easy"
                          | "medium"
                          | "hard",
                      })
                    }
                    disabled={isGenerating}
                    style={{
                      width: "100%",
                      padding: "0.5rem 1rem",
                      backgroundColor: "#1f2937",
                      border: "1px solid #4b5563",
                      borderRadius: "0.5rem",
                      color: "white",
                      fontSize: "0.875rem",
                    }}
                  >
                    <option value="easy">Easy 😇</option>
                    <option value="medium">Medium 🤔</option>
                    <option value="hard">Hard 🤬</option>
                  </select>
                </div>

                {/* Optional Context */}
                <div>
                  <label
                    style={{
                      display: "block",
                      color: "white",
                      fontSize: "0.875rem",
                      fontWeight: 500,
                      marginBottom: "0.5rem",
                    }}
                  >
                    Additional Instructions (Optional)
                  </label>
                  <textarea
                    value={aiForm.context}
                    onChange={(e) =>
                      setAiForm({ ...aiForm, context: e.target.value })
                    }
                    placeholder="e.g., Focus on technical details, Make questions challenging"
                    disabled={isGenerating}
                    rows={3}
                    style={{
                      width: "100%",
                      padding: "0.5rem 1rem",
                      backgroundColor: "#1f2937",
                      border: "1px solid #4b5563",
                      borderRadius: "0.5rem",
                      color: "white",
                      fontSize: "0.875rem",
                      resize: "none",
                    }}
                  />
                </div>

                {/* File Upload */}
                <div>
                  <label
                    style={{
                      display: "block",
                      color: "white",
                      fontSize: "0.875rem",
                      fontWeight: 500,
                      marginBottom: "0.5rem",
                    }}
                  >
                    Upload Documents (Optional)
                    <span
                      style={{
                        color: "#9ca3af",
                        fontSize: "0.75rem",
                        marginLeft: "0.5rem",
                      }}
                    >
                      PDF or text files, max 3 files, 5MB each
                    </span>
                  </label>
                  <input
                    type="file"
                    accept=".pdf,.txt,.md"
                    multiple
                    onChange={handleFileUpload}
                    disabled={isGenerating || aiForm.documents.length >= 3}
                    style={{
                      width: "100%",
                      padding: "0.5rem 1rem",
                      backgroundColor: "#1f2937",
                      border: "1px solid #4b5563",
                      borderRadius: "0.5rem",
                      color: "white",
                      fontSize: "0.875rem",
                    }}
                  />
                  {aiForm.documents.length > 0 && (
                    <div
                      style={{
                        marginTop: "0.5rem",
                        display: "flex",
                        flexDirection: "column",
                        gap: "0.5rem",
                      }}
                    >
                      {aiForm.documents.map((doc, index) => (
                        <div
                          key={index}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            backgroundColor: "#1f2937",
                            borderRadius: "0.5rem",
                            padding: "0.5rem",
                          }}
                        >
                          <span
                            style={{
                              color: "white",
                              fontSize: "0.875rem",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                              flex: 1,
                            }}
                          >
                            {doc.name}
                          </span>
                          <button
                            onClick={() => handleRemoveDocument(index)}
                            disabled={isGenerating}
                            style={{
                              marginLeft: "0.5rem",
                              color: "#ef4444",
                              background: "none",
                              border: "none",
                              cursor: isGenerating ? "not-allowed" : "pointer",
                            }}
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Generate Button */}
                <button
                  onClick={handleGenerateQuiz}
                  disabled={isGenerating || !aiForm.topic.trim()}
                  style={{
                    width: "100%",
                    padding: "1rem",
                    backgroundColor:
                      isGenerating || !aiForm.topic.trim()
                        ? "rgba(121, 90, 255, 0.3)"
                        : "#795AFF",
                    color: "white",
                    border: "none",
                    borderRadius: "0.5rem",
                    fontSize: "1rem",
                    fontWeight: 600,
                    cursor:
                      isGenerating || !aiForm.topic.trim()
                        ? "not-allowed"
                        : "pointer",
                    opacity: isGenerating || !aiForm.topic.trim() ? 0.5 : 1,
                  }}
                >
                  Generate Quiz
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Next upcoming public quiz banner */}
      {nextSession &&
        nextSession.room_code &&
        timeRemainingMs !== null &&
        timeRemainingMs > 0 && (
          <div
            style={{
              position: "fixed",
              left: 0,
              right: 0,
              bottom: 0,
              padding: "0.75rem 1rem",
              background:
                "linear-gradient(90deg, rgba(121,90,255,0.95), rgba(30,64,175,0.95))",
              borderTop: "1px solid rgba(255,255,255,0.2)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "0.75rem",
              zIndex: 40,
            }}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "0.15rem",
                minWidth: 0,
              }}
            >
              <span
                style={{
                  fontSize: "0.7rem",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  color: "#e5e7eb",
                  opacity: 0.9,
                }}
              >
                Next quiz starting soon
              </span>
              <div
                style={{
                  fontSize: "0.95rem",
                  fontWeight: 600,
                  color: "white",
                  whiteSpace: "nowrap",
                  textOverflow: "ellipsis",
                  overflow: "hidden",
                  maxWidth: "14rem",
                }}
              >
                {nextSession.title}
              </div>
              <div
                style={{
                  fontSize: "0.8rem",
                  color: "#e5e7eb",
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "0.35rem",
                  alignItems: "center",
                }}
              >
                <span>
                  Starts in{" "}
                  <span
                    style={{
                      fontFamily: "monospace",
                      fontWeight: 600,
                    }}
                  >
                    {formatTimeRemaining(timeRemainingMs)}
                  </span>
                </span>
                <span
                  style={{
                    opacity: 0.8,
                  }}
                >
                  • Room {nextSession.room_code}
                </span>
                {prizeLabel && (
                  <span
                    style={{
                      opacity: 0.9,
                    }}
                  >
                    • Prize {prizeLabel}
                  </span>
                )}
              </div>
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                flexShrink: 0,
              }}
            >
              {isFarcasterMiniapp && (
                <button
                  type="button"
                  onClick={handleNotifyMeClick}
                  disabled={isAddingMiniApp}
                  style={{
                    whiteSpace: "nowrap",
                    padding: "0.45rem 0.9rem",
                    borderRadius: "9999px",
                    border: "1px solid rgba(255,255,255,0.7)",
                    backgroundColor: "rgba(17,24,39,0.7)",
                    color: "white",
                    fontSize: "0.8rem",
                    fontWeight: 500,
                    cursor: isAddingMiniApp ? "not-allowed" : "pointer",
                    opacity: isAddingMiniApp ? 0.7 : 1,
                  }}
                >
                  {isAddingMiniApp ? "Adding..." : "🛎️"}
                </button>
              )}
              <button
                type="button"
                onClick={() =>
                  router.push(`/quiz/lobby/${nextSession.room_code}`)
                }
                style={{
                  whiteSpace: "nowrap",
                  padding: "0.55rem 1rem",
                  borderRadius: "9999px",
                  border: "1px solid rgba(255,255,255,0.9)",
                  backgroundColor: "rgba(17,24,39,0.9)",
                  color: "white",
                  fontSize: "0.85rem",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Go to lobby
              </button>
            </div>
          </div>
        )}
    </div>
  );
}
