"use client";

import { useState, useEffect } from "react";
import { useMiniKit } from "@coinbase/onchainkit/minikit";
import { useRouter } from "next/navigation";
import { useQuiz } from "@/lib/quiz-context";
import { useSupabase } from "@/lib/supabase-context";
import { sdk } from "@farcaster/miniapp-sdk";
import { useAuth } from "@/lib/use-auth";
import WalletModal from "@/components/WalletModal";
import Footer from "@/components/Footer";
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
  const [showIntroModal, setShowIntroModal] = useState(false);
  const [hasSeenIntro, setHasSeenIntro] = useState(false);
  const [aiForm, setAiForm] = useState({
    topic: "",
    questionCount: 5,
    difficulty: "medium" as "easy" | "medium" | "hard",
    context: "",
    documents: [] as { name: string; content: string }[],
  });

  // Upcoming quizzes banner state
  type UpcomingQuiz = {
    quizId: string;
    title: string;
    scheduled_start_time: string;
    prize_amount?: number | null;
    prize_token?: string | null;
    network_id?: number | null;
  };
  const [upcomingQuizzes, setUpcomingQuizzes] = useState<UpcomingQuiz[]>([]);
  const [currentQuizIndex, setCurrentQuizIndex] = useState(0);
  const [timeRemaining, setTimeRemaining] = useState<Record<string, number>>({});


  const isFarcasterMiniapp = Boolean(
    isMiniapp && miniappClient === "farcaster"
  );
  const isBaseMiniapp = Boolean(isMiniapp && miniappClient === "base");
  const canEnableNotifications = isFarcasterMiniapp || isBaseMiniapp;


  // Load intro modal preference from localStorage (client-side only)
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const seen = window.localStorage.getItem("hoot_intro_seen");
      if (seen === "1") {
        setHasSeenIntro(true);
      }
    } catch (e) {
      console.warn("Failed to read intro preference from localStorage", e);
    }
  }, []);

  // Show intro modal once after user connects
  useEffect(() => {
    if (loggedUser?.isAuthenticated && !hasSeenIntro) {
      setShowIntroModal(true);
    }
  }, [loggedUser?.isAuthenticated, hasSeenIntro]);

  const closeIntroModal = () => {
    setShowIntroModal(false);
    setHasSeenIntro(true);
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem("hoot_intro_seen", "1");
      } catch (e) {
        console.warn("Failed to store intro preference in localStorage", e);
      }
    }
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

  const handleEnableNotifications = async () => {
    if (!canEnableNotifications || isAddingMiniApp) {
      return;
    }

    try {
      setIsAddingMiniApp(true);
      await sdk.actions.addMiniApp();
      console.log("✅ Requested to add Mini App for notifications", {
        miniappClient,
      });
    } catch (error) {
      console.error("❌ Failed to enable notifications via MiniApp", error);
    } finally {
      setIsAddingMiniApp(false);
    }
  };


  const openExternalUrl = (url: string | null) => {
    if (!url) {
      return;
    }

    if (isMiniapp) {
      try {
        // Prefer MiniApp SDK openUrl when available
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        (sdk as any).actions.openUrl(url);
        return;
      } catch (error) {
        console.error("Failed to open URL via MiniApp SDK, falling back", error);
      }
    }

    if (typeof window !== "undefined") {
      window.open(url, "_blank", "noopener,noreferrer");
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

  // Fetch upcoming quizzes for banner
  useEffect(() => {
    let cancelled = false;

    const fetchUpcomingQuizzes = async () => {
      if (!supabase) return;

      try {
        const nowIso = new Date().toISOString();
        
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
          .limit(10);

        if (quizError || !quizzes) {
          console.error("Error fetching upcoming quizzes:", quizError);
          if (!cancelled) setUpcomingQuizzes([]);
          return;
        }

        const quizRows = quizzes as {
          id: string;
          title: string;
          scheduled_start_time: string | null;
          prize_amount?: number | null;
          prize_token?: string | null;
          network_id?: number | null;
        }[];

        const filtered: UpcomingQuiz[] = [];
        for (const quiz of quizRows) {
          if (!quiz.scheduled_start_time) continue;
          const scheduledTime = new Date(quiz.scheduled_start_time).getTime();
          const diff = scheduledTime - Date.now();
          if (diff <= 0) continue;

          filtered.push({
            quizId: quiz.id,
            title: quiz.title,
            scheduled_start_time: quiz.scheduled_start_time,
            prize_amount: quiz.prize_amount ?? null,
            prize_token: quiz.prize_token ?? null,
            network_id: quiz.network_id ?? null,
          });
        }

        if (!cancelled) {
          setUpcomingQuizzes(filtered);
          setCurrentQuizIndex(0);
        }
      } catch (err) {
        console.error("Error loading upcoming quizzes:", err);
        if (!cancelled) setUpcomingQuizzes([]);
      }
    };

    fetchUpcomingQuizzes();

    return () => {
      cancelled = true;
    };
  }, [supabase]);

  // Countdown timer for upcoming quizzes
  useEffect(() => {
    if (upcomingQuizzes.length === 0) return;

    const updateTimers = () => {
      const newTimeRemaining: Record<string, number> = {};
      upcomingQuizzes.forEach((quiz) => {
        const scheduledTime = new Date(quiz.scheduled_start_time).getTime();
        const diff = scheduledTime - Date.now();
        newTimeRemaining[quiz.quizId] = Math.max(0, diff);
      });
      setTimeRemaining(newTimeRemaining);
    };

    updateTimers();
    const interval = setInterval(updateTimers, 1000);

    return () => clearInterval(interval);
  }, [upcomingQuizzes]);

  // Auto-scroll to next quiz every 4 seconds
  useEffect(() => {
    if (upcomingQuizzes.length <= 1) return;

    const interval = setInterval(() => {
      setCurrentQuizIndex((prev) => (prev + 1) % upcomingQuizzes.length);
    }, 4000);

    return () => clearInterval(interval);
  }, [upcomingQuizzes.length]);

  // Format time remaining
  const formatTimeRemaining = (ms: number) => {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    } else {
      return `${seconds}s`;
    }
  };

  // Get prize label
  const getPrizeLabel = (quiz: UpcomingQuiz) => {
    if (
      quiz.prize_amount == null ||
      !quiz.prize_token ||
      !quiz.network_id
    ) {
      return null;
    }

    const tokens = getTokensForNetwork(quiz.network_id);
    const token = tokens.find(
      (t) => t.address.toLowerCase() === quiz.prize_token!.toLowerCase()
    );

    if (!token) {
      return null;
    }

    return `${quiz.prize_amount} ${token.symbol}`;
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        width: "100%",
        backgroundColor: "var(--color-background)",
        color: "var(--color-text)",
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

      {/* User badge in top right corner */}
      <div
        style={{
          position: "absolute",
          top: "var(--spacing-md)",
          right: "var(--spacing-md)",
          zIndex: 10,
        }}
      >
        <div
          className="btn btn--primary"
          style={{
            opacity:
              loggedUser?.isAuthenticated && loggedUser?.address ? 1 : 0.7,
            maxWidth: "140px",
            overflow: "hidden",
            cursor: "default",
          }}
        >
          {/* Status dot */}
          <div
            style={{
              marginRight: "0.5rem",
              width: "8px",
              height: "8px",
              borderRadius: "50%",
              backgroundColor: badgeText.statusColor || "#4ade80",
              flexShrink: 0,
            }}
          ></div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "0.125rem",
              minWidth: 0,
              flex: 1,
            }}
          >
            {badgeText.primary && (
              <div
                style={{
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {badgeText.primary}
                </div>
              )}
            {badgeText.secondary &&
              !badgeText.secondary.includes("Farcaster") && (
          <div
                  className="text-caption"
            style={{
                    opacity: 0.8,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
            }}
          >
                  {badgeText.secondary}
          </div>
              )}
          </div>
        </div>
      </div>

      {/* Logo and description */}
      <div
        style={{
          position: "absolute",
          top: "var(--spacing-xl)",
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
            height: "210px",
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
              marginTop: "-3rem",
              width: "250px",
            }}
          >
            You can use Hoot joining  
            an existing <br /> quiz or to creating new ones
          </p>
        )}
      </div>

      {/* Upcoming quizzes banner */}
      {upcomingQuizzes.length > 0 && (
        <div
          className="upcoming-banner"
          onClick={() => router.push("/quiz/next")}
          style={{
            position: "absolute",
            top: "calc(var(--spacing-xl) + 240px)",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 10,
            width: "calc(100% - 2rem)",
            maxWidth: "360px",
          }}
        >
          <div className="upcoming-banner__label">Upcoming quizzes</div>
          <div className="upcoming-banner__content">
            {upcomingQuizzes[currentQuizIndex] && (
              <div
                key={currentQuizIndex}
                className="upcoming-banner__slide-item"
              >
                <div className="upcoming-banner__text">
                  {upcomingQuizzes[currentQuizIndex].title}
                </div>
                {getPrizeLabel(upcomingQuizzes[currentQuizIndex]) && (
                  <div className="upcoming-banner__bounty-wrapper">
                    <div className="upcoming-banner__bounty-label">prize</div>
                    <div className="upcoming-banner__bounty">
                      {getPrizeLabel(upcomingQuizzes[currentQuizIndex])}
                    </div>
                  </div>
                )}
                <div className="upcoming-banner__countdown-wrapper">
                  <div className="upcoming-banner__countdown-label">starts in</div>
                  <div className="upcoming-banner__countdown">
                    {formatTimeRemaining(
                      timeRemaining[upcomingQuizzes[currentQuizIndex].quizId] || 0
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

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
              "linear-gradient(135deg, var(--color-primary-light) 0%, rgba(121, 90, 255, 0.05) 100%)",
            borderRadius: "var(--radius-lg)",
            padding: "var(--spacing-lg)",
            marginBottom: "var(--spacing-lg)",
            border:
              gamePin.trim().length === 6
                ? `3px solid var(--color-primary)`
                : `3px solid var(--color-primary-medium)`,
            boxShadow:
              gamePin.trim().length === 6
                ? "var(--shadow-primary)"
                : "var(--shadow-md)",
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
              className="form-input"
              style={{
                width: "100%",
                background:
                  "linear-gradient(135deg, var(--color-primary-medium) 0%, var(--color-primary-light) 100%)",
                border: `1px solid ${
                  gamePin.length === 6
                    ? "var(--color-primary)"
                    : "var(--color-primary-medium)"
                }`,
                marginBottom: "var(--spacing-md)",
                textAlign: "center",
                backdropFilter: "blur(5px)",
                padding: "var(--spacing-md) var(--spacing-md)",
              }}
            />

            <button
              type="submit"
              disabled={isJoining || gamePin.trim().length !== 6}
              className="btn btn--primary btn--large"
              style={{ width: "100%" }}
            >
              {isJoining ? "Joining..." : "Join"}
            </button>
          </form>
        </div>

        {/* Error message */}
        {error && (
          <div
            className="card"
            style={{
              backgroundColor: "rgba(239, 68, 68, 0.2)",
              border: `1px solid var(--color-error)`,
              marginBottom: "var(--spacing-xl)",
              width: "100%",
              textAlign: "center",
              color: "var(--color-error)",
            }}
          >
            {error}
          </div>
        )}

        {/* Create quiz button */}
        {isAuthLoading ? (
          // Show loading state while checking authentication
          <div
            className="btn btn--primary btn--large"
            style={{
              width: "100%",
              opacity: 0.7,
              cursor: "not-allowed",
            }}
          >
            Loading...
          </div>
        ) : loggedUser?.isAuthenticated && loggedUser?.session ? (
          // User is authenticated - navigate directly to admin page
          <button
            onClick={() => router.push("/quiz/admin")}
            disabled={gamePin.trim().length === 6}
            className="btn btn--primary btn--large"
            style={{ width: "100%" }}
          >
            Create Quiz
          </button>
        ) : (
          // User is not authenticated - show disabled button or prompt to connect
          <div style={{ width: "100%" }}>
            <button
              disabled={!!isAuthActionDisabled}
              onClick={() => handleAuthenticate()}
              className="btn btn--primary btn--large"
              style={{ width: "100%" }}
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

      </div>

      {/* Help text - positioned near footer */}
        <div
          style={{
          position: "fixed",
          bottom: "70px",
          left: "50%",
          transform: "translateX(-50%)",
            textAlign: "center",
            color: "#6b7280",
            fontSize: "0.875rem",
            lineHeight: "1.5",
          zIndex: 1,
          width: "100%",
          maxWidth: "400px",
          padding: "0 var(--spacing-md)",
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

      {/* App intro modal – shown once after first successful connect */}
      {showIntroModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0,0,0,0.75)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 65,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              closeIntroModal();
            }
          }}
        >
          <div
            style={{
              backgroundColor: "#020617",
              borderRadius: "0.75rem",
              border: "1px solid rgba(148,163,184,0.8)",
              maxWidth: "22rem",
              width: "90%",
              padding: "1.4rem 1.25rem 1.1rem",
              position: "relative",
              boxShadow: "0 20px 50px rgba(15,23,42,0.8)",
            }}
          >
            <button
              type="button"
              onClick={closeIntroModal}
              style={{
                position: "absolute",
                top: "0.9rem",
                right: "1rem",
                background: "none",
                border: "none",
                color: "#e5e7eb",
                cursor: "pointer",
                fontSize: "1.1rem",
              }}
            >
              ×
            </button>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "0.75rem",
              }}
            >
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  textAlign: "center",
                  marginBottom: "0.25rem",
                }}
              >
                <img
                  src="/Icon_hoot.png"
                  alt="Hoot icon"
                  style={{
                    width: "64px",
                    height: "64px",
                    borderRadius: "16px",
                    marginBottom: "0.6rem",
                  }}
                />
                <h3 className="text-h2" style={{ marginBottom: "var(--spacing-xs)" }}>
                  Welcome to Hoot
                </h3>
                <p
                  className="text-body"
                  style={{
                    color: "var(--color-text-secondary)",
                    lineHeight: "var(--line-height-normal)",
                  }}
                >
                  Hoot is a crypto-native trivia platform to play, win and host quizzes.
                </p>
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "var(--spacing-sm)",
                  marginTop: "var(--spacing-xs)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "var(--spacing-xs)",
                  }}
                >
                  <span style={{ fontSize: "var(--font-size-body-lg)" }}>🎯</span>
                  <p
                    className="text-body"
                    style={{
                      lineHeight: "var(--line-height-normal)",
                      margin: 0,
                    }}
                  >
                    Participate in live trivia quizzes and win prizes in{" "}
                    <strong>USDC, ETH, JESSE</strong> and other tokens.
                  </p>
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "var(--spacing-xs)",
                  }}
                >
                  <span style={{ fontSize: "var(--font-size-body-lg)" }}>🔔</span>
                  <p
                    className="text-body"
                    style={{
                      lineHeight: "var(--line-height-normal)",
                      margin: 0,
                    }}
                  >
                    Subscribe to notifications so you know as soon as a new quiz is created.
                  </p>
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "var(--spacing-xs)",
                  }}
                >
                  <span style={{ fontSize: "var(--font-size-body-lg)" }}>🛠️</span>
                  <p
                    className="text-body"
                    style={{
                      lineHeight: "var(--line-height-normal)",
                      margin: 0,
                    }}
                  >
                    Create your own quiz, add a prize pool and engage your community or play with friends.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeIntroModal}
                className="btn btn--primary btn--large"
                style={{ marginTop: "var(--spacing-md)", width: "100%" }}
              >
                Got it, let&apos;s play
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Signature confirmation modal */}
      {signatureModal}

      {/* Wallet Modal */}
      {showWalletModal && (
        <WalletModal onClose={() => setShowWalletModal(false)} />
      )}

      {/* Quick Menu Bottom Sheet */}
      {showQuickMenu && (
        <div
          className="bottom-sheet"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowQuickMenu(false);
            }
          }}
        >
          <div className="bottom-sheet__content">
            <button
              onClick={() => setShowQuickMenu(false)}
              className="btn"
              style={{
                position: "absolute",
                top: "var(--spacing-md)",
                right: "var(--spacing-md)",
                padding: "var(--spacing-xs)",
                minWidth: "auto",
                background: "transparent",
                color: "var(--color-text)",
              }}
              aria-label="Close"
            >
              ×
            </button>

            <div style={{ textAlign: "center", marginBottom: "var(--spacing-lg)" }}>
              <h3 className="text-h2" style={{ marginBottom: "var(--spacing-xs)" }}>
                Quick Actions
              </h3>
              <p className="text-body" style={{ color: "var(--color-text-secondary)" }}>
                Jump to your quizzes or open your wallet
              </p>
            </div>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "var(--spacing-md)",
              }}
            >
              {/* Your Quizzes */}
              <button
                type="button"
                onClick={() => {
                  setShowQuickMenu(false);
                  router.push("/quiz/admin/my-quizzes");
                }}
                className="btn btn--primary btn--large"
                style={{
                  width: "100%",
                  textAlign: "left",
                  justifyContent: "flex-start",
                  flexDirection: "column",
                  alignItems: "flex-start",
                }}
              >
                <div
                  className="text-h2"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "var(--spacing-xs)",
                    marginBottom: "var(--spacing-xs)",
                  }}
                >
                  <span>📚</span>
                  <span>Your quizzes</span>
                </div>
                <div
                  className="text-body"
                  style={{
                    color: "var(--color-primary-light)",
                  }}
                >
                  View and manage the quizzes you have created
                </div>
              </button>

              {/* Wallet */}
              <button
                type="button"
                onClick={() => {
                  if (loggedUser?.isAuthenticated && loggedUser?.address) {
                    setShowQuickMenu(false);
                    setShowWalletModal(true);
                  }
                }}
                className="btn btn--secondary btn--large"
                style={{
                  width: "100%",
                  textAlign: "left",
                  justifyContent: "flex-start",
                  flexDirection: "column",
                  alignItems: "flex-start",
                  opacity:
                    loggedUser?.isAuthenticated && loggedUser?.address ? 1 : 0.7,
                }}
              >
                <div
                  className="text-h2"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "var(--spacing-xs)",
                    marginBottom: "var(--spacing-xs)",
                  }}
                >
                  <span>👛</span>
                  <span>Wallet</span>
                </div>
                <div
                  className="text-body"
                  style={{
                    color: "var(--color-text-secondary)",
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
          className="bottom-sheet"
          onClick={(e) => {
            if (e.target === e.currentTarget && !isGenerating) {
              setShowMethodModal(false);
            }
          }}
        >
          <div className="bottom-sheet__content">
            <button
              onClick={() => {
                if (!isGenerating) {
                  setShowMethodModal(false);
                }
              }}
              disabled={isGenerating}
              className="btn"
              style={{
                position: "absolute",
                top: "var(--spacing-md)",
                right: "var(--spacing-md)",
                padding: "var(--spacing-xs)",
                minWidth: "auto",
                background: "transparent",
                color: isGenerating ? "var(--color-text-muted)" : "var(--color-text)",
              }}
              aria-label="Close"
            >
              ×
            </button>
            <div style={{ textAlign: "center", marginBottom: "var(--spacing-lg)" }}>
              <h3 className="text-h2" style={{ marginBottom: "var(--spacing-xs)" }}>
                Create Quiz
              </h3>
              <p className="text-body" style={{ color: "var(--color-text-secondary)" }}>
                Choose how you want to create your quiz
              </p>
            </div>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "var(--spacing-md)",
              }}
            >
              {/* AI Option - First/Primary */}
              <button
                onClick={() => {
                  setShowMethodModal(false);
                  setShowAiModal(true);
                }}
                disabled={isGenerating}
                className="btn btn--primary btn--large"
                style={{
                  width: "100%",
                  textAlign: "left",
                  justifyContent: "flex-start",
                  flexDirection: "column",
                  alignItems: "flex-start",
                }}
              >
                <div
                  style={{
                    fontWeight: 600,
                    fontSize: "var(--font-size-h2)",
                    display: "flex",
                    alignItems: "center",
                    gap: "var(--spacing-xs)",
                    marginBottom: "var(--spacing-xs)",
                  }}
                >
                  <span>✨</span>
                  <span>Create with AI (Recommended)</span>
                </div>
                <div
                  className="text-body"
                  style={{
                    color: "var(--color-primary-light)",
                    fontSize: "var(--font-size-body)",
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
                className="btn btn--secondary btn--large"
                style={{
                  width: "100%",
                  textAlign: "left",
                  justifyContent: "flex-start",
                  flexDirection: "column",
                  alignItems: "flex-start",
                }}
              >
                <div className="text-h2" style={{ marginBottom: "var(--spacing-xs)" }}>
                  Build Manually
                </div>
                <div
                  className="text-body"
                  style={{
                    color: "var(--color-text-secondary)",
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
          className="bottom-sheet"
          style={{ overflowY: "auto" }}
          onClick={(e) => {
            if (e.target === e.currentTarget && !isGenerating) {
              setShowAiModal(false);
            }
          }}
        >
          <div className="bottom-sheet__content" style={{ marginTop: "var(--spacing-xl)" }}>
            <button
              onClick={() => {
                if (!isGenerating) {
                  setShowAiModal(false);
                }
              }}
              disabled={isGenerating}
              className="btn"
              style={{
                position: "absolute",
                top: "var(--spacing-md)",
                right: "var(--spacing-md)",
                padding: "var(--spacing-xs)",
                minWidth: "auto",
                background: "transparent",
                color: isGenerating ? "var(--color-text-muted)" : "var(--color-text)",
              }}
              aria-label="Close"
            >
              ×
            </button>
            <div style={{ textAlign: "center", marginBottom: "var(--spacing-lg)" }}>
              <h3 className="text-h2" style={{ marginBottom: "var(--spacing-xs)" }}>
                Generate Quiz with AI
              </h3>
              <p className="text-body" style={{ color: "var(--color-text-secondary)" }}>
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
                  padding: "var(--spacing-2xl) var(--spacing-md)",
                  gap: "var(--spacing-md)",
                }}
              >
                <div
                  style={{
                    width: "3rem",
                    height: "3rem",
                    border: "4px solid var(--color-primary-medium)",
                    borderTopColor: "var(--color-primary)",
                    borderRadius: "50%",
                    animation: "spin 1s linear infinite",
                  }}
                />
                <p className="text-body">Generating your quiz...</p>
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
                  gap: "var(--spacing-md)",
                }}
              >
                {/* Topic Input */}
                <div className="form-group">
                  <label className="form-label">
                    Topic <span style={{ color: "var(--color-error)" }}>*</span>
                  </label>
                  <input
                    type="text"
                    value={aiForm.topic}
                    onChange={(e) =>
                      setAiForm({ ...aiForm, topic: e.target.value })
                    }
                    placeholder="e.g., Ethereum, Web3, History of Bitcoin"
                    disabled={isGenerating}
                    className="form-input"
                  />
                </div>

                {/* Question Count Slider */}
                <div className="form-group">
                  <label className="form-label">
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
                      backgroundColor: "var(--color-surface)",
                      borderRadius: "var(--radius-sm)",
                      outline: "none",
                    }}
                  />
                  <div
                    className="text-caption"
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      marginTop: "var(--spacing-xs)",
                      color: "var(--color-text-muted)",
                    }}
                  >
                    <span>1</span>
                    <span>10</span>
                  </div>
                </div>

                {/* Difficulty Level */}
                <div className="form-group">
                  <label className="form-label">Difficulty Level</label>
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
                    className="form-input"
                  >
                    <option value="easy">Easy 😇</option>
                    <option value="medium">Medium 🤔</option>
                    <option value="hard">Hard 🤬</option>
                  </select>
                </div>

                {/* Optional Context */}
                <div className="form-group">
                  <label className="form-label">Additional Instructions (Optional)</label>
                  <textarea
                    value={aiForm.context}
                    onChange={(e) =>
                      setAiForm({ ...aiForm, context: e.target.value })
                    }
                    placeholder="e.g., Focus on technical details, Make questions challenging"
                    disabled={isGenerating}
                    rows={3}
                    className="form-input"
                    style={{ resize: "none" }}
                  />
                </div>

                {/* File Upload */}
                <div className="form-group">
                  <label className="form-label">
                    Upload Documents (Optional)
                    <span
                      className="text-caption"
                      style={{
                        color: "var(--color-text-muted)",
                        marginLeft: "var(--spacing-xs)",
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
                    className="form-input"
                  />
                  {aiForm.documents.length > 0 && (
                    <div
                      style={{
                        marginTop: "var(--spacing-sm)",
                        display: "flex",
                        flexDirection: "column",
                        gap: "var(--spacing-xs)",
                      }}
                    >
                      {aiForm.documents.map((doc, index) => (
                        <div
                          key={index}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            backgroundColor: "var(--color-surface)",
                            borderRadius: "var(--radius-md)",
                            padding: "var(--spacing-xs)",
                          }}
                        >
                          <span
                            className="text-body"
                            style={{
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
                            className="btn"
                            style={{
                              marginLeft: "var(--spacing-xs)",
                              padding: "var(--spacing-xs)",
                              minWidth: "auto",
                              background: "transparent",
                              color: "var(--color-error)",
                            }}
                            aria-label="Remove document"
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
                  className="btn btn--primary btn--large"
                  style={{ width: "100%" }}
                >
                  Generate Quiz
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <Footer />
    </div>
  );
}
