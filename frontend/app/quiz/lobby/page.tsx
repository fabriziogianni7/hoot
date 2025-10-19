"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMiniKit } from "@coinbase/onchainkit/minikit";

// Disable pre-rendering for this page
export const dynamic = 'force-dynamic';
import { useQuiz } from "@/lib/quiz-context";
import { useSupabase } from "@/lib/supabase-context";
import { useAccount } from "wagmi";
import Link from "next/link";

function LobbyContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isFrameReady, setFrameReady } = useMiniKit();
  const { currentGame, getCurrentQuiz, joinGame: joinGameContext, roomCode: contextRoomCode, gameSessionId, setCurrentQuiz } = useQuiz();
  const { address } = useAccount();
  const { supabase } = useSupabase();
  const [countdown, setCountdown] = useState<number | null>(null);
  const [playerName, setPlayerName] = useState("");
  const [joined, setJoined] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState("");
  
  const roomCodeFromUrl = searchParams?.get("room");
  const [isLoadingGame, setIsLoadingGame] = useState(true);
  const [gameData, setGameData] = useState<{ id: string; creator_session_id?: string; status?: string; quiz_id?: string; quizzes?: { id: string; title: string; description: string; created_at: string } } | null>(null);
  const [quizData, setQuizData] = useState<{ id: string; title: string; description: string; questions: Array<{ id: string; text: string; options: string[]; correctAnswer: number; timeLimit: number }>; createdAt: Date } | null>(null);
  const [isCreator, setIsCreator] = useState(false);
  
  const quiz = getCurrentQuiz() || quizData;

  // Initialize the miniapp
  useEffect(() => {
    console.log('isFrameReady', isFrameReady);
    if (!isFrameReady) {
      console.log('setting frame ready');
      setFrameReady();
    }
  }, [setFrameReady, isFrameReady]);
  console.log('isFrameReady', isFrameReady);
  
  // Load game session if room code is provided
  useEffect(() => {
    const loadGameSession = async () => {
      if (!roomCodeFromUrl) {
        setIsLoadingGame(false);
        return;
      }




      console.log('roomCodeFromUrl', roomCodeFromUrl);
      try {
        console.log('Loading game session for room code:', roomCodeFromUrl);
        
        // Fetch game session from backend
        const { data: gameSession, error: gameError } = await supabase
          .from('game_sessions')
          .select(`
            *,
            quizzes (*)
          `)
          .eq('room_code', roomCodeFromUrl)
          .single();

        if (gameError || !gameSession) {
          console.error('Game session not found:', gameError);
          setError(`Game with PIN "${roomCodeFromUrl}" not found.`);
          setIsLoadingGame(false);
          return;
        }

        console.log('Game session loaded:', gameSession);
        setGameData(gameSession);

        // Load quiz questions
        const { data: questionsData, error: questionsError } = await supabase
          .from('questions')
          .select('*')
          .eq('quiz_id', gameSession.quiz_id)
          .order('order_index', { ascending: true });

        if (!questionsError && questionsData) {
          // Convert to frontend quiz format
          const quiz = {
            id: gameSession.quizzes.id,
            title: gameSession.quizzes.title,
            description: gameSession.quizzes.description || "",
            questions: questionsData.map((q: { id: string; question_text: string; options: string[]; correct_answer_index: number; time_limit: number }) => ({
              id: q.id,
              text: q.question_text,
              options: q.options,
              correctAnswer: q.correct_answer_index,
              timeLimit: q.time_limit || 15
            })),
            createdAt: new Date(gameSession.quizzes.created_at)
          };
          setQuizData(quiz);
          
          // Important: Set quiz as current quiz so it's available on the play page
          // This is needed because the play page relies on getCurrentQuiz()
          setCurrentQuiz(quiz);
        }

        // Load existing players
        const { data: playersData } = await supabase
          .from('player_sessions')
          .select('*')
          .eq('game_session_id', gameSession.id)
          .order('joined_at', { ascending: true });

        console.log('Existing players:', playersData);

        setIsLoadingGame(false);
      } catch (err) {
        console.error('Error loading game session:', err);
        setError('Failed to load game session');
        setIsLoadingGame(false);
      }
    };

    loadGameSession();
  }, [roomCodeFromUrl, supabase, setCurrentQuiz]);

  // Check if player is already joined and if they're the creator
  useEffect(() => {
    const savedPlayerId = localStorage.getItem("quizPlayerId");
    if (savedPlayerId && currentGame) {
      const playerExists = currentGame.players.some(p => p.id === savedPlayerId);
      if (playerExists) {
        setJoined(true);
      }
    }
    
    // Check if this player is the creator
    if (savedPlayerId && gameData?.creator_session_id) {
      setIsCreator(savedPlayerId === gameData.creator_session_id);
    }
  }, [currentGame, gameData]);

  // Listen for game status changes via realtime
  useEffect(() => {
    if (!gameSessionId) return;

    const channel = supabase
      .channel(`game_status:${gameSessionId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'game_sessions',
          filter: `id=eq.${gameSessionId}`
        },
        (payload) => {
          console.log('Game session updated:', payload.new);
          const updatedSession = payload.new as { status: string };
          
          // When game starts, trigger countdown for all players
          if (updatedSession.status === 'in_progress' && countdown === null) {
            console.log('Game started! Starting countdown...');
            setCountdown(3);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
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
          
          console.log('Countdown finished, redirecting to play page');
          console.log('Room code:', roomCodeToUse, 'Quiz ID:', quizId);
          
          // Pass room code and quiz ID via URL parameters
          const params = new URLSearchParams();
          if (roomCodeToUse) params.set('room', roomCodeToUse);
          if (quizId) params.set('quizId', quizId);
          
          router.push(`/quiz/play?${params.toString()}`);
        } else {
          console.warn('Cannot navigate to play page: player not joined or game not ready');
        }
      }
    }, 1000);
    
    return () => clearTimeout(timer);
  }, [countdown, router, joined, currentGame, contextRoomCode, roomCodeFromUrl, gameData]);
  
  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (playerName.trim() && !isJoining) {
      setIsJoining(true);
      setError("");
      
      try {
        const roomCodeToUse = roomCodeFromUrl || contextRoomCode;
        if (!roomCodeToUse) {
          setError('No room code available');
          return;
        }
        
        const playerId = await joinGameContext(playerName, address || undefined, roomCodeToUse);
        setJoined(true);
        // Store player ID in localStorage for persistence
        localStorage.setItem("quizPlayerId", playerId);
      } catch (err) {
        console.error('Error joining game:', err);
        setError('Error joining game. Please try again.');
      } finally {
        setIsJoining(false);
      }
    }
  };
  
  const handleStartQuiz = async () => {
    try {
      if (!gameSessionId) return;
      
      console.log('Starting quiz - updating game status');
      
      // Update game status to in_progress immediately
      // All clients will receive this via realtime and start countdown
      await supabase
        .from('game_sessions')
        .update({ 
          status: 'in_progress',
          started_at: new Date().toISOString()
        })
        .eq('id', gameSessionId);
        
      console.log('Game status updated to in_progress');
    } catch (err) {
      console.error('Error starting quiz:', err);
      setError('Failed to start quiz. Please try again.');
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
          <Link href="/" className="text-blue-400 hover:underline">Go back home</Link>
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
          backgroundPosition: "center"
        }}
      />
      
      
      <div className="relative z-10 container mx-auto py-8 px-4 flex flex-col items-center">
        <h1 className="text-3xl font-bold mb-8">{quiz?.title || 'Quiz Lobby'}</h1>
        
        {countdown !== null && (
          <div className="mb-8 text-center">
            <div className="text-6xl font-bold mb-4">{countdown}</div>
            <p className="text-xl">Quiz starting soon...</p>
          </div>
        )}
        
        {countdown === null && (
          <>
            <div className="bg-gray-900/50 rounded-lg p-6 mb-8 w-full max-w-md">
              <h2 className="text-xl font-semibold mb-4">Quiz Details</h2>
              <ul className="space-y-2">
                <li>Number of questions: {quiz?.questions?.length || 0}</li>
                <li>Game PIN: <span className="font-mono font-bold text-2xl">{contextRoomCode || roomCodeFromUrl || 'N/A'}</span></li>
                <li>Status: <span className="capitalize">{currentGame?.status || gameData?.status || 'waiting'}</span></li>
              </ul>
            </div>
            
            <div className="bg-gray-900/50 rounded-lg p-6 mb-8 w-full max-w-md">
              <h2 className="text-xl font-semibold mb-4">
                Players ({currentGame?.players?.length || 0})
              </h2>
              
              {!currentGame?.players || currentGame.players.length === 0 ? (
                <p className="text-gray-400">Waiting for players to join...</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {currentGame.players.map((player) => (
                    <div key={player.id} className="bg-gray-800 p-2 rounded text-center">
                      {player.name}
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
                  disabled={isJoining}
                  className="w-full py-2 bg-blue-600 hover:bg-blue-700 rounded text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isJoining ? 'Joining...' : 'Join Quiz'}
                </button>
              </form>
            ) : (
              <div className="w-full max-w-md flex flex-col gap-4">
                <div className="bg-green-600/20 border border-green-500 rounded-lg p-4 text-center">
                  <p>You&apos;ve joined as <strong>{playerName}</strong></p>
                  {isCreator ? (
                    <p className="text-sm text-yellow-300 font-semibold">👑 You are the quiz creator</p>
                  ) : (
                    <p className="text-sm text-gray-300">Waiting for the quiz creator to start...</p>
                  )}
                </div>
                
                {/* Only show Start Quiz button to the creator */}
                {isCreator && currentGame && currentGame.players.length > 0 && (
                  <button
                    onClick={handleStartQuiz}
                    className="w-full py-2 bg-green-600 hover:bg-green-700 rounded text-white font-medium"
                  >
                    Start Quiz
                  </button>
                )}
                
                <Link 
                  href="/quiz"
                  className="w-full py-2 bg-gray-700 hover:bg-gray-600 rounded text-white font-medium text-center"
                >
                  Exit Quiz
                </Link>
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
    <Suspense fallback={<div className="min-h-screen w-full bg-black text-white flex items-center justify-center">Loading...</div>}>
      <LobbyContent />
    </Suspense>
  );
}