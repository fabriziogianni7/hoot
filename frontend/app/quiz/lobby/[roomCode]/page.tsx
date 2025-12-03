"use client";

import { useEffect, useState, Suspense, useRef, useCallback } from "react";
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
import { sdk } from "@farcaster/miniapp-sdk";
import { hapticImpact } from "@/lib/haptics";

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
  const [messageText, setMessageText] = useState("");
  const [isSendingMessage, setIsSendingMessage] = useState(false);
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
  const formattedPrizeAmount =
    prizeAmount > 0
      ? prizeAmount.toLocaleString(undefined, { maximumFractionDigits: 4 })
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
            <div className="max-w-md w-full bg-purple-900/40 border border-purple-700/60 rounded-2xl p-8 text-center space-y-5">
              <h1 className="text-2xl font-bold">Connect your wallet</h1>
              <p className="text-sm text-gray-300">{displayDescription}</p>
              {authError && !walletInitializing && (
                <div className="bg-red-500/20 border border-red-500 rounded-lg p-3 text-sm text-red-200">
                  {authError}
                </div>
              )}
              {walletInitializing && (
                <div className="bg-blue-500/20 border border-blue-500 rounded-lg p-3 text-sm text-blue-200">
                  Your wallet is loading. Please wait a moment...
                </div>
              )}
              {showSpinner ? (
                <div className="flex flex-col items-center gap-2 text-sm text-gray-300">
                  <div className="w-6 h-6 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
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
                  className={`w-full py-2 rounded text-white font-medium transition-colors ${
                    isButtonDisabled
                      ? "bg-gray-600 cursor-not-allowed opacity-50"
                      : "bg-purple-600 hover:bg-purple-700"
                  }`}
                >
                  {buttonLabel}
                </button>
              )}
              {authFlowState === "error" && !walletInitializing && (
                <p className="text-xs text-red-300">
                  Something went wrong. Please try again.
                </p>
              )}
              <p className="text-xs text-gray-500">{footerMessage}</p>
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
              <Link href="/" className="text-blue-400 hover:underline">
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
          <div className="fixed top-4 right-4 z-50 bg-red-600/95 backdrop-blur-sm border border-red-400 rounded-lg p-4 shadow-2xl max-w-xs">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0">
                {isReconnecting ? (
                  <div className="w-4 h-4 border-2 border-red-300 border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <div className="w-4 h-4 bg-red-400 rounded-full animate-pulse"></div>
                )}
              </div>
              <div className="flex-1">
                <p className="font-semibold text-sm mb-1">
                  {isReconnecting ? "Reconnecting..." : "Connection Lost"}
                </p>
                <p className="text-xs text-red-200">
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

        <h1 className="text-3xl font-bold mb-8">
          {quiz?.title || "Quiz Lobby"}
        </h1>

        {/* Join Form - Show if not joined */}
        {!joined && (
          <form onSubmit={handleJoin} className="w-full max-w-md mb-8">
            {error && (
              <div className="mb-4 bg-red-500/20 border border-red-500 rounded-lg p-3 text-center text-red-200">
                {error}
              </div>
            )}
            {authError && (
              <div className="mb-4 bg-red-500/20 border border-red-500 rounded-lg p-3 text-center text-red-200">
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
                  isJoining || isAuthLoading ? "#4a5568" : "#795AFF",
                border: "none",
                cursor:
                  isJoining || isAuthLoading ? "not-allowed" : "pointer",
                opacity: isJoining || isAuthLoading ? 0.5 : 1,
                transition: "background-color 0.2s ease",
                background:
                  isJoining || isAuthLoading ? "#4a5568" : "#795AFF",
              }}
              onMouseEnter={(e) => {
                if (!isJoining && !isAuthLoading) {
                  e.currentTarget.style.backgroundColor = "#6B46C1";
                }
              }}
              onMouseLeave={(e) => {
                if (!isJoining && !isAuthLoading) {
                  e.currentTarget.style.backgroundColor = "#795AFF";
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
                  <div className="bg-purple-900/30 border border-purple-700/50 rounded-lg p-6 mb-8 w-full max-w-md">
              <h2 className="text-xl font-semibold mb-4 text-purple-200">
                Quiz Details
              </h2>
              
              <div className="space-y-4">
                <div>
                  <p className="text-gray-300 mb-2">Share this link with other players:</p>
                  <div className="bg-purple-800/50 border border-purple-600 rounded-lg p-3 flex items-center justify-between">
                    <p className="text-sm text-blue-400 break-all flex-1 mr-2">
                      {typeof window !== "undefined"
                        ? `${window.location.origin}/quiz/lobby/${contextRoomCode || roomCodeFromUrl || ""}`
                        : "Loading..."}
                    </p>
                    <button
                      onClick={handleCopyLink}
                      className={`p-2 rounded-lg transition-colors flex-shrink-0 ${
                        copiedLink 
                          ? 'bg-green-600 text-white' 
                          : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                      }`}
                      title={copiedLink ? 'Copied!' : 'Copy link'}
                    >
                      {copiedLink ? (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>
                
                <div>
                  <p className="text-gray-300 mb-2">Or share the PIN:</p>
                  <div className="bg-purple-800/50 border border-purple-600 rounded-lg p-3 flex items-center justify-between">
                    <p className="text-2xl font-bold text-white font-mono flex-1 text-center">
                      {contextRoomCode || roomCodeFromUrl || "N/A"}
                    </p>
                    <button
                      onClick={handleCopyPin}
                      className={`p-2 rounded-lg transition-colors ml-2 flex-shrink-0 ${
                        copiedPin 
                          ? 'bg-green-600 text-white' 
                          : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                      }`}
                      title={copiedPin ? 'Copied!' : 'Copy PIN'}
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
                    </button>
                  </div>
                </div>
                
                <div>
                  <p className="text-gray-300 mb-2">Prize pool:</p>
                  {showPrizePool ? (
                    <div className="bg-purple-950/30 border border-purple-700/50 rounded-lg p-3 flex flex-col gap-1">
                      <span className="text-2xl font-bold text-white">
                        {formattedPrizeAmount} {prizeTokenSymbol}
                      </span>
                      <span className="text-xs text-gray-300">
                        {prizeTokenName}
                        {shortPrizeToken ? ` • ${shortPrizeToken}` : ""}
                      </span>
                    </div>
                  ) : (
                    <div className="bg-purple-950/20 border border-purple-700/40 rounded-lg p-3 text-sm text-gray-300">
                      Quiz creator hasn&apos;t funded a prize yet.
                    </div>
                  )}
                </div>

                {formattedScheduledStart && (
                  <div className="mt-4">
                    <p className="text-gray-300 mb-2">Scheduled start:</p>
                    <div className="bg-purple-950/30 border border-purple-700/50 rounded-lg p-3 text-sm text-gray-100">
                      {formattedScheduledStart}
                    </div>
                    {timeRemainingMs !== null && timeRemainingMs > 0 && (
                      <p className="mt-1 text-xs text-purple-200">
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
                      <p className="text-gray-300 mb-2">
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
                      className="w-full py-2 px-4 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-semibold transition-colors"
                    >
                      View Results
                    </button>
                  </div>
                )}

                <div className="pt-2 border-t border-purple-700/50">
                  Status:{" "}
                  <span className="capitalize">
                    {currentGame?.status || gameData?.status || "waiting"}
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-purple-800/40 border border-purple-600/50 rounded-lg p-6 mb-8 w-full max-w-md">
              <h2 className="text-xl font-semibold mb-4 text-purple-200 flex items-center justify-between">
                <span>Players ({filteredPlayers.length})</span>
                {filteredPlayers.length > 0 && (
                  <span className="text-sm text-green-400 flex items-center gap-1">
                    <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
                    Live
                  </span>
                )}
              </h2>

              {filteredPlayers.length === 0 ? (
                <p className="text-gray-400">Waiting for players to join...</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {filteredPlayers.map((player) => (
                    <div
                      key={player.id}
                      className="bg-purple-700/30 border border-purple-500/30 p-3 rounded text-center text-purple-100 relative group hover:bg-purple-700/50 transition-colors"
                    >
                      <div className="font-medium truncate" title={player.player_name}>
                        {player.player_name}
                      </div>
                      {player.total_score > 0 && (
                        <div className="text-xs text-purple-300 mt-1">
                          {player.total_score} pts
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Chat Component */}
            <div className="bg-purple-800/40 border border-purple-600/50 rounded-lg p-6 mb-8 w-full max-w-md">
        <h2 className="text-xl font-semibold mb-4 text-purple-200 flex items-center justify-between">
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
        <div className="rounded-lg p-4 mb-4 max-h-64 overflow-y-auto bg-purple-900/30">
          {messages.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-4">No messages yet. Start the conversation!</p>
          ) : (
            <div className="space-y-1">
              {messages.map((message) => {
                const messageReactions = reactions[message.id] || {};
                const playerSessionId = localStorage.getItem("playerSessionId");
                const isCurrentUser = playerSessionId === message.player_session_id;
                
                return (
                  <div
                    key={message.id}
                    className={`py-1 px-2 rounded hover:bg-purple-700/20 transition-colors ${
                      message.is_creator ? "bg-yellow-500/10 border-l-2 border-yellow-400" : ""
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      {message.is_creator && (
                        <span className="text-yellow-400 font-semibold text-sm flex-shrink-0">👑</span>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2">
                          <span className={`text-sm font-semibold ${
                            message.is_creator ? "text-yellow-300" : "text-purple-200"
                          }`}>
                            {message.player_name}
                            {isCurrentUser && " (you)"}
                          </span>
                          <span className="text-xs text-gray-400">
                            {new Date(message.created_at).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                              second: "2-digit",
                            })}
                          </span>
                        </div>
                        <p className="text-gray-100 text-sm whitespace-pre-wrap break-words mt-0.5">
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
                                    className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs transition-colors ${
                                      hasReacted
                                        ? "bg-purple-600/30 border border-purple-500/50 text-purple-200"
                                        : "bg-gray-700/50 border border-gray-600/50 text-gray-300 hover:bg-gray-700/70"
                                    }`}
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
                                    className="flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-gray-700/50 border border-gray-600/50 text-gray-300"
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
                                  className="px-2 py-0.5 rounded text-xs bg-gray-700/50 border border-gray-600/50 text-gray-400 hover:bg-gray-700/70 hover:text-gray-300 transition-colors"
                                  title="Add reaction"
                                >
                                  <span>+</span>
                                </button>
                                {openEmojiPicker === message.id && (
                                  <div className="absolute bottom-full left-0 mb-2 flex gap-1 bg-gray-800 border border-gray-700 rounded-lg p-2 shadow-lg z-10">
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
                className="flex-1 min-w-0 px-4 py-2 rounded bg-white border border-gray-300 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
                maxLength={500}
                disabled={isSendingMessage}
              />
              <button
                type="submit"
                disabled={!messageText.trim() || isSendingMessage}
                className="flex-shrink-0 px-6 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 disabled:cursor-not-allowed rounded text-white font-medium transition-colors"
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
            <p className="text-xs text-gray-400">Everyone in the lobby can chat</p>
          </form>
        )}
      </div>

            {joined && (
              <div className="w-full max-w-md flex flex-col gap-4">
                <div className="relative bg-purple-600/20 border border-purple-500 rounded-lg p-4 text-center">
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
                    <p className="text-sm text-gray-300">
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
                      backgroundColor: "#22c55e", // green-500 - same as correct answers
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = "#16a34a"; // green-600 on hover
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = "#22c55e"; // green-500 normal state
                    }}
                  >
                    Start Quiz ({filteredPlayers.length} {filteredPlayers.length === 1 ? 'player' : 'players'})
                  </button>
                )}

                <button
                  onClick={handleLeaveLobby}
                  className="w-full py-2 bg-purple-800/50 border border-purple-600/50 hover:bg-purple-700/50 rounded text-purple-100 font-medium text-center transition-colors"
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
