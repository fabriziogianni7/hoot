"use client";

import { useEffect, useState, Suspense, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";

// Disable pre-rendering for this page
export const dynamic = "force-dynamic";
import { useQuiz } from "@/lib/quiz-context";
import { useAccount } from "wagmi";
import { useSupabase } from "@/lib/supabase-context";
import { useMiniKit } from "@coinbase/onchainkit/minikit";
import Link from "next/link";
import { useAuth } from "@/lib/use-auth";
import { usePlayerSessionsRealtime } from "@/lib/use-realtime-hooks";

function LobbyContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
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
  const { loggedUser, isAuthLoading, authError, triggerAuth } = useAuth();
  const [countdown, setCountdown] = useState<number | null>(null);
  const [playerName, setPlayerName] = useState("");
  const [joined, setJoined] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState("");

  const roomCodeFromUrl = searchParams?.get("room");
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

  const quiz = getCurrentQuiz() || quizData;

  // Initialize the miniapp
  useEffect(() => {
    if (!isFrameReady) {
      setFrameReady();
    }
  }, [setFrameReady, isFrameReady]);

  // Load game session if room code is provided
  useEffect(() => {
    const loadGameSession = async () => {
      if (!roomCodeFromUrl) {
        setIsLoadingGame(false);
        return;
      }

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
  }, [roomCodeFromUrl, supabase, setCurrentQuiz]);

  // Check if player is already joined and if they're the creator
  useEffect(() => {
    const playerSessionId = localStorage.getItem("playerSessionId");
    if (playerSessionId && currentGame) {
      const playerExists = currentGame.players.some(
        (p) => p.id === playerSessionId
      );
      if (playerExists) {
        setJoined(true);
      }
    }

    // Check if this player is the creator
    if (playerSessionId && gameData?.creator_session_id) {
      setIsCreator(playerSessionId === gameData.creator_session_id);
    }
  }, [currentGame, gameData]);

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

            // When game starts, trigger countdown for all players
            if (updatedSession.status === "in_progress" && countdown === null) {
              console.log("Game started! Starting countdown...");
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
      setCountdown(countdown - 1);

      if (countdown === 1) {
        // Start the quiz when countdown reaches 0
        // Only navigate if the player has joined
        if (joined && currentGame) {
          const roomCodeToUse = contextRoomCode || roomCodeFromUrl;
          const quizId = currentGame.quizId || gameData?.quiz_id;

          console.log("Countdown finished, redirecting to play page");
          console.log("Room code:", roomCodeToUse, "Quiz ID:", quizId);

          // Pass room code and quiz ID via URL parameters
          const params = new URLSearchParams();
          if (roomCodeToUse) params.set("room", roomCodeToUse);
          if (quizId) params.set("quizId", quizId);

          router.push(`/quiz/play?${params.toString()}`);
        } else {
          console.warn(
            "Cannot navigate to play page: player not joined or game not ready"
          );
        }
      }
    }, 1000);

    return () => clearTimeout(timer);
  }, [
    countdown,
    router,
    joined,
    currentGame,
    contextRoomCode,
    roomCodeFromUrl,
    gameData,
  ]);

  const handleManualReconnect = () => {
    console.log("Manual reconnect triggered");
    gameStatusReconnectAttemptsRef.current = 0;
    gameStatusIsReconnectingRef.current = false;
    // Reload the page to reset connection
    window.location.reload();
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();

    if (playerName.trim() && !isJoining) {
      setIsJoining(true);
      setError("");

      try {
        // Check if user is authenticated, if not trigger authentication
        if (!loggedUser?.isAuthenticated || !loggedUser?.session) {
          console.log("User not authenticated, triggering auth...");
          await triggerAuth();

          // After triggerAuth completes, check again if user is now authenticated
          // If still not authenticated, the auth flow was cancelled or failed
          if (!loggedUser?.isAuthenticated) {
            setError("Authentication required to join the game.");
            setIsJoining(false);
            return;
          }
        }

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
        setError("Error joining game. Please try again.");
      } finally {
        setIsJoining(false);
      }
    }
  };

  const handleStartQuiz = async () => {
    try {
      if (!gameSessionId) return;

      console.log("Starting quiz - updating game status");

      // Update game status to in_progress immediately
      // All clients will receive this via realtime and start countdown
      await supabase
        .from("game_sessions")
        .update({
          status: "in_progress",
          started_at: new Date().toISOString(),
          question_started_at: new Date().toISOString(),
        })
        .eq("id", gameSessionId);

      console.log("Game status updated to in_progress");
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

  if (isLoadingGame) {
    return (
      <div className="min-h-screen w-full bg-black text-white relative overflow-hidden flex items-center justify-center">
        <div className="animate-pulse text-2xl font-bold">Loading game...</div>
      </div>
    );
  }

  if (!quiz && !quizData) {
    return (
      <div className="min-h-screen w-full bg-black text-white relative overflow-hidden flex items-center justify-center">
        <div className="text-center">
          <div className="text-2xl font-bold mb-4">Game not found</div>
          <Link href="/" className="text-blue-400 hover:underline">
            Go back home
          </Link>
        </div>
      </div>
    );
  }

  return (
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

        <h1 className="text-3xl font-bold mb-8">
          {quiz?.title || "Quiz Lobby"}
        </h1>

        {countdown !== null && (
          <div className="mb-8 text-center">
            <div className="text-6xl font-bold mb-4">{countdown}</div>
            <p className="text-xl">Quiz starting soon...</p>
          </div>
        )}

        {countdown === null && (
          <>
            <div className="bg-purple-900/30 border border-purple-700/50 rounded-lg p-6 mb-8 w-full max-w-md">
              <h2 className="text-xl font-semibold mb-4 text-purple-200">
                Quiz Details
              </h2>
              <ul className="space-y-2">
                <li>
                  Game PIN:{" "}
                  <span className="font-mono font-bold text-2xl">
                    {contextRoomCode || roomCodeFromUrl || "N/A"}
                  </span>
                </li>
                <li>
                  Status:{" "}
                  <span className="capitalize">
                    {currentGame?.status || gameData?.status || "waiting"}
                  </span>
                </li>
              </ul>
            </div>

            <div className="bg-purple-800/40 border border-purple-600/50 rounded-lg p-6 mb-8 w-full max-w-md">
              <h2 className="text-xl font-semibold mb-4 text-purple-200 flex items-center justify-between">
                <span>Players ({players.length})</span>
                {players.length > 0 && (
                  <span className="text-sm text-green-400 flex items-center gap-1">
                    <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
                    Live
                  </span>
                )}
              </h2>

              {players.length === 0 ? (
                <p className="text-gray-400">Waiting for players to join...</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {players.map((player) => (
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

            {!joined ? (
              <form onSubmit={handleJoin} className="w-full max-w-md">
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
                    : !loggedUser?.isAuthenticated || !loggedUser?.session
                    ? "Connect Wallet to Join"
                    : "Join Quiz"}
                </button>
              </form>
            ) : (
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
                {isCreator && players.length > 0 && (
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
                    Start Quiz ({players.length} {players.length === 1 ? 'player' : 'players'})
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
        )}
      </div>
    </div>
  );
}

export default function LobbyPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen w-full bg-black text-white flex items-center justify-center">
          Loading...
        </div>
      }
    >
      <LobbyContent />
    </Suspense>
  );
}
