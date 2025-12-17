"use client";

import { useEffect, useState, Suspense, useRef, useCallback, useMemo } from "react";
import { useRouter, useParams } from "next/navigation";

// Disable pre-rendering for this page
export const dynamic = "force-dynamic";
import { useQuiz } from "@/lib/quiz-context";
import { useAccount } from "wagmi";
import { useSupabase } from "@/lib/supabase-context";
import { useMiniKit } from "@coinbase/onchainkit/minikit";
import Link from "next/link";
import { useAuth } from "@/lib/use-auth";
import { usePlayerSessionsRealtime, useLobbyMessagesRealtime } from "@/lib/use-realtime-hooks";
import { NETWORK_TOKENS } from "@/lib/token-config";
import { ZERO_ADDRESS } from "@/lib/contracts";
import QuizCalendarButton from "@/components/QuizCalendarButton";
import Footer from "@/components/Footer";
import { sdk } from "@farcaster/miniapp-sdk";
import QRCodeModal from "@/components/QRCodeModal";
import { callEdgeFunction } from "@/lib/supabase-client";
import { hapticImpact } from "@/lib/haptics";
import { AdsterixWidget } from "@nektarlabs/adsterix-widget";

function LobbyContent() {
  const router = useRouter();
  const params = useParams();
  const {
    currentGame,
    getCurrentQuiz,
    joinGame: joinGameContext,
    roomCode: contextRoomCode,
    gameSessionId,
    setCurrentQuiz,
  } = useQuiz();
  const { address } = useAccount();
  const { supabase } = useSupabase();
  const { isFrameReady, setFrameReady } = useMiniKit();
  const {
    loggedUser,
    isAuthLoading,
    authError,
    triggerAuth,
    authFlowState,
    isMiniapp,
    miniappClient,
    signatureModal,
    isWalletReady,
  } = useAuth();
  const [countdown, setCountdown] = useState<number | null>(null);
  const [timeRemainingMs, setTimeRemainingMs] = useState<number | null>(null);
  const [playerName, setPlayerName] = useState("");
  const [joined, setJoined] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState("");
  const [hasTriggeredAuth, setHasTriggeredAuth] = useState(false);

  const roomCodeFromUrl =
    typeof params.roomCode === "string" ? params.roomCode.toUpperCase() : "";
  const [isLoadingGame, setIsLoadingGame] = useState(true);
  const [gameData, setGameData] = useState<{
    id: string;
    creator_session_id?: string;
    status?: string;
    quiz_id?: string;
    quizzes?: {
      id: string;
      title: string;
      description: string;
      created_at: string;
      prize_amount?: number;
      prize_token?: string | null;
      network_id?: string | null;
      scheduled_start_time?: string | null;
    };
  } | null>(null);
  const [quizData, setQuizData] = useState<{
    id: string;
    title: string;
    description: string;
    questions: Array<{
      id: string;
      text: string;
      options: string[];
      correctAnswer: number;
      timeLimit: number;
    }>;
    createdAt: Date;
  } | null>(null);
  const [isCreator, setIsCreator] = useState(false);
  const [copiedPin, setCopiedPin] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [showShareOptions, setShowShareOptions] = useState(false);
  const [showQRModal, setShowQRModal] = useState(false);
  const [messageText, setMessageText] = useState("");
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [isScheduledLocal, setIsScheduledLocal] = useState(false);
  const [scheduledStartTimeLocal, setScheduledStartTimeLocal] = useState<string>("");
  const [isUpdatingSchedule, setIsUpdatingSchedule] = useState(false);

  // Initialize scheduled time from quiz data
  useEffect(() => {
    if (gameData?.quizzes?.scheduled_start_time) {
      const scheduledDate = new Date(gameData.quizzes.scheduled_start_time);
      const offset = scheduledDate.getTimezoneOffset();
      const local = new Date(scheduledDate.getTime() - offset * 60_000);
      setScheduledStartTimeLocal(local.toISOString().slice(0, 16));
      setIsScheduledLocal(true);
    } else {
      setIsScheduledLocal(false);
      setScheduledStartTimeLocal("");
    }
  }, [gameData?.quizzes?.scheduled_start_time]);

  const minScheduledTime = useMemo(() => {
    const date = new Date(Date.now() + 60_000);
    const offset = date.getTimezoneOffset();
    const local = new Date(date.getTime() - offset * 60_000);
    return local.toISOString().slice(0, 16);
  }, []);

  const handleUpdateSchedule = async () => {
    if (!gameData?.quiz_id) return;
    
    // Check if user is creator
    const playerSessionId = typeof window !== "undefined" 
      ? localStorage.getItem("playerSessionId") 
      : null;
    const isUserCreator = isCreator || (playerSessionId && gameData?.creator_session_id && playerSessionId === gameData.creator_session_id);
    
    if (!isUserCreator) return;

    setIsUpdatingSchedule(true);
    try {
      const scheduledStartIso = isScheduledLocal && scheduledStartTimeLocal
        ? new Date(scheduledStartTimeLocal).toISOString()
        : null;

      await callEdgeFunction("update-quiz", {
        quiz_id: gameData.quiz_id,
        scheduled_start_time: scheduledStartIso,
      });

      // Update local gameData
      if (gameData.quizzes) {
        setGameData({
          ...gameData,
          quizzes: {
            ...gameData.quizzes,
            scheduled_start_time: scheduledStartIso,
          },
        });
      }
    } catch (error) {
      console.error("Error updating schedule:", error);
      setError("Failed to update schedule. Please try again.");
    } finally {
      setIsUpdatingSchedule(false);
    }
  };
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const hasNavigatedRef = useRef(false);
  // Reactions: messageId -> emoji -> array of player_session_ids
  const [reactions, setReactions] = useState<Record<string, Record<string, string[]>>>({});
  // Track which emoji picker is open
  const [openEmojiPicker, setOpenEmojiPicker] = useState<string | null>(null);
  // Banner notifications for creator messages
  const [creatorBanners, setCreatorBanners] = useState<Array<{
    id: string;
    message: string;
    playerName: string;
    timestamp: number;
  }>>([]);
  // Track which creator messages have already been shown as banners
  const shownCreatorMessagesRef = useRef<Set<string>>(new Set());

  // Use realtime hook for player sessions
  const { 
    players, 
    isConnected: isRealtimeConnected, 
    reconnectAttempts, 
    isReconnecting 
  } = usePlayerSessionsRealtime(gameSessionId, { 
    initialFetch: true, 
    sortBy: 'joined_at' 
  });

  // Use realtime hook for lobby messages
  const { messages, isConnected: isMessagesConnected, channel: messagesChannel, addMessageLocal } = useLobbyMessagesRealtime(gameSessionId);

  const quiz = getCurrentQuiz() || quizData;
  const goToPlay = useCallback(() => {
    if (hasNavigatedRef.current) return;
    const roomCodeToUse = contextRoomCode || roomCodeFromUrl;
    const quizId =
      currentGame?.quizId ||
      gameData?.quiz_id ||
      quizData?.id ||
      quiz?.id;

    if (!roomCodeToUse || !quizId) return;

    const params = new URLSearchParams();
    params.set("room", roomCodeToUse);
    params.set("quizId", quizId);

    hasNavigatedRef.current = true;
    router.push(`/quiz/play?${params.toString()}`);
  }, [
    contextRoomCode,
    roomCodeFromUrl,
    currentGame?.quizId,
    gameData?.quiz_id,
    quizData?.id,
    quiz?.id,
    router,
  ]);

  const goToResults = useCallback(() => {
    if (hasNavigatedRef.current) return;
    const gameId = gameSessionId || gameData?.id;
    const quizId =
      currentGame?.quizId ||
      quizData?.id ||
      gameData?.quiz_id ||
      quiz?.id;

    if (!gameId || !quizId) return;

    const params = new URLSearchParams();
    params.set("game", gameId);
    params.set("quizId", quizId);
    const roomCodeToUse = contextRoomCode || roomCodeFromUrl;
    if (roomCodeToUse) {
      params.set("room", roomCodeToUse);
    }

    hasNavigatedRef.current = true;
    router.push(`/quiz/results?${params.toString()}`);
  }, [
    gameSessionId,
    gameData?.id,
    currentGame?.quizId,
    quizData?.id,
    gameData?.quiz_id,
    quiz?.id,
    contextRoomCode,
    roomCodeFromUrl,
    router,
  ]);
  const prizeAmount = Number(gameData?.quizzes?.prize_amount ?? 0);
  const prizeTokenAddress = (gameData?.quizzes?.prize_token ??
    ZERO_ADDRESS) as `0x${string}`;
  const normalizedPrizeToken = prizeTokenAddress.toLowerCase();
  const quizNetworkId = Number(gameData?.quizzes?.network_id || 8453);
  const tokensForNetwork = NETWORK_TOKENS[quizNetworkId] || [];
  const matchedToken =
    tokensForNetwork.find(
      (token) => token.address.toLowerCase() === normalizedPrizeToken
    ) ||
    (prizeTokenAddress === ZERO_ADDRESS
      ? tokensForNetwork.find((token) => token.address === ZERO_ADDRESS)
      : undefined);
  const prizeTokenSymbol =
    prizeTokenAddress === ZERO_ADDRESS
      ? matchedToken?.symbol || "ETH"
      : matchedToken?.symbol || "Token";
  const prizeTokenName =
    prizeTokenAddress === ZERO_ADDRESS
      ? matchedToken?.name || "Ethereum"
      : matchedToken?.name || "Custom token";
  const shortPrizeToken =
    prizeTokenAddress !== ZERO_ADDRESS
      ? `${prizeTokenAddress.slice(0, 6)}...${prizeTokenAddress.slice(-4)}`
      : null;
  // Format prize amount with more decimals for ETH/native tokens
  const formattedPrizeAmount =
    prizeAmount > 0
      ? prizeTokenAddress === ZERO_ADDRESS
        ? prizeAmount.toLocaleString(undefined, { 
            maximumFractionDigits: 18,
            minimumFractionDigits: 0,
            useGrouping: false
          })
        : prizeAmount.toLocaleString(undefined, { maximumFractionDigits: 4 })
      : "0";
  const showPrizePool = prizeAmount > 0;
  const scheduledStartTime = gameData?.quizzes?.scheduled_start_time || null;
  const formattedScheduledStart = scheduledStartTime
    ? new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(scheduledStartTime))
    : null;
  const eventStart =
    scheduledStartTime != null ? new Date(scheduledStartTime) : null;
  const eventEnd =
    eventStart != null
      ? new Date(eventStart.getTime() + 30 * 60 * 1000)
      : null;

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

  const lobbyRoomCode = contextRoomCode || roomCodeFromUrl || "";
  const lobbyEventUrl =
    typeof window !== "undefined" && lobbyRoomCode
      ? `${window.location.origin}/quiz/lobby/${lobbyRoomCode}`
      : "";

  const formatCalendarDateTime = (date: Date | null) => {
    if (!date) {
      return null;
    }
    const iso = date.toISOString().replace(/[-:]/g, "");
    const withoutMs = iso.split(".")[0];
    return `${withoutMs}Z`;
  };

  const lobbyGoogleCalendarUrl = (() => {
    if (!eventStart || !eventEnd) {
      return null;
    }

    const start = formatCalendarDateTime(eventStart);
    const end = formatCalendarDateTime(eventEnd);

    if (!start || !end) {
      return null;
    }

    const title = encodeURIComponent(quiz?.title ?? "Hoot Quiz");
    const details = encodeURIComponent(
      `Join the Hoot quiz – Room ${lobbyRoomCode}${
        lobbyEventUrl ? `\n\n${lobbyEventUrl}` : ""
      }`
    );
    const location = encodeURIComponent(lobbyEventUrl || "");

    return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${start}/${end}&details=${details}&location=${location}`;
  })();

  const isFarcasterMiniapp = Boolean(
    isMiniapp && miniappClient === "farcaster"
  );
  const isBaseMiniapp = Boolean(isMiniapp && miniappClient === "base");

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
  const authReady = Boolean(loggedUser?.isAuthenticated && authFlowState === "ready");
  const needsPrivyFlow = (isMiniapp === false) || miniappClient === "telegram";
  const handleAuthClick = (mode: "miniapp" | "privy") => {
    // Set hasTriggeredAuth to prevent auto-trigger from interfering
    setHasTriggeredAuth(true);
    triggerAuth(8453, mode).catch((err) => {
      console.error("Error triggering authentication flow:", err);
      // If auth fails, allow retry by resetting hasTriggeredAuth
      // But only if we're in error state (not just waiting for wallet)
      if (authFlowState === "error") {
        // Don't reset, let user retry manually
      }
    });
  };

  // Initialize the miniapp
  useEffect(() => {
    if (!isFrameReady) {
      setFrameReady();
    }
  }, [setFrameReady, isFrameReady]);

  // Auto-trigger authentication for embedded miniapps that already provide a wallet
  // Wait for wallet to be ready before attempting authentication
  useEffect(() => {
    if (authReady) return;
    if (isMiniapp === null) return;
    if (!isMiniapp || miniappClient === "telegram") return;

    // Wait for wallet to be ready before attempting authentication
    if (!isWalletReady) {
      console.log("⏳ Waiting for wallet to be ready before auto-triggering auth...");
      return;
    }

    // Wallet is ready, attempt authentication automatically
    // Trigger authentication if:
    // 1. We haven't triggered auth yet, OR
    // 2. We're in error state (allow retry), OR
    // 3. We're in checking state and wallet just became ready (user clicked before wallet was ready)
    const shouldTriggerAuth = 
      !hasTriggeredAuth || 
      authFlowState === "error" || 
      (authFlowState === "checking" && isWalletReady);

    if (shouldTriggerAuth) {
      const attemptAuth = async () => {
        try {
          console.log("🚀 Wallet ready! Auto-triggering authentication...");
          await triggerAuth(8453, "miniapp");
          setHasTriggeredAuth(true);
        } catch (err) {
          console.error("Error triggering miniapp authentication:", err);
          // On error, allow manual retry by not preventing future auto-triggers
          // But set hasTriggeredAuth to prevent infinite loops
          setHasTriggeredAuth(true);
        }
      };

      attemptAuth();
    }
  }, [authReady, hasTriggeredAuth, isMiniapp, miniappClient, triggerAuth, isWalletReady, authFlowState]);

  // Load game session if room code is provided
  useEffect(() => {
    if (!authReady) {
      return;
    }

    const loadGameSession = async () => {
      if (!roomCodeFromUrl) {
        setIsLoadingGame(false);
        return;
      }

      setIsLoadingGame(true);
      setError("");
      try {
        // Fetch game session from backend
        const { data: gameSession, error: gameError } = await supabase
          .from("game_sessions")
          .select(`*, quizzes (*)`)
          .eq("room_code", roomCodeFromUrl)
          .single();

        if (gameError || !gameSession) {
          console.error("Game session not found:", gameError);
          setError(`Game with PIN "${roomCodeFromUrl}" not found.`);
          setIsLoadingGame(false);
          return;
        }

        console.log("Game session loaded:", gameSession);
        setGameData(gameSession);

        // Load quiz questions
        const { data: questionsData, error: questionsError } = await supabase
          .from("questions")
          .select("*")
          .eq("quiz_id", gameSession.quiz_id)
          .order("order_index", { ascending: true });

        if (!questionsError && questionsData) {
          // Convert to frontend quiz format
          const quiz = {
            id: gameSession.quizzes.id,
            title: gameSession.quizzes.title,
            description: gameSession.quizzes.description || "",
            questions: questionsData.map(
              (q: {
                id: string;
                question_text: string;
                options: string[];
                correct_answer_index: number;
                time_limit: number;
              }) => ({
                id: q.id,
                text: q.question_text,
                options: q.options,
                correctAnswer: q.correct_answer_index,
                timeLimit: q.time_limit || 15,
              })
            ),
            createdAt: new Date(gameSession.quizzes.created_at),
          };
          setQuizData(quiz);

          // Important: Set quiz as current quiz so it's available on the play page
          // This is needed because the play page relies on getCurrentQuiz()
          setCurrentQuiz(quiz);
        }

        // Load existing players
        const { data: playersData } = await supabase
          .from("player_sessions")
          .select("*")
          .eq("game_session_id", gameSession.id)
          .order("joined_at", { ascending: true });

        console.log("Existing players:", playersData);

        setIsLoadingGame(false);
      } catch (err) {
        console.error("Error loading game session:", err);
        setError("Failed to load game session");
        setIsLoadingGame(false);
      }
    };

    loadGameSession();
  }, [roomCodeFromUrl, supabase, setCurrentQuiz, authReady]);

  // Countdown timer for scheduled quiz start (informational only)
  useEffect(() => {
    if (!scheduledStartTime) {
      setTimeRemainingMs(null);
      return;
    }

    const scheduledTime = new Date(scheduledStartTime).getTime();

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
    if (!update()) {
      return;
    }

    const interval = setInterval(() => {
      const keepRunning = update();
      if (!keepRunning) {
        clearInterval(interval);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [scheduledStartTime]);

  // Check if player is already joined and if they're the creator
  useEffect(() => {
    const playerSessionId = localStorage.getItem("playerSessionId");
    if (!playerSessionId || !gameSessionId) return;

    const checkPlayerSession = async () => {
      // First check in players list from realtime hook (fastest)
      const existingPlayer = players.find(p => p.id === playerSessionId);
      if (existingPlayer) {
        setJoined(true);
        setPlayerName(existingPlayer.player_name);
        
        // Check if this player is the creator
        if (gameData?.creator_session_id) {
          setIsCreator(playerSessionId === gameData.creator_session_id);
        }
        return;
      }

      // If not found in realtime players, verify with database
      try {
        const { data: playerData, error } = await supabase
          .from("player_sessions")
          .select("id, player_name, game_session_id")
          .eq("id", playerSessionId)
          .eq("game_session_id", gameSessionId)
          .single();

        if (!error && playerData) {
          setJoined(true);
          setPlayerName(playerData.player_name);
          
          // Check if this player is the creator
          if (gameData?.creator_session_id) {
            setIsCreator(playerSessionId === gameData.creator_session_id);
          }
        } else if (error?.code !== 'PGRST116') {
          console.warn("Invalid cached playerSessionId; clearing to allow rejoin", {
            playerSessionId,
            gameSessionId,
            error,
            playerData
          });
          // Player session not found or invalid, clear localStorage
          localStorage.removeItem("playerSessionId");
          setJoined(false);
        }
      } catch (err) {
        console.error("Error checking player session:", err);
      }
    };

    checkPlayerSession();
  }, [currentGame, gameData, players, gameSessionId, supabase]);

  // Listen for game status changes via realtime with auto-reconnection
  const gameStatusReconnectAttemptsRef = useRef(0);
  const gameStatusIsReconnectingRef = useRef(false);
  const gameStatusReconnectTimerRef = useRef<NodeJS.Timeout | null>(null);
  const gameStatusChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

    // Real-time game status tracking
  useEffect(() => {
    if (!gameSessionId) return;

    let isSubscribed = false;

    const setupChannel = () => {
      // Prevent duplicate subscriptions
      if (isSubscribed) {
        console.log("Already subscribed, skipping...");
        return;
      }

      // Clean up existing channel if any
      if (gameStatusChannelRef.current) {
        console.log("Removing existing game status channel before reconnecting");
        supabase.removeChannel(gameStatusChannelRef.current);
        gameStatusChannelRef.current = null;
      }

      const attemptNumber = gameStatusReconnectAttemptsRef.current + 1;
      console.log(`Setting up game status realtime channel (attempt ${attemptNumber})`);

      gameStatusChannelRef.current = supabase
        .channel(`game_status:${gameSessionId}`)
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "game_sessions",
            filter: `id=eq.${gameSessionId}`,
          },
          (payload) => {
            console.log("Game session updated:", payload.new);
            const updatedSession = payload.new as { status: string };

            // Update local gameData state to reflect the new status
            setGameData((prev) => prev ? { ...prev, status: updatedSession.status } : null);

            // When game enters "starting" status, trigger countdown
            if (updatedSession.status === "starting" && countdown === null) {
              console.log("Game starting! Beginning countdown...");
              setCountdown(3);
            }
          }
        )
        .subscribe((status, err) => {
          console.log("Realtime connection status:", status);

          if (status === "SUBSCRIBED") {
            console.log("Successfully connected to game status realtime");
            isSubscribed = true;
            gameStatusReconnectAttemptsRef.current = 0;
            gameStatusIsReconnectingRef.current = false;
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            console.error("Game status realtime connection error:", status, err);
            isSubscribed = false;

            // Only handle reconnection if not already reconnecting
            if (!gameStatusIsReconnectingRef.current) {
              // Auto-reconnect with exponential backoff
              const maxAttempts = 10;
              const currentAttempt = gameStatusReconnectAttemptsRef.current + 1;

              if (currentAttempt <= maxAttempts) {
                gameStatusIsReconnectingRef.current = true;
                gameStatusReconnectAttemptsRef.current = currentAttempt;

                // Exponential backoff: 1s, 2s, 4s, 8s, up to max 30s
                const delay = Math.min(
                  1000 * Math.pow(2, currentAttempt - 1),
                  30000
                );

                console.log(
                  `Will retry game status connection in ${delay}ms (attempt ${currentAttempt}/${maxAttempts})`
                );

                gameStatusReconnectTimerRef.current = setTimeout(() => {
                  gameStatusIsReconnectingRef.current = false;
                  setupChannel(); // Recursive call to retry
                }, delay);
              } else {
                console.error("Max game status reconnection attempts reached");
                gameStatusIsReconnectingRef.current = false;
              }
            }
          } else if (status === "CLOSED") {
            console.log("Game status channel closed");
            isSubscribed = false;
          }
        });
    };

    setupChannel();

    return () => {
      console.log("Cleaning up game status realtime channel");
      isSubscribed = false;
      if (gameStatusReconnectTimerRef.current) {
        clearTimeout(gameStatusReconnectTimerRef.current);
        gameStatusReconnectTimerRef.current = null;
      }
      if (gameStatusChannelRef.current) {
        supabase.removeChannel(gameStatusChannelRef.current);
        gameStatusChannelRef.current = null;
      }
    };
  }, [gameSessionId, supabase, countdown]);

  // Handle countdown
  useEffect(() => {
    if (countdown === null || countdown <= 0) return;

    const timer = setTimeout(() => {
      // Provide light impact feedback for each countdown tick
      void hapticImpact("light");

      setCountdown(countdown - 1);

      if (countdown === 1 && joined && currentGame) {
        console.log("Countdown finished, navigating to play page");
        goToPlay();
      }
    }, 1000);

    return () => clearTimeout(timer);
  }, [
    countdown,
    joined,
    currentGame,
    goToPlay,
  ]);

  useEffect(() => {
    if (!joined || hasNavigatedRef.current) return;

    const backendStatus = gameData?.status;
    const frontendStatus = currentGame?.status;

    if (backendStatus === "in_progress" || frontendStatus === "question") {
      goToPlay();
    } else if (
      backendStatus &&
      (backendStatus === "completed" || backendStatus === "finished")
    ) {
      goToResults();
    } else if (frontendStatus === "finished") {
      goToResults();
    }
  }, [joined, gameData?.status, currentGame?.status, goToPlay, goToResults]);

  const handleManualReconnect = () => {
    console.log("Manual reconnect triggered");
    gameStatusReconnectAttemptsRef.current = 0;
    gameStatusIsReconnectingRef.current = false;
    // Reload the page to reset connection
    window.location.reload();
  };

  const handleCopyPin = async () => {
    const roomCodeToCopy = contextRoomCode || roomCodeFromUrl;
    if (roomCodeToCopy) {
      try {
        await navigator.clipboard.writeText(roomCodeToCopy);
        setCopiedPin(true);
        setTimeout(() => setCopiedPin(false), 2000);
      } catch (err) {
        console.error("Failed to copy PIN:", err);
      }
    }
  };

  const handleCopyLink = async () => {
    const roomCodeToCopy = contextRoomCode || roomCodeFromUrl;
    if (roomCodeToCopy) {
      const link = `${window.location.origin}/quiz/lobby/${roomCodeToCopy}`;
      try {
        await navigator.clipboard.writeText(link);
        setCopiedLink(true);
        setTimeout(() => setCopiedLink(false), 2000);
      } catch (err) {
        console.error("Failed to copy link:", err);
      }
    }
  };

  const handleCastQuiz = async () => {
    const roomCodeToUse = contextRoomCode || roomCodeFromUrl || "";
    const quizUrl = typeof window !== "undefined"
      ? `${window.location.origin}/quiz/lobby/${roomCodeToUse}`
      : "";
    const text = `🎯 Join my quiz on Hoot! The PIN is: ${roomCodeToUse}\n\n${quizUrl}`;
    await sdk.actions.composeCast({ 
      text,
      close: false,
      channelKey: 'hoot',
      embeds: [quizUrl as string]
    });
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();

    if (playerName.trim() && !isJoining) {
      setIsJoining(true);
      setError("");

      try {
        const roomCodeToUse = roomCodeFromUrl || contextRoomCode;
        if (!roomCodeToUse) {
          setError("No room code available");
          setIsJoining(false);
          return;
        }

        const playerId = await joinGameContext(
          playerName,
          address || undefined,
          roomCodeToUse
        );
        setJoined(true);
        // Store player ID in localStorage for persistence
        localStorage.setItem("playerSessionId", playerId);
        
        // Note: The player will be automatically added to the list via realtime subscription
        // No need to manually update local state here
      } catch (err) {
        console.error("Error joining game:", err);
        const message =
          err instanceof Error ? err.message : "Error joining game. Please try again.";

        if (message.toLowerCase().includes("finished")) {
          setError("Quiz already finished. Redirecting to results...");
          goToResults();
        } else {
          setError(message);
        }
      } finally {
        setIsJoining(false);
      }
    }
  };

  const handleStartQuiz = async () => {
    try {
      if (!gameSessionId) return;

      console.log("Starting quiz - updating game status to 'starting'");

      // Update game status to "starting" for countdown phase
      // Don't set question_started_at yet - it will be set after countdown
      await supabase
        .from("game_sessions")
        .update({
          status: "starting",
          started_at: new Date().toISOString(),
          // Don't set question_started_at here!
        })
        .eq("id", gameSessionId);

      console.log("Game status updated to 'starting' - countdown will begin");
    } catch (err) {
      console.error("Error starting quiz:", err);
      setError("Failed to start quiz. Please try again.");
    }
  };

  const handleLeaveLobby = async () => {
    console.log('Leaving lobby...');
    try {
      const savedPlayerId = localStorage.getItem("playerSessionId");
      if (savedPlayerId && gameSessionId) {
        // Delete the player session from the database
        const { error } = await supabase
          .from("player_sessions")
          .delete()
          .eq("id", savedPlayerId)
          .eq("game_session_id", gameSessionId);
        
        if (error) {
          console.error("Error leaving lobby:", error);
        }
        
        // Clear local storage
        localStorage.removeItem("playerSessionId");
        
        // Reset joined state
        setJoined(false);
      }
      
      // Navigate home
      router.push("/");
    } catch (err) {
      console.error("Error leaving lobby:", err);
      // Navigate home anyway
      router.push("/");
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!messageText.trim() || !joined || !gameSessionId || isSendingMessage || !messagesChannel) {
      return;
    }

    const playerSessionId = localStorage.getItem("playerSessionId");
    if (!playerSessionId) {
      setError("Cannot send message: player session not found");
      return;
    }

    // Find player name from players list
    const currentPlayer = players.find(p => p.id === playerSessionId);
    const senderName = currentPlayer?.player_name || playerName || "Unknown";

    setIsSendingMessage(true);
    setError("");

    try {
      // Create message object
      const message: {
        id: string;
        message: string;
        created_at: number;
        player_session_id: string;
        player_name: string;
        is_creator: boolean;
      } = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        message: messageText.trim(),
        created_at: Date.now(),
        player_session_id: playerSessionId,
        player_name: senderName,
        is_creator: isCreator,
      };

      // Add message locally immediately for instant feedback
      addMessageLocal(message);

      // Broadcast message via Realtime (no DB persistence)
      const broadcastStatus = await messagesChannel.send({
        type: "broadcast",
        event: "lobby_message",
        payload: message,
      });

      if (broadcastStatus === "error") {
        console.error("Error broadcasting message");
        setError("Failed to send message. Please try again.");
        // Remove message from local state if broadcast failed
        // (The message will be filtered out naturally since it won't arrive via broadcast)
      } else {
        // Message is already added locally, will also arrive via broadcast (but won't duplicate due to ID check)
        setMessageText("");
      }
    } catch (err) {
      console.error("Error sending message:", err);
      setError("Failed to send message. Please try again.");
    } finally {
      setIsSendingMessage(false);
    }
  };

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Handle creator banners - show only the latest creator message (only once per message)
  useEffect(() => {
    // Don't show banners to creator
    if (isCreator) return;

    // Find the latest creator message
    const creatorMessages = messages.filter(m => m.is_creator && m.created_at);
    if (creatorMessages.length === 0) return;

    const latestMessage = creatorMessages.reduce((latest, current) => 
      current.created_at > latest.created_at ? current : latest
    );

    // Check if this message has already been shown as a banner
    if (shownCreatorMessagesRef.current.has(latestMessage.id)) {
      return;
    }

    // Check if banner already exists for this message (in case it's currently showing)
    const bannerExists = creatorBanners.some(b => b.id === latestMessage.id);
    if (!bannerExists) {
      // Mark this message as shown
      shownCreatorMessagesRef.current.add(latestMessage.id);

      // Clear previous banners and show only the latest
      setCreatorBanners([{
        id: latestMessage.id,
        message: latestMessage.message,
        playerName: latestMessage.player_name,
        timestamp: latestMessage.created_at,
      }]);

      // Remove banner after 4 seconds
      setTimeout(() => {
        setCreatorBanners(prev => prev.filter(b => b.id !== latestMessage.id));
      }, 4000);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, isCreator]);

  // Close emoji picker when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      // Check if click is outside the emoji picker
      if (!target.closest('.emoji-picker-container')) {
        setOpenEmojiPicker(null);
      }
    };

    if (openEmojiPicker) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [openEmojiPicker]);

  // Listen for reaction updates
  useEffect(() => {
    if (!messagesChannel || !gameSessionId) return;

    const handleReaction = (payload: any) => {
      const reaction = payload.payload as {
        messageId: string;
        emoji: string;
        playerSessionId: string;
        action: "add" | "remove";
      };

      setReactions((prev) => {
        const newReactions = { ...prev };
        if (!newReactions[reaction.messageId]) {
          newReactions[reaction.messageId] = {};
        }
        if (!newReactions[reaction.messageId][reaction.emoji]) {
          newReactions[reaction.messageId][reaction.emoji] = [];
        }

        const emojiReactions = [...newReactions[reaction.messageId][reaction.emoji]];
        
        if (reaction.action === "add") {
          if (!emojiReactions.includes(reaction.playerSessionId)) {
            emojiReactions.push(reaction.playerSessionId);
          }
        } else {
          const index = emojiReactions.indexOf(reaction.playerSessionId);
          if (index > -1) {
            emojiReactions.splice(index, 1);
          }
        }

        newReactions[reaction.messageId][reaction.emoji] = emojiReactions;
        
        // Clean up empty emoji arrays
        if (emojiReactions.length === 0) {
          delete newReactions[reaction.messageId][reaction.emoji];
        }
        if (Object.keys(newReactions[reaction.messageId]).length === 0) {
          delete newReactions[reaction.messageId];
        }

        return newReactions;
      });
    };

    // Subscribe to reaction events - listener is automatically cleaned up when channel is removed
    messagesChannel.on(
      "broadcast",
      { event: "message_reaction" },
      handleReaction
    );
  }, [messagesChannel, gameSessionId]);

  const handleReaction = async (messageId: string, emoji: string) => {
    if (!messagesChannel || !joined) return;

    const playerSessionId = localStorage.getItem("playerSessionId");
    if (!playerSessionId) return;

    // Check if already reacted
    const hasReacted = reactions[messageId]?.[emoji]?.includes(playerSessionId);
    const action = hasReacted ? "remove" : "add";

    // Update local state immediately for better UX
    setReactions((prev) => {
      const newReactions = { ...prev };
      if (!newReactions[messageId]) {
        newReactions[messageId] = {};
      }
      if (!newReactions[messageId][emoji]) {
        newReactions[messageId][emoji] = [];
      }

      const emojiReactions = [...newReactions[messageId][emoji]];
      
      if (action === "add") {
        if (!emojiReactions.includes(playerSessionId)) {
          emojiReactions.push(playerSessionId);
        }
      } else {
        const index = emojiReactions.indexOf(playerSessionId);
        if (index > -1) {
          emojiReactions.splice(index, 1);
        }
      }

      newReactions[messageId][emoji] = emojiReactions;
      
      // Clean up empty emoji arrays
      if (emojiReactions.length === 0) {
        delete newReactions[messageId][emoji];
      }
      if (Object.keys(newReactions[messageId]).length === 0) {
        delete newReactions[messageId];
      }

      return newReactions;
    });

    // Broadcast reaction
    try {
      await messagesChannel.send({
        type: "broadcast",
        event: "message_reaction",
        payload: {
          messageId,
          emoji,
          playerSessionId,
          action,
        },
      });
    } catch (err) {
      console.error("Error sending reaction:", err);
      // Revert local state on error
      setReactions((prev) => {
        const newReactions = { ...prev };
        if (!newReactions[messageId]) {
          newReactions[messageId] = {};
        }
        if (!newReactions[messageId][emoji]) {
          newReactions[messageId][emoji] = [];
        }

        const emojiReactions = [...newReactions[messageId][emoji]];
        
        if (action === "remove") {
          // Revert: add back
          if (!emojiReactions.includes(playerSessionId)) {
            emojiReactions.push(playerSessionId);
          }
        } else {
          // Revert: remove
          const index = emojiReactions.indexOf(playerSessionId);
          if (index > -1) {
            emojiReactions.splice(index, 1);
          }
        }

        newReactions[messageId][emoji] = emojiReactions;
        return newReactions;
      });
    }
  };

  const availableEmojis = ["👍", "❤️", "😂", "🎉", "🔥","🐺", "👏"];

  if (!authReady) {
    const isProcessing =
      authFlowState === "checking" || authFlowState === "signing" || isAuthLoading;
    const environmentPending = isMiniapp === null;
    const walletInitializing = !needsPrivyFlow && !isWalletReady && !environmentPending;
    const buttonLabel = needsPrivyFlow
      ? "Connect with Privy"
      : miniappClient === "base"
      ? "Continue with Base account"
      : "Continue with Farcaster account";
    const description = needsPrivyFlow
      ? "Connect or create a wallet with Privy to join the quiz lobby."
      : "Use the embedded miniapp wallet and sign a message to enter the lobby.";
    const displayDescription = environmentPending 
      ? "Checking your environment..." 
      : walletInitializing
      ? "Waiting for wallet to initialize..."
      : description;
    const footerMessage = environmentPending
      ? "Hang tight while we detect the client capabilities."
      : walletInitializing
      ? "Please wait while your wallet loads. This usually takes a few seconds."
      : needsPrivyFlow
      ? "You'll be prompted by Privy to connect or create a wallet."
      : "We'll request a signature from your embedded wallet to confirm the session.";
    const showSpinner = isProcessing || environmentPending || walletInitializing;
    const isButtonDisabled = walletInitializing || environmentPending;

    return (
      <>
        {signatureModal}
        <div className="min-h-screen w-full bg-black text-white relative overflow-hidden">
          <div className="absolute top-0 left-2 transform -translate-y-1 z-20">
            <img
              src="/Logo.png"
              alt="Hoot Logo"
              className="h-28 w-auto cursor-pointer hover:opacity-80 transition-opacity"
              onClick={() => router.push("/")}
            />
          </div>
          <div className="flex items-center justify-center min-h-screen px-4">
            <div className="max-w-md w-full rounded-2xl p-8 text-center space-y-5" style={{ backgroundColor: "var(--color-surface-elevated)", border: "1px solid var(--color-border-medium)" }}>
              <h1 className="text-2xl font-bold">Connect your wallet</h1>
              <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>{displayDescription}</p>
              {authError && !walletInitializing && (
                <div className="rounded-lg p-3 text-sm" style={{ backgroundColor: "rgba(239, 68, 68, 0.2)", border: "1px solid var(--color-error)", color: "var(--color-error)" }}>
                  {authError}
                </div>
              )}
              {walletInitializing && (
                <div className="rounded-lg p-3 text-sm" style={{ backgroundColor: "rgba(59, 130, 246, 0.2)", border: "1px solid var(--color-info)", color: "var(--color-info)" }}>
                  Your wallet is loading. Please wait a moment...
                </div>
              )}
              {showSpinner ? (
                <div className="flex flex-col items-center gap-2 text-sm" style={{ color: "var(--color-text-secondary)" }}>
                  <div className="w-6 h-6 rounded-full animate-spin" style={{ border: "2px solid var(--color-primary-medium)", borderTopColor: "transparent" }} />
                  <span>
                    {walletInitializing
                      ? "Waiting for wallet..."
                      : authFlowState === "signing"
                      ? "Awaiting signature..."
                      : "Preparing authentication..."}
                  </span>
                </div>
              ) : (
                <button
                  onClick={() => handleAuthClick(needsPrivyFlow ? "privy" : "miniapp")}
                  disabled={isButtonDisabled}
                  className="w-full py-2 rounded font-medium transition-colors"
                  style={{
                    backgroundColor: isButtonDisabled ? "var(--color-text-muted)" : "var(--color-primary)",
                    color: "var(--color-text)",
                    cursor: isButtonDisabled ? "not-allowed" : "pointer",
                    opacity: isButtonDisabled ? 0.5 : 1,
                  }}
                  onMouseEnter={(e) => {
                    if (!isButtonDisabled) {
                      e.currentTarget.style.backgroundColor = "var(--color-primary-hover)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isButtonDisabled) {
                      e.currentTarget.style.backgroundColor = "var(--color-primary)";
                    }
                  }}
                >
                  {buttonLabel}
                </button>
              )}
              {authFlowState === "error" && !walletInitializing && (
                <p className="text-xs text-red-300">
                  Something went wrong. Please try again.
                </p>
              )}
              <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>{footerMessage}</p>
            </div>
          </div>
        </div>
      </>
    );
  }

  if (isLoadingGame) {
    return (
      <>
        {signatureModal}
        <div className="min-h-screen w-full bg-black text-white relative overflow-hidden">
          {/* Logo */}
          <div className="absolute top-0 left-2 transform -translate-y-1 z-20">
            <img 
              src="/Logo.png" 
              alt="Hoot Logo" 
              className="h-28 w-auto cursor-pointer hover:opacity-80 transition-opacity"
              onClick={() => router.push('/')}
            />
          </div>
          <div className="flex items-center justify-center min-h-screen">
            <div className="animate-pulse text-2xl font-bold">Loading game...</div>
          </div>
        </div>
      </>
    );
  }

  if (!quiz && !quizData) {
    return (
      <>
        {signatureModal}
        <div className="min-h-screen w-full bg-black text-white relative overflow-hidden">
          {/* Logo */}
          <div className="absolute top-0 left-2 transform -translate-y-1 z-20">
            <img 
              src="/Logo.png" 
              alt="Hoot Logo" 
              className="h-28 w-auto cursor-pointer hover:opacity-80 transition-opacity"
              onClick={() => router.push('/')}
            />
          </div>
          <div className="flex items-center justify-center min-h-screen">
            <div className="text-center">
              <div className="text-2xl font-bold mb-4">Game not found</div>
              <Link href="/" className="hover:underline" style={{ color: "var(--color-info)" }}>
                Go back home
              </Link>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      {signatureModal}
      <div className="min-h-screen w-full bg-black text-white relative overflow-hidden">
        {/* Background network effect */}
        <div
          className="absolute inset-0 z-0 opacity-40"
          style={{
            backgroundImage: "url('/network-bg.svg')",
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        />

        <div className="relative z-10 container mx-auto py-8 px-4 flex flex-col items-center">
        {/* Connection Status Indicator */}
        {!isRealtimeConnected && (
          <div className="fixed top-4 right-4 z-50 backdrop-blur-sm rounded-lg p-4 shadow-2xl max-w-xs" style={{ backgroundColor: "rgba(239, 68, 68, 0.95)", border: "1px solid var(--color-error)" }}>
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0">
                {isReconnecting ? (
                  <div className="w-4 h-4 rounded-full animate-spin" style={{ border: "2px solid var(--color-error)", borderTopColor: "transparent" }}></div>
                ) : (
                  <div className="w-4 h-4 bg-red-400 rounded-full animate-pulse"></div>
                )}
              </div>
              <div className="flex-1">
                <p className="font-semibold text-sm mb-1">
                  {isReconnecting ? "Reconnecting..." : "Connection Lost"}
                </p>
                <p className="text-xs" style={{ color: "var(--color-error)" }}>
                  {isReconnecting
                    ? `Attempt ${reconnectAttempts}/10`
                    : reconnectAttempts >= 10
                    ? "Max retries reached"
                    : "Real-time updates paused"}
                </p>
                {reconnectAttempts >= 10 && (
                  <button
                    onClick={handleManualReconnect}
                    className="mt-2 w-full px-3 py-1.5 bg-red-700 hover:bg-red-800 rounded text-xs font-medium transition-colors"
                  >
                    Reload Page
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Logo - centered above quiz title */}
        <div className="mb-4">
          <img 
            src="/Logo.png" 
            alt="Hoot Logo" 
            className="h-32 w-auto cursor-pointer hover:opacity-80 transition-opacity"
            onClick={() => router.push('/')}
          />
        </div>

        <h1 className="text-3xl font-bold mb-2">
          {quiz?.title || "Quiz Lobby"}
        </h1>

        {/* PIN and QR Code Split Button */}
        <div className="mb-4 w-full max-w-md mx-auto">
          <div className="flex gap-2">
            {/* PIN Button - Left Half */}
            
            

          </div>
        </div>

        {/* Cast and Share Buttons */}
        <div className="mb-8 w-full max-w-md mx-auto flex gap-2">
          {/* Cast Button */}
          <button
            onClick={handleCastQuiz}
            className="flex-1 rounded-lg p-4 flex items-center justify-center gap-2 transition-colors"
            style={{
              backgroundColor: "var(--color-primary)",
              border: "none",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "var(--color-primary-hover)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "var(--color-primary)";
            }}
          >
            <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
            </svg>
            <span className="text-white font-medium">Cast your quiz</span>
          </button>
          
          {/* Share Button - Icon Only */}
          <button
            onClick={() => setShowShareOptions(!showShareOptions)}
            className="rounded-lg p-4 flex items-center justify-center transition-colors"
            style={{
              backgroundColor: "var(--color-primary)",
              border: "none",
              minWidth: "56px",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "var(--color-primary-hover)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "var(--color-primary)";
            }}
          >
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
            </svg>
          </button>
        </div>
        
        {/* Share Options - Show when Share button is clicked */}
        {showShareOptions && (
          <div className="mb-8 w-full max-w-md mx-auto space-y-2">
            {/* Copy PIN Button */}
            <button
              onClick={handleCopyPin}
              className="w-full rounded-lg p-3 flex items-center justify-between transition-colors"
              style={{
                backgroundColor: "var(--color-surface-elevated)",
                border: "1px solid var(--color-primary-medium)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "var(--color-surface)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "var(--color-surface-elevated)";
              }}
            >
              <div className="flex items-center gap-2">
                <p className="text-2xl font-bold text-white font-mono">
                  {contextRoomCode || roomCodeFromUrl || "N/A"}
                </p>
                <span className="text-sm" style={{ color: "var(--color-text-secondary)" }}>Lobby PIN</span>
              </div>
              <div 
                className="p-2 rounded-lg transition-colors flex-shrink-0"
                style={{
                  backgroundColor: copiedPin ? "var(--color-success)" : "var(--color-surface)",
                  color: copiedPin ? "var(--color-text)" : "var(--color-text-secondary)",
                }}
                onMouseEnter={(e) => {
                  if (!copiedPin) {
                    e.currentTarget.style.backgroundColor = "var(--color-surface-elevated)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!copiedPin) {
                    e.currentTarget.style.backgroundColor = "var(--color-surface)";
                  }
                }}
              >
                {copiedPin ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                )}
              </div>
            </button>
            
            {/* QR Code Button */}
            <button
              onClick={() => setShowQRModal(true)}
              className="w-full rounded-lg p-3 flex items-center justify-between transition-colors"
              style={{
                backgroundColor: "var(--color-surface-elevated)",
                border: "1px solid var(--color-primary-medium)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "var(--color-surface)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "var(--color-surface-elevated)";
              }}
            >
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                </svg>
                <span className="text-white font-medium">QR Code</span>
              </div>
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        )}

        {/* Join Form - Show if not joined and not creator */}
        {(() => {
          // Check if user is creator by comparing localStorage playerSessionId with creator_session_id
          if (typeof window === "undefined" || !gameData) {
            // If gameData is not loaded yet, show form only if not joined
            return !joined && !isCreator;
          }
          
          const playerSessionId = localStorage.getItem("playerSessionId");
          const isUserCreator = playerSessionId && gameData?.creator_session_id && playerSessionId === gameData.creator_session_id;
          const shouldShowJoinForm = !joined && !isCreator && !isUserCreator;
          return shouldShowJoinForm;
        })() && (
          <form onSubmit={handleJoin} className="w-full max-w-md mb-8">
            {error && (
              <div className="mb-4 rounded-lg p-3 text-center" style={{ backgroundColor: "rgba(239, 68, 68, 0.2)", border: "1px solid var(--color-error)", color: "var(--color-error)" }}>
                {error}
              </div>
            )}
            {authError && (
              <div className="mb-4 rounded-lg p-3 text-center" style={{ backgroundColor: "rgba(239, 68, 68, 0.2)", border: "1px solid var(--color-error)", color: "var(--color-error)" }}>
                Authentication Error: {authError}
              </div>
            )}
            <div className="mb-4">
              <input
                type="text"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                placeholder="Enter your name"
                className="w-full px-4 py-2 rounded bg-white text-black"
                required
                disabled={isJoining}
              />
            </div>
            <button
              type="submit"
              disabled={isJoining || isAuthLoading}
              data-testid="join-quiz-button"
              style={{
                width: "100%",
                padding: "0.5rem 0",
                borderRadius: "0.375rem",
                color: "white",
                fontWeight: "500",
                backgroundColor:
                  isJoining || isAuthLoading ? "var(--color-text-muted)" : "var(--color-primary)",
                border: "none",
                cursor:
                  isJoining || isAuthLoading ? "not-allowed" : "pointer",
                opacity: isJoining || isAuthLoading ? 0.5 : 1,
                transition: "background-color 0.2s ease",
                background:
                  isJoining || isAuthLoading ? "var(--color-text-muted)" : "var(--color-primary)",
              }}
              onMouseEnter={(e) => {
                if (!isJoining && !isAuthLoading) {
                  e.currentTarget.style.backgroundColor = "var(--color-primary-hover)";
                }
              }}
              onMouseLeave={(e) => {
                if (!isJoining && !isAuthLoading) {
                  e.currentTarget.style.backgroundColor = "var(--color-primary)";
                }
              }}
            >
              {isAuthLoading
                ? "Loading..."
                : isJoining
                ? "Joining..."
                : "Join Quiz"}
            </button>
          </form>
        )}

        {countdown !== null && (
          <div className="mb-8 text-center">
            <div className="text-6xl font-bold mb-4">{countdown}</div>
            <p className="text-xl">Quiz starting soon...</p>
          </div>
        )}

        {countdown === null && (
          <>
            {(() => {
              // Filter out creator from players list
              const filteredPlayers = players.filter(
                (player) => player.id !== gameData?.creator_session_id
              );
              
              return (
                <>
                  <div className="rounded-lg p-6 mb-8 w-full max-w-md" style={{ backgroundColor: "var(--color-surface-elevated)", border: "1px solid var(--color-border-medium)" }}>
              <h2 className="text-xl font-semibold mb-4" style={{ color: "var(--color-text-secondary)" }}>
                Quiz Details
              </h2>
              
              <div className="space-y-4">
                
                <div>
                  <p className="mb-2" style={{ color: "var(--color-text-secondary)" }}>Prize pool:</p>
                  {showPrizePool ? (
                    <div className="rounded-lg p-3 flex flex-col gap-1" style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border-medium)" }}>
                      <span className="text-2xl font-bold" style={{ color: "var(--color-text)" }}>
                        {formattedPrizeAmount} {prizeTokenSymbol}
                      </span>
                      <span className="text-xs" style={{ color: "var(--color-text-secondary)" }}>
                        {prizeTokenName}
                        {shortPrizeToken ? ` • ${shortPrizeToken}` : ""}
                      </span>
                    </div>
                  ) : (
                    <div className="rounded-lg p-3 text-sm" style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border-light)", color: "var(--color-text-secondary)" }}>
                      Quiz creator hasn&apos;t funded a prize yet.
                    </div>
                  )}
                </div>

                {/* Schedule Quiz - Only for creator */}
                {(() => {
                  // Check if user is creator - use both state and direct check
                  const playerSessionId = typeof window !== "undefined" 
                    ? localStorage.getItem("playerSessionId") 
                    : null;
                  const isUserCreator = (isCreator || (playerSessionId && gameData?.creator_session_id && playerSessionId === gameData.creator_session_id));
                  
                  return isUserCreator ? (
                  <div className="mt-4">
                    <div 
                      className="rounded-lg p-4"
                      style={{ 
                        backgroundColor: "var(--color-surface-elevated)",
                        border: "1px solid var(--color-border-light)"
                      }}
                    >
                      <label className="flex items-center gap-3 cursor-pointer mb-3">
                        <div
                          onClick={() => {
                            setIsScheduledLocal(!isScheduledLocal);
                            if (isScheduledLocal) {
                              setScheduledStartTimeLocal("");
                            }
                          }}
                          style={{
                            position: "relative",
                            width: "44px",
                            height: "24px",
                            borderRadius: "12px",
                            backgroundColor: isScheduledLocal ? "var(--color-primary)" : "var(--color-background)",
                            border: "1px solid var(--color-border)",
                            cursor: "pointer",
                            transition: "background-color 0.2s",
                            flexShrink: 0,
                          }}
                        >
                          <div
                            style={{
                              position: "absolute",
                              top: "2px",
                              left: isScheduledLocal ? "22px" : "2px",
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
                      {isScheduledLocal && (
                        <div style={{ marginTop: "var(--spacing-md)", display: "flex", flexDirection: "column", gap: "var(--spacing-xs)" }}>
                          <input
                            type="datetime-local"
                            value={scheduledStartTimeLocal}
                            onChange={(e) => setScheduledStartTimeLocal(e.target.value)}
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
                          <div className="text-body text-sm" style={{ color: "var(--color-text-secondary)" }}>
                            Times are shown in your local timezone. The quiz will move to
                            the lobby automatically and generate a room code.
                          </div>
                          <button
                            onClick={handleUpdateSchedule}
                            disabled={isUpdatingSchedule || !scheduledStartTimeLocal}
                            className="mt-2 rounded-lg p-2 text-white font-medium transition-colors"
                            style={{
                              backgroundColor: isUpdatingSchedule || !scheduledStartTimeLocal ? "var(--color-text-muted)" : "var(--color-primary)",
                              border: "none",
                              cursor: isUpdatingSchedule || !scheduledStartTimeLocal ? "not-allowed" : "pointer",
                              opacity: isUpdatingSchedule || !scheduledStartTimeLocal ? 0.5 : 1,
                            }}
                          >
                            {isUpdatingSchedule ? "Updating..." : "Update Schedule"}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                  ) : null;
                })()}

                {formattedScheduledStart && (
                  <div className="mt-4">
                    <p className="mb-2" style={{ color: "var(--color-text-secondary)" }}>Scheduled start:</p>
                    <div className="rounded-lg p-3 text-sm" style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border-medium)", color: "var(--color-text)" }}>
                      {formattedScheduledStart}
                    </div>
                    {timeRemainingMs !== null && timeRemainingMs > 0 && (
                      <p className="mt-1 text-xs" style={{ color: "var(--color-text-secondary)" }}>
                        Starts in{" "}
                        <span className="font-mono font-semibold">
                          {formatTimeRemaining(timeRemainingMs)}
                        </span>
                      </p>
                    )}
                  </div>
                )}

                {eventStart &&
                  eventEnd &&
                  lobbyRoomCode &&
                  lobbyGoogleCalendarUrl && (
                    <div className="mt-4">
                      <p className="mb-2" style={{ color: "var(--color-text-secondary)" }}>
                        Add this quiz to your calendar:
                      </p>
                      <QuizCalendarButton
                        title={quiz?.title || "Hoot Quiz"}
                        eventStart={eventStart}
                        eventEnd={eventEnd}
                        roomCode={lobbyRoomCode}
                        eventUrl={lobbyEventUrl}
                        isMiniapp={isMiniapp}
                        isBaseMiniapp={isBaseMiniapp}
                        googleCalendarUrl={lobbyGoogleCalendarUrl}
                        openExternalUrl={openExternalUrl}
                      />
                    </div>
                  )}

                {(gameData?.status === "completed" || gameData?.status === "finished") && (
                  <div className="mt-4">
                    <button
                      onClick={goToResults}
                      className="w-full py-2 px-4 rounded-lg font-semibold transition-colors"
                      style={{ backgroundColor: "var(--color-primary)", color: "var(--color-text)" }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = "var(--color-primary-hover)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = "var(--color-primary)";
                      }}
                    >
                      View Results
                    </button>
                  </div>
                )}

                <div className="pt-2" style={{ borderTop: "1px solid var(--color-border-medium)" }}>
                  Status:{" "}
                  <span className="capitalize">
                    {currentGame?.status || gameData?.status || "waiting"}
                  </span>
                </div>
              </div>
            </div>

            <div className="rounded-lg p-6 mb-8 w-full max-w-md" style={{ backgroundColor: "var(--color-surface-elevated)", border: "1px solid var(--color-primary-medium)" }}>
              <h2 className="text-xl font-semibold mb-4 flex items-center justify-between" style={{ color: "var(--color-text-secondary)" }}>
                <span>Players ({filteredPlayers.length})</span>
                {filteredPlayers.length > 0 && (
                  <span className="text-sm flex items-center gap-1" style={{ color: "var(--color-success)" }}>
                    <span className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: "var(--color-success)" }}></span>
                    Live
                  </span>
                )}
              </h2>

              {filteredPlayers.length === 0 ? (
                <p style={{ color: "var(--color-text-muted)" }}>Waiting for players to join...</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {filteredPlayers.map((player) => (
                    <div
                      key={player.id}
                      className="p-3 rounded text-center relative group transition-colors"
                      style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-primary-light)", color: "var(--color-text)" }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = "var(--color-surface-elevated)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = "var(--color-surface)";
                      }}
                    >
                      <div className="font-medium truncate" title={player.player_name}>
                        {player.player_name}
                      </div>
                      {player.total_score > 0 && (
                        <div className="text-xs mt-1" style={{ color: "var(--color-text-secondary)" }}>
                          {player.total_score} pts
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>


            {/* Chat Component */}
            <div className="rounded-lg p-6 mb-8 w-full max-w-md" style={{ backgroundColor: "var(--color-surface-elevated)", border: "1px solid var(--color-primary-medium)" }}>
        <h2 className="text-xl font-semibold mb-4 flex items-center justify-between" style={{ color: "var(--color-text-secondary)" }}>
          <span>💬 Lobby Chat</span>
          {isMessagesConnected && (
            <span className="text-xs text-green-400 flex items-center gap-1">
            </span>
          )}
        </h2>

        

        {/* Creator Banners - Only show to non-creators, only latest message */}
        {!isCreator && creatorBanners.length > 0 && (
          <div className="fixed top-4 right-4 z-50">
            {creatorBanners.map((banner) => (
              <div
                key={banner.id}
                className="bg-yellow-500/95 border border-yellow-400 rounded-lg p-3 shadow-lg max-w-sm animate-slide-in"
              >
                <div className="flex items-start gap-2">
                  <span className="text-yellow-900 font-semibold text-sm">👑</span>
                  <div className="flex-1">
                    <p className="text-xs text-yellow-900 font-semibold mb-1">{banner.playerName}</p>
                    <p className="text-sm text-yellow-900 whitespace-pre-wrap break-words">{banner.message}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Messages List - Discord style (no boxes) */}
        <div className="rounded-lg p-4 mb-4 max-h-64 overflow-y-auto" style={{ backgroundColor: "var(--color-surface-elevated)" }}>
          {messages.length === 0 ? (
            <p className="text-sm text-center py-4" style={{ color: "var(--color-text-muted)" }}>No messages yet. Start the conversation!</p>
          ) : (
            <div className="space-y-1">
              {messages.map((message) => {
                const messageReactions = reactions[message.id] || {};
                const playerSessionId = localStorage.getItem("playerSessionId");
                const isCurrentUser = playerSessionId === message.player_session_id;
                
                return (
                  <div
                    key={message.id}
                    className="py-1 px-2 rounded transition-colors"
                    style={{
                      backgroundColor: message.is_creator ? "rgba(251, 191, 36, 0.1)" : "transparent",
                      borderLeft: message.is_creator ? "2px solid var(--color-warning)" : "none",
                    }}
                    onMouseEnter={(e) => {
                      if (!message.is_creator) {
                        e.currentTarget.style.backgroundColor = "var(--color-surface)";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!message.is_creator) {
                        e.currentTarget.style.backgroundColor = "transparent";
                      }
                    }}
                  >
                    <div className="flex items-start gap-2">
                      {message.is_creator && (
                        <span className="font-semibold text-sm flex-shrink-0" style={{ color: "var(--color-warning)" }}>👑</span>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2">
                          <span className="text-sm font-semibold" style={{ color: message.is_creator ? "var(--color-warning)" : "var(--color-text-secondary)" }}>
                            {message.player_name}
                            {isCurrentUser && " (you)"}
                          </span>
                          <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                            {new Date(message.created_at).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                              second: "2-digit",
                            })}
                          </span>
                        </div>
                        <p className="text-sm whitespace-pre-wrap break-words mt-0.5" style={{ color: "var(--color-text)" }}>
                          {message.message}
                        </p>
                        
                        {/* Reactions - Visible to everyone, but only joined users can interact */}
                        {Object.keys(messageReactions).length > 0 || joined ? (
                          <div className="mt-1 flex items-center gap-2 flex-wrap">
                            {/* Existing reactions */}
                            {Object.entries(messageReactions).map(([emoji, playerIds]) => {
                              const count = playerIds.length;
                              const hasReacted = joined && playerIds.includes(playerSessionId || "");
                              
                              if (joined) {
                                // Joined users can click to toggle reactions
                                return (
                                  <button
                                    key={emoji}
                                    onClick={() => handleReaction(message.id, emoji)}
                                    className="flex items-center gap-1 px-2 py-0.5 rounded text-xs transition-colors"
                                    style={{
                                      backgroundColor: hasReacted ? "var(--color-primary-light)" : "var(--color-surface)",
                                      border: `1px solid ${hasReacted ? "var(--color-primary-medium)" : "var(--color-border)"}`,
                                      color: hasReacted ? "var(--color-text-secondary)" : "var(--color-text-secondary)",
                                    }}
                                    onMouseEnter={(e) => {
                                      if (!hasReacted) {
                                        e.currentTarget.style.backgroundColor = "var(--color-surface-elevated)";
                                      }
                                    }}
                                    onMouseLeave={(e) => {
                                      if (!hasReacted) {
                                        e.currentTarget.style.backgroundColor = "var(--color-surface)";
                                      }
                                    }}
                                  >
                                    <span>{emoji}</span>
                                    <span className="text-xs">{count}</span>
                                  </button>
                                );
                              } else {
                                // Non-joined users can only see reactions
                                return (
                                  <span
                                    key={emoji}
                                    className="flex items-center gap-1 px-2 py-0.5 rounded text-xs"
                                    style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)", color: "var(--color-text-secondary)" }}
                                  >
                                    <span>{emoji}</span>
                                    <span className="text-xs">{count}</span>
                                  </span>
                                );
                              }
                            })}
                            
                            {/* Add reaction button - Only for joined users */}
                            {joined && (
                              <div className="relative emoji-picker-container">
                                <button
                                  onClick={() => setOpenEmojiPicker(openEmojiPicker === message.id ? null : message.id)}
                                  className="px-2 py-0.5 rounded text-xs transition-colors"
                                  style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)", color: "var(--color-text-muted)" }}
                                  onMouseEnter={(e) => {
                                    e.currentTarget.style.backgroundColor = "var(--color-surface-elevated)";
                                    e.currentTarget.style.color = "var(--color-text-secondary)";
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.backgroundColor = "var(--color-surface)";
                                    e.currentTarget.style.color = "var(--color-text-muted)";
                                  }}
                                  title="Add reaction"
                                >
                                  <span>+</span>
                                </button>
                                {openEmojiPicker === message.id && (
                                  <div className="absolute bottom-full left-0 mb-2 flex gap-1 rounded-lg p-2 shadow-lg z-10" style={{ backgroundColor: "var(--color-surface-elevated)", border: "1px solid var(--color-border)" }}>
                                    {availableEmojis.map((emoji) => (
                                      <button
                                        key={emoji}
                                        onClick={() => {
                                          handleReaction(message.id, emoji);
                                          setOpenEmojiPicker(null);
                                        }}
                                        className="text-xl hover:scale-125 transition-transform p-1"
                                      >
                                        {emoji}
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Message Input - Visible to all joined players */}
        {joined && (
          <form onSubmit={handleSendMessage} className="space-y-2">
            <div className="flex items-stretch gap-2">
              <input
                type="text"
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                placeholder="Send a message..."
                className="flex-1 min-w-0 px-4 py-2 rounded focus:outline-none"
                style={{
                  backgroundColor: "var(--color-text)",
                  border: "1px solid var(--color-border)",
                  color: "var(--color-background)",
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = "var(--color-primary)";
                  e.currentTarget.style.boxShadow = "0 0 0 2px var(--color-primary-medium)";
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = "var(--color-border)";
                  e.currentTarget.style.boxShadow = "none";
                }}
                maxLength={500}
                disabled={isSendingMessage}
              />
              <button
                type="submit"
                disabled={!messageText.trim() || isSendingMessage}
                className="flex-shrink-0 px-6 py-2 rounded font-medium transition-colors disabled:cursor-not-allowed"
                style={{
                  backgroundColor: (!messageText.trim() || isSendingMessage) ? "var(--color-text-muted)" : "var(--color-primary)",
                  color: "var(--color-text)",
                }}
                onMouseEnter={(e) => {
                  if (messageText.trim() && !isSendingMessage) {
                    e.currentTarget.style.backgroundColor = "var(--color-primary-hover)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (messageText.trim() && !isSendingMessage) {
                    e.currentTarget.style.backgroundColor = "var(--color-primary)";
                  }
                }}
              >
                {isSendingMessage ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                  </span>
                ) : (
                  "Send"
                )}
              </button>
            </div>
            <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>Everyone in the lobby can chat</p>
          </form>
        )}
      </div>

       {/* Adsterix Sponsored Banner */}
       <div className="bg-purple-900/40 border border-purple-700/70 rounded-lg p-4 mb-8 w-full max-w-md">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold uppercase tracking-wide text-purple-200">
                  Sponsored
                </span>
                <span className="text-[10px] text-purple-300">
                  Powered by Adsterix
                </span>
              </div>
              <AdsterixWidget
                castHash="0xb060d3a4f9397115665760d58b53d0645aa0fdd1"
                width="100%"
              />
                <span className="text-[10px] text-purple-300 mt-2">
                  Buy a slot at 11.00 or 18.00 UTC+1 to be featured on a Hoot!
                </span>
            </div>


            {joined && (
              <div className="w-full max-w-md flex flex-col gap-4">
                <div className="relative rounded-lg p-4 text-center" style={{ backgroundColor: "var(--color-primary-light)", border: "1px solid var(--color-primary-medium)" }}>
                  {/* Connection Status Indicator - Green Dot */}
                  {isRealtimeConnected && (
                    <div
                      className="absolute top-2 right-2 w-3 h-3 bg-green-400 rounded-full animate-pulse shadow-lg"
                      title="Connected to realtime updates"
                    ></div>
                  )}
                  <p>
                    You&apos;ve joined as <strong>{playerName}</strong>
                  </p>
                  {isCreator ? (
                    <p className="text-sm text-yellow-300 font-semibold">
                      👑 You are the quiz creator
                    </p>
                  ) : (
                    <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
                      Waiting for the quiz creator to start...
                    </p>
                  )}
                </div>

                {/* Only show Start Quiz button to the creator */}
                {isCreator && filteredPlayers.length > 0 && (
                  <button
                    onClick={handleStartQuiz}
                    className="w-full py-2 rounded text-white font-medium transition-colors"
                    style={{
                      backgroundColor: "var(--color-success)",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = "var(--color-success)";
                      e.currentTarget.style.opacity = "0.9";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = "var(--color-success)";
                      e.currentTarget.style.opacity = "1";
                    }}
                  >
                    Start Quiz ({filteredPlayers.length} {filteredPlayers.length === 1 ? 'player' : 'players'})
                  </button>
                )}

                <button
                  onClick={handleLeaveLobby}
                  className="w-full py-2 rounded font-medium text-center transition-colors"
                  style={{ backgroundColor: "var(--color-surface-elevated)", border: "1px solid var(--color-primary-medium)", color: "var(--color-text)" }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = "var(--color-surface)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "var(--color-surface-elevated)";
                  }}
                >
                  Leave Lobby
                </button>
              </div>
            )}
                </>
              );
            })()}
          </>
        )}
        </div>
      </div>

      <Footer />
      
      {/* QR Code Modal */}
      <QRCodeModal
        isOpen={showQRModal}
        onClose={() => setShowQRModal(false)}
        roomCode={contextRoomCode || roomCodeFromUrl || ""}
      />
    </>
  );
}

export default function LobbyPage() {
  const router = useRouter();
  return (
    <Suspense
      fallback={
        <div className="min-h-screen w-full bg-black text-white relative">
          {/* Logo */}
          <div className="absolute top-0 left-2 transform -translate-y-1 z-20">
            <img 
              src="/Logo.png" 
              alt="Hoot Logo" 
              className="h-28 w-auto cursor-pointer hover:opacity-80 transition-opacity"
              onClick={() => router.push('/')}
            />
          </div>
          <div className="flex items-center justify-center min-h-screen">
            Loading...
          </div>
        </div>
      }
    >
      <LobbyContent />
    </Suspense>
  );
}
