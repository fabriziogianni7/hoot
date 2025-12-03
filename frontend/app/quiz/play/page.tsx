"use client";

import { useEffect, useState, useRef, Suspense, useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";

// Disable pre-rendering for this page
export const dynamic = 'force-dynamic';
import { useQuiz } from "@/lib/quiz-context";
import { useSupabase } from "@/lib/supabase-context";
import { useAnswersRealtime } from "@/lib/use-realtime-hooks";
import { useDriverPresence } from "@/lib/use-driver-presence";
import { useSound } from "@/lib/sound-context";
import { hapticSelection } from "@/lib/haptics";

type Phase = "question" | "results" | "countdown";

const QUESTION_PHASE_SECONDS = 15;
const RESULTS_PHASE_SECONDS = 10;
const COUNTDOWN_PHASE_SECONDS = 5;

type PhaseEventPayload = {
  phase: Phase;
  phaseEndsAt: number;
  questionIndex: number;
};

function PlayQuizContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { playSfx, stopSfx, setBackgroundEnabled } = useSound();
  const {
    currentGame,
    getCurrentQuiz,
    submitAnswer,
    nextQuestion,
    setCurrentQuiz,
    gameSessionId,
    roomCode,
  } = useQuiz();
  const { supabase } = useSupabase();
  const [timeLeft, setTimeLeft] = useState<number>(10);
  const [initialTime, setInitialTime] = useState<number>(10); // Tempo iniziale per calcolare la percentuale
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [isAnswered, setIsAnswered] = useState(false);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [showingResults, setShowingResults] = useState(false);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState<number>(0);
  const [isCreator, setIsCreator] = useState(false);
  const [showPointsBanner, setShowPointsBanner] = useState(false);
  const [earnedPoints, setEarnedPoints] = useState(0);
  const [showConfetti, setShowConfetti] = useState(false);
  const [creatorSessionId, setCreatorSessionId] = useState<string | null>(null);
  const [playerSessionId, setPlayerSessionId] = useState<string | null>(null);
  const [nextQuestionCountdown, setNextQuestionCountdown] = useState<number | null>(null);
  const [phase, setPhase] = useState<Phase>("question");
  const [phaseEndsAt, setPhaseEndsAt] = useState<number | null>(null);
  const [phaseQuestionIndex, setPhaseQuestionIndex] = useState<number>(0);
  const [resultsCountdown, setResultsCountdown] = useState<number | null>(null);
  const [roomCodeCopied, setRoomCodeCopied] = useState(false);
  const [spectateUntilIndex, setSpectateUntilIndex] = useState<number | null>(null);
  const nextQuestionChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const { isDriver, driverId, participants } = useDriverPresence(
    gameSessionId,
    playerSessionId,
    creatorSessionId
  );

  const handleCopyRoomCode = useCallback(async () => {
    if (!roomCode) return;
    try {
      await navigator.clipboard.writeText(roomCode);
      setRoomCodeCopied(true);
      setTimeout(() => setRoomCodeCopied(false), 1500);
    } catch (err) {
      console.error("Failed to copy room code:", err);
    }
  }, [roomCode]);
  
  // Use realtime hook for answers (creator only)
  const { playerResponses } = useAnswersRealtime(
    gameSessionId,
    currentGame?.players.map(p => p.id) || [],
    isCreator
  );

  // Log driver changes for easier debugging
  useEffect(() => {
    if (!gameSessionId) return;
    const activeDriver = driverId || "none";
    if (driverLogRef.current !== activeDriver) {
      console.log(
        `[Driver] Game ${gameSessionId} active driver: ${activeDriver} (this client: ${
          playerSessionId || "unknown"
        }, participants: ${participants.length})`
      );
      driverLogRef.current = activeDriver;
    }
  }, [driverId, gameSessionId, playerSessionId, participants]);

  useEffect(() => {
    if (!playerSessionId) return;
    if (prevIsDriverRef.current !== isDriver) {
      console.log(
        `[Driver] ${playerSessionId} ${
          isDriver ? "acquired" : "released"
        } driver role for game ${gameSessionId || "unknown"}`
      );
      prevIsDriverRef.current = isDriver;
    }
  }, [isDriver, playerSessionId, gameSessionId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = localStorage.getItem("spectateUntilQuestionIndex");
    if (stored) {
      const parsed = parseInt(stored, 10);
      if (!Number.isNaN(parsed)) {
        setSpectateUntilIndex(parsed);
      } else {
        localStorage.removeItem("spectateUntilQuestionIndex");
      }
    }
  }, []);

  useEffect(() => {
    if (
      spectateUntilIndex !== null &&
      currentQuestionIndex >= spectateUntilIndex
    ) {
      setSpectateUntilIndex(null);
      if (typeof window !== "undefined") {
        localStorage.removeItem("spectateUntilQuestionIndex");
      }
    }
  }, [currentQuestionIndex, spectateUntilIndex]);
  
  // Utilizziamo useRef per mantenere lo stato del timer tra i render
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const phaseTimerRef = useRef<NodeJS.Timeout | null>(null);
  const driverLogRef = useRef<string | null>(null);
  const prevIsDriverRef = useRef<boolean>(false);
  const timePercentageRef = useRef<number>(100);
  const hasAnsweredRef = useRef<boolean>(false); // Track if answer was submitted
  const lastTickSecondRef = useRef<number | null>(null); // For ticking SFX
  
  const [isLoadingFromUrl, setIsLoadingFromUrl] = useState(true);
  
  const quiz = getCurrentQuiz();

  // Disable background music for the entire quiz play experience; re-enable on exit
  useEffect(() => {
    setBackgroundEnabled(false);
    return () => {
      // Ensure music is re-enabled if this component unmounts
      setBackgroundEnabled(true);
    };
  }, [setBackgroundEnabled]);

  const leaderboardContent = useMemo(() => {
    if (!currentGame) return null;

    const nonCreatorPlayers = currentGame.players
      .filter((player) => player.id !== creatorSessionId)
      .sort((a, b) => b.score - a.score);

    if (nonCreatorPlayers.length === 0) {
      return (
        <p className="text-center text-purple-200 text-sm">
          No player scores yet.
        </p>
      );
    }

    const sessionId = playerSessionId;
    const top5 = nonCreatorPlayers.slice(0, 5);
    const currentPlayerIndex =
      sessionId !== null
        ? nonCreatorPlayers.findIndex((player) => player.id === sessionId)
        : -1;
    const currentPlayer =
      currentPlayerIndex >= 0 ? nonCreatorPlayers[currentPlayerIndex] : null;
    const isCurrentPlayerInTop5 =
      currentPlayerIndex >= 0 && currentPlayerIndex < 5;

    return (
      <>
        {top5.map((player, index) => {
          const isCurrentPlayer = sessionId !== null && player.id === sessionId;
          return (
            <div
              key={player.id}
              className={`flex items-center justify-between p-3 rounded-lg ${
                isCurrentPlayer
                  ? "bg-purple-700/50 border-2 border-purple-400"
                  : "bg-purple-700/20 border border-purple-500/30"
              }`}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${
                    index < 3
                      ? "bg-yellow-500/30 text-yellow-300"
                      : "bg-gray-700 text-gray-300"
                  }`}
                >
                  {index === 0 && "👑"}
                  {index === 1 && "🥈"}
                  {index === 2 && "🥉"}
                  {index >= 3 && index + 1}
                </div>
                <span
                  className={`font-medium ${
                    isCurrentPlayer ? "text-purple-100" : "text-white"
                  }`}
                >
                  {player.name}
                  {isCurrentPlayer && " (You)"}
                </span>
              </div>
              <span className="font-bold text-purple-200">{player.score} pts</span>
            </div>
          );
        })}

        {!isCurrentPlayerInTop5 && currentPlayer && (
          <>
            <div className="h-px bg-purple-600/50 my-2"></div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-purple-700/50 border-2 border-purple-400">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold bg-gray-700 text-gray-300">
                  {currentPlayerIndex + 1}
                </div>
                <span className="font-medium text-purple-100">
                  {currentPlayer.name} (You)
                </span>
              </div>
              <span className="font-bold text-purple-200">{currentPlayer.score} pts</span>
            </div>
          </>
        )}
      </>
    );
  }, [currentGame, creatorSessionId, playerSessionId]);

  const totalQuestions = quiz?.questions.length ?? 0;
  const isPhaseLastQuestion =
    totalQuestions > 0 ? phaseQuestionIndex >= totalQuestions - 1 : false;

  // Cache player session ID (used for presence + driver election)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const storedSessionId = localStorage.getItem("playerSessionId");
    setPlayerSessionId(storedSessionId);
  }, []);
  
  // Load quiz from URL parameters if not in context
  useEffect(() => {
    const loadQuizFromUrl = async () => {
      const quizIdFromUrl = searchParams?.get('quizId');
      const roomCodeFromUrl = searchParams?.get('room');
      
      console.log('Play page - URL params:', { quizIdFromUrl, roomCodeFromUrl });
      
      // If quiz is already loaded, we're good
      if (quiz || !quizIdFromUrl) {
        setIsLoadingFromUrl(false);
        return;
      }
      
      try {
        console.log('Loading quiz from backend with ID:', quizIdFromUrl);
        
        // Fetch quiz from backend
        const { data: quizData, error: quizError } = await supabase
          .from('quizzes')
          .select('*')
          .eq('id', quizIdFromUrl)
          .single();
          
        if (quizError || !quizData) {
          console.error('Failed to load quiz:', quizError);
          setIsLoadingFromUrl(false);
          return;
        }
        
        // Fetch questions
        const { data: questionsData, error: questionsError } = await supabase
          .from('questions')
          .select('*')
          .eq('quiz_id', quizIdFromUrl)
          .order('order_index', { ascending: true });
          
        if (questionsError) {
          console.error('Failed to load questions:', questionsError);
          setIsLoadingFromUrl(false);
          return;
        }
        
        // Convert to frontend format and add to context
        const loadedQuiz = {
          id: quizData.id,
          title: quizData.title,
          description: quizData.description || "",
          questions: (questionsData || []).map((q: { id: string; question_text: string; options: string[]; correct_answer_index: number; time_limit: number }) => ({
            id: q.id,
            text: q.question_text,
            options: q.options,
            correctAnswer: q.correct_answer_index,
            timeLimit: q.time_limit || 15
          })),
          createdAt: new Date(quizData.created_at)
        };
        
        console.log('Setting current quiz:', loadedQuiz.id);
        setCurrentQuiz(loadedQuiz);
        setIsLoadingFromUrl(false);
      } catch (err) {
        console.error('Error loading quiz from URL:', err);
        setIsLoadingFromUrl(false);
      }
    };
    
    loadQuizFromUrl();
  }, [searchParams, quiz, supabase, setCurrentQuiz]);
  
  // Check if current player is the creator
  useEffect(() => {
    const checkCreator = async () => {
      if (!gameSessionId) return;
      
      const { data } = await supabase
        .from('game_sessions')
        .select('creator_session_id')
        .eq('id', gameSessionId)
        .single();
      
      if (data) {
        const sessionId =
          playerSessionId ??
          (typeof window !== "undefined"
            ? localStorage.getItem("playerSessionId")
            : null);
        setCreatorSessionId(data.creator_session_id);
        if (sessionId) {
          setIsCreator(data.creator_session_id === sessionId);
        }
      }
    };
    
    checkCreator();
  }, [gameSessionId, supabase, playerSessionId]);

  // Subscribe to next question countdown broadcasts
  useEffect(() => {
    if (!gameSessionId) return;

    // Clean up previous channel
    if (nextQuestionChannelRef.current) {
      supabase.removeChannel(nextQuestionChannelRef.current);
      nextQuestionChannelRef.current = null;
    }

    const channel = supabase
      .channel(`next_question:${gameSessionId}`)
      .on(
        'broadcast',
        { event: 'phase_update' },
        (payload) => {
          const data = payload.payload as PhaseEventPayload;
          console.log('Received phase update:', data);
          if (!data) return;

          setPhase(data.phase);
          setPhaseQuestionIndex(data.questionIndex);
          setPhaseEndsAt(data.phaseEndsAt);

          if (data.phase === "countdown") {
            const remaining = Math.max(
              0,
              Math.ceil((data.phaseEndsAt - Date.now()) / 1000)
            );
            setNextQuestionCountdown(remaining);
          } else {
            setNextQuestionCountdown(null);
          }
        }
      )
      .subscribe();

    nextQuestionChannelRef.current = channel;

    return () => {
      if (nextQuestionChannelRef.current) {
        supabase.removeChannel(nextQuestionChannelRef.current);
        nextQuestionChannelRef.current = null;
      }
    };
  }, [gameSessionId, supabase]);

  // Start the game when play page loads (only if coming from "starting" status)
  // This ensures the question timer starts only when players are actually on the play page
  useEffect(() => {
    const startGameIfReady = async () => {
      if (!gameSessionId || !currentGame || !isCreator) return;
      
      // Check if game is in "starting" status (just came from lobby countdown)
      const { data: gameSession } = await supabase
        .from('game_sessions')
        .select('status, current_question_index')
        .eq('id', gameSessionId)
        .single();
      
      if (gameSession?.status === 'starting' && gameSession.current_question_index === 0) {
        console.log('Play page loaded, starting game now (setting in_progress)');
        
        // Now set status to in_progress and start the question timer
        await supabase
          .from('game_sessions')
          .update({
            status: 'in_progress',
            question_started_at: new Date().toISOString(),
          })
          .eq('id', gameSessionId);
        
        console.log('Game status updated to in_progress with question timer started');
      }
    };
    
    // Only run once when the component mounts and we know if we're the creator
    if (isCreator && !isLoadingFromUrl) {
      startGameIfReady();
    }
  }, [gameSessionId, isCreator, isLoadingFromUrl, currentGame, supabase]);
  
  // Redirect if no game is active
  useEffect(() => {
    if (isLoadingFromUrl) return; // Wait for URL loading to complete
    
    if (!currentGame) {
      router.push("/");
      return;
    }
    
    if (currentGame.status === "finished") {
      router.push("/quiz/results");
      return;
    }
    
    // Aggiorna l'indice della domanda corrente
    setCurrentQuestionIndex(currentGame.currentQuestionIndex);
    console.log("Current question index updated:", currentGame.currentQuestionIndex);
  }, [currentGame, router, isLoadingFromUrl]);
  
  const startPhaseWithDuration = useCallback(
    (nextPhase: Phase, durationSeconds: number) => {
      const phaseEndTimestamp = Date.now() + durationSeconds * 1000;
      setPhase(nextPhase);
      setPhaseEndsAt(phaseEndTimestamp);

      if (isDriver) {
        console.log(
          `[Driver] ${playerSessionId || "unknown"} scheduling phase "${nextPhase}" for question ${phaseQuestionIndex} (duration ${durationSeconds}s)`
        );
      }

      if (isDriver && nextQuestionChannelRef.current) {
        nextQuestionChannelRef.current.send({
          type: 'broadcast',
          event: 'phase_update',
          payload: {
            phase: nextPhase,
            phaseEndsAt: phaseEndTimestamp,
            questionIndex: phaseQuestionIndex,
          } satisfies PhaseEventPayload,
        });
      }
    },
    [isDriver, phaseQuestionIndex, playerSessionId]
  );

  const advancePhase = useCallback(async () => {
    if (!quiz) return;

    if (phase === "question") {
      startPhaseWithDuration("results", RESULTS_PHASE_SECONDS);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setTimeLeft(0);
      setShowingResults(true);
      return;
    }

    if (phase === "results") {
      const isFinalQuestion =
        quiz.questions.length > 0 &&
        phaseQuestionIndex >= quiz.questions.length - 1;

      if (isFinalQuestion) {
        setPhaseEndsAt(null);
        setNextQuestionCountdown(null);

        if (isDriver) {
          console.log(
            `[Driver] ${playerSessionId || "unknown"} final question complete – moving to results page`
          );
          await nextQuestion();
        }
      } else {
        startPhaseWithDuration("countdown", COUNTDOWN_PHASE_SECONDS);
      }

      return;
    }

    if (phase === "countdown") {
      setPhaseEndsAt(null);

      if (isDriver) {
        console.log(
          `[Driver] ${playerSessionId || "unknown"} advancing to next question from countdown`
        );
        await nextQuestion();
        setNextQuestionCountdown(null);
      }
    }
  }, [
    phase,
    quiz,
    isDriver,
    startPhaseWithDuration,
    nextQuestion,
    phaseQuestionIndex,
    playerSessionId,
  ]);

  // Funzione per gestire il timeout
  const handleTimeUp = useCallback(async () => {
    // Check ref first to avoid race conditions
    if (hasAnsweredRef.current) {
      console.log("Answer already submitted, ignoring timeout");
      return;
    }
    
    // Only handle timeout if no answer was given and not already showing results
    if (!isAnswered && !showingResults && selectedAnswer === null) {
      console.log("Handling timeout - no answer given");
      hasAnsweredRef.current = true;
      setIsAnswered(true);
      setSelectedAnswer(-1); // Set to -1 to indicate timeout
      // Stop any ticking immediately
      stopSfx("tick");
      
      // Show timeout banner with 0 points (only for players, not creator)
      if (!isCreator) {
        // Timeout is treated as an incorrect answer
        playSfx("wrong");
        setEarnedPoints(0);
        setShowPointsBanner(true);
        setTimeout(() => {
          setShowPointsBanner(false);
          // Show question review after banner disappears (3 seconds after banner appeared)
          setShowingResults(true);
        }, 3000);
      } else {
        // For creator, show results immediately (no banner)
        setShowingResults(true);
      }
      
      // Auto-submit -1 for no answer (only for non-creators, since creators don't answer)
      if (!isCreator) {
        const playerSessionId = localStorage.getItem("playerSessionId");
        if (playerSessionId && quiz && currentGame) {
          const question = quiz.questions[currentQuestionIndex];
          if (question) {
            const maxTime = question.timeLimit * 1000; // Convert to milliseconds
            try {
              await submitAnswer(playerSessionId, question.id, -1, maxTime);
            } catch (error) {
              console.error('Error submitting timeout answer:', error);
            }
          }
        }
      }
      
      // Creator has manual control via "Next Question" button, no automatic advancement
      // Non-creators wait for creator to advance
    }
  }, [isAnswered, showingResults, selectedAnswer, isCreator, quiz, currentGame, currentQuestionIndex, submitAnswer]);
  
  // Funzione per avviare il timer
  const startTimer = useCallback(() => {
    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        const newTime = prev <= 1 ? 0 : prev - 1;
        
        // Aggiorna la percentuale del tempo rimanente
        timePercentageRef.current = (newTime / initialTime) * 100;
        
        if (newTime === 0 && timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;

          console.log("calling handleTimeUp");
          // Use a timeout to ensure state has updated
          setTimeout(() => {
            setIsAnswered(prev => {
              if (!prev) {
                handleTimeUp();
              }
              return prev;
            });
          }, 0);
        }
        
        return newTime;
      });
    }, 1000);
  }, [initialTime, handleTimeUp]);
  
  // Play ticking sound while the question timer is running
  useEffect(() => {
    if (phase !== "question") return;
    if (isAnswered || showingResults) return;
    if (timeLeft <= 0) return;

    const wholeSecondsLeft = Math.floor(timeLeft);
    if (lastTickSecondRef.current !== wholeSecondsLeft) {
      lastTickSecondRef.current = wholeSecondsLeft;
      playSfx("tick");
    }
  }, [phase, isAnswered, showingResults, timeLeft, playSfx]);
  
  // Reset states when question changes
  useEffect(() => {
    if (!currentGame || !quiz) return;

    // Pulisci il timer precedente se esiste
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    
    // Reset states FIRST - this must run every time the question changes
    hasAnsweredRef.current = false; // Reset answer tracking ref
    lastTickSecondRef.current = null; // Reset ticking tracker
    // Ensure ticking sound is stopped when switching questions
    stopSfx("tick");
    setSelectedAnswer(null);
    setIsAnswered(false);
    setShowingResults(false);
    setShowPointsBanner(false);
    setShowConfetti(false);
    setNextQuestionCountdown(null); // Reset countdown when question changes
    timePercentageRef.current = 100;
    
    // Get server start time for synchronized timing
    const questionStartTimeFromServer = currentGame.questionStartTime;
    if (questionStartTimeFromServer) {
      // Calculate elapsed time since question started
      const now = Date.now();
      const currentQuestion = quiz?.questions[currentQuestionIndex];
      const questionTimeLimit = currentQuestion?.timeLimit || QUESTION_PHASE_SECONDS;
      const elapsed = Math.floor((now - questionStartTimeFromServer) / 1000);
      const remaining = Math.max(0, questionTimeLimit - elapsed);
      
      setTimeLeft(remaining);
      setInitialTime(questionTimeLimit);
      setPhase("question");
      setPhaseQuestionIndex(currentQuestionIndex);
      setPhaseEndsAt(questionStartTimeFromServer + questionTimeLimit * 1000);
      
      if (remaining > 0) {
        setStartTime(questionStartTimeFromServer);
        startTimer();
      } else {
        // Question already timed out
        handleTimeUp();
      }
    } else {
      // Fallback if no server time
      const currentQuestion = quiz?.questions[currentQuestionIndex];
      const questionTimeLimit = currentQuestion?.timeLimit || QUESTION_PHASE_SECONDS;
      setTimeLeft(questionTimeLimit);
      setInitialTime(questionTimeLimit);
      setStartTime(Date.now());
      setPhase("question");
      setPhaseQuestionIndex(currentQuestionIndex);
      setPhaseEndsAt(Date.now() + questionTimeLimit * 1000);
      startTimer();
    }
    
    console.log("Question reset for index:", currentQuestionIndex);
    
    // Cleanup function
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentQuestionIndex, quiz]);

  // Schedule automatic phase transitions (question → results → countdown)
  useEffect(() => {
    if (phaseTimerRef.current) {
      clearTimeout(phaseTimerRef.current);
      phaseTimerRef.current = null;
    }

    if (!phaseEndsAt) return;

    const msRemaining = phaseEndsAt - Date.now();

    if (msRemaining <= 0) {
      advancePhase();
      return;
    }

    phaseTimerRef.current = setTimeout(() => {
      phaseTimerRef.current = null;
      advancePhase();
    }, msRemaining);

    return () => {
      if (phaseTimerRef.current) {
        clearTimeout(phaseTimerRef.current);
        phaseTimerRef.current = null;
      }
    };
  }, [phaseEndsAt, phase, advancePhase]);

  // Keep local countdown overlay in sync with the countdown phase
  useEffect(() => {
    if (phase !== "countdown" || !phaseEndsAt || isPhaseLastQuestion) {
      setNextQuestionCountdown(null);
      return;
    }

    const updateCountdown = () => {
      const remaining = Math.max(
        0,
        Math.ceil((phaseEndsAt - Date.now()) / 1000)
      );
      setNextQuestionCountdown(remaining);
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);

    return () => {
      clearInterval(interval);
    };
  }, [phase, phaseEndsAt, isPhaseLastQuestion]);

  // Track remaining seconds while results/leaderboard are shown
  useEffect(() => {
    if (phase !== "results" || !phaseEndsAt) {
      setResultsCountdown(null);
      return;
    }

    const updateCountdown = () => {
      const remaining = Math.max(
        0,
        Math.ceil((phaseEndsAt - Date.now()) / 1000)
      );
      setResultsCountdown(remaining);
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);

    return () => {
      clearInterval(interval);
    };
  }, [phase, phaseEndsAt]);
  
  const handleAnswerSelect = async (answerIndex: number) => {
    console.log("Answer selected:", answerIndex, "for question:", currentQuestionIndex);
    if (isSpectatingCurrentQuestion) {
      console.log("Spectating current question, input disabled");
      return;
    }
    if (isAnswered || showingResults || hasAnsweredRef.current) {
      console.log("Already answered or showing results");
      return;
    }
  
    // Subtle haptic feedback on answer selection (if supported)
    void hapticSelection();

    // Stop the question timer ticking sound immediately
    stopSfx("tick");
    
    setSelectedAnswer(answerIndex);
    setIsAnswered(true);
    
    // // Calculate time taken
    const endTime = Date.now();
    const question = quiz?.questions[currentQuestionIndex];
    const maxTime = question?.timeLimit ? question.timeLimit * 1000 : 10000;
    const timeTaken = startTime ? endTime - startTime : maxTime;
    
    // Submit answer to backend
    const playerSessionId = localStorage.getItem("playerSessionId");
    if (playerSessionId && quiz && currentGame && question) {
      try {
        // Call submitAnswer which updates the backend and returns the response
        const response = await submitAnswer(playerSessionId, question.id, answerIndex, timeTaken);
        
        // Use the response directly instead of waiting for state update
        if (response) {
          // Update with actual points from backend
          setEarnedPoints(response.is_correct ? response.points_earned : 0);
          
          // Play success / failure sound
          if (response.is_correct) {
            playSfx("correct");
          } else {
            playSfx("wrong");
          }
          
          // Show confetti and points banner
          setShowConfetti(response.is_correct);
          if (!isCreator) {
            setShowPointsBanner(true);
            setTimeout(() => {
              setShowPointsBanner(false);
              setShowConfetti(false);
              // Show question review after banner disappears (3 seconds after banner appeared)
              setShowingResults(true);
            }, 3000);
          } else {
            // For creator, show results immediately (no banner)
            setShowingResults(true);
          }
        }
      } catch (error) {
        console.error('Error submitting answer:', error);
      }
    } else {
      // If no response, still show results (for creator or error cases)
      setShowingResults(true);
    }
    
    // Creator has manual control via "Next Question" button
    // Non-creators wait for creator to advance via realtime update
  };
  
  const handleNextQuestion = async () => {
    console.log("Manual advance triggered");
    
    if (!isDriver) {
      console.log("Manual advance ignored: not driver");
      return;
    }

    await advancePhase();
  };
  
  // Debug logging
  useEffect(() => {
    console.log('Play page - currentGame:', currentGame);
    console.log('Play page - quiz:', quiz);
    console.log('Play page - isLoadingFromUrl:', isLoadingFromUrl);
    if (currentGame) {
      console.log('Play page - currentGame.quizId:', currentGame.quizId);
      console.log('Play page - Looking for quiz with ID:', currentGame.quizId);
    }
  }, [currentGame, quiz, isLoadingFromUrl]);

  if (isLoadingFromUrl || !currentGame || !quiz) {
    return (
      <div className="min-h-screen w-full bg-black text-white relative overflow-hidden flex items-center justify-center">
        <div className="text-center">
          <div className="animate-pulse text-2xl font-bold mb-4">Loading...</div>
          <div className="text-sm text-gray-400">
            {isLoadingFromUrl && <p>Loading quiz data from server...</p>}
            {!isLoadingFromUrl && !currentGame && <p>Waiting for game state...</p>}
            {!isLoadingFromUrl && !quiz && <p>Waiting for quiz data...</p>}
            {currentGame && (
              <>
                <p>Game ID: {currentGame.quizId || 'EMPTY'}</p>
                <p>Game Status: {currentGame.status}</p>
                <p>Players: {currentGame.players.length}</p>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }
  
  // Verifica che l'indice della domanda sia valido
  if (currentQuestionIndex >= quiz.questions.length) {
    console.error("Invalid question index:", currentQuestionIndex, "max:", quiz.questions.length - 1);
    return (
      <div className="min-h-screen w-full bg-black text-white relative overflow-hidden flex items-center justify-center">
        <div className="text-2xl font-bold">Quiz error: Invalid question index</div>
      </div>
    );
  }
  
  const currentQuestion = quiz.questions[currentQuestionIndex];
  if (!currentQuestion) {
    console.error("Question not found at index:", currentQuestionIndex);
    return (
      <div className="min-h-screen w-full bg-black text-white relative overflow-hidden flex items-center justify-center">
        <div className="text-2xl font-bold">Quiz error: Question not found</div>
      </div>
    );
  }
  
  const correctAnswerIndex = currentQuestion.correctAnswer;
  const isLastQuestion = totalQuestions > 0 ? currentQuestionIndex >= totalQuestions - 1 : false;
  const timeUntilNextQuestion =
    phase === "countdown"
      ? nextQuestionCountdown
      : phase === "results"
      ? resultsCountdown !== null
        ? resultsCountdown + COUNTDOWN_PHASE_SECONDS
        : null
      : null;
  const isSpectatingCurrentQuestion =
    !isCreator &&
    spectateUntilIndex !== null &&
    currentQuestionIndex < spectateUntilIndex;
  
  return (
    <>
      <style jsx>{`
        @keyframes firework-explosion {
          0% {
            transform: rotate(var(--rotation)) translateY(0) scale(1);
            opacity: 1;
          }
          50% {
            transform: rotate(var(--rotation)) translateY(-30px) scale(1.2);
            opacity: 0.8;
          }
          100% {
            transform: rotate(var(--rotation)) translateY(-60px) scale(0.5);
            opacity: 0;
          }
        }
      `}</style>
      <div className="min-h-screen w-full bg-black text-white relative overflow-hidden patrick-hand">
      {/* Background network effect */}
      <div 
        className="absolute inset-0 z-0 opacity-40"
        style={{
          backgroundImage: "url('/network-bg.svg')",
          backgroundSize: "cover",
          backgroundPosition: "center"
        }}
      />
      
      {/* Logo centered at top */}
      <div className="absolute top-1 left-1/2 transform -translate-x-1/2 z-10">
        <img 
          src="/Logo.png" 
          alt="Hoot Logo" 
          className="h-28 w-auto cursor-pointer hover:opacity-80 transition-opacity"
          onClick={() => router.push('/')}
        />
      </div>

      {/* Room code badge */}
      {roomCode && (
        <div className="absolute top-4 left-4 z-20 bg-white/10 backdrop-blur rounded-xl px-4 py-2 border border-white/20 shadow-lg flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-[0.2em] text-gray-300">
            Room Code
          </span>
          <div className="flex items-center gap-2">
            <span className="font-mono text-lg text-white">{roomCode}</span>
            <button
              onClick={handleCopyRoomCode}
              className="text-xs text-purple-200 hover:text-white transition-colors focus:outline-none"
              aria-label="Copy room code"
            >
              {roomCodeCopied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
      )}

      {/* Next Question Countdown */}
      {nextQuestionCountdown !== null && !isPhaseLastQuestion && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="text-center">
            <div className="text-8xl font-bold text-white mb-4 animate-pulse">
              {nextQuestionCountdown}
            </div>
            <div className="text-2xl text-gray-300">
              Next question starting...
            </div>
          </div>
        </div>
      )}

      {/* Fireworks Animation */}
      {showConfetti && (
        <div className="fixed inset-0 pointer-events-none z-40">
          {/* Fireworks explosions */}
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={`firework-${i}`}
              className="absolute"
              style={{
                left: `${30 + Math.random() * 40}%`,
                top: `${30 + Math.random() * 40}%`,
                animationDelay: `${i * 0.3}s`,
              }}
            >
              {/* Firework particles */}
              {Array.from({ length: 16 }).map((_, j) => {
                const angle = (j * 22.5); // 360/16 = 22.5 degrees
                const color = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#feca57', '#ff9ff3', '#54a0ff'][Math.floor(Math.random() * 7)];
                return (
                  <div
                    key={`particle-${i}-${j}`}
                    className="absolute w-2 h-2 rounded-full"
                    style={{
                      backgroundColor: color,
                      animation: `firework-explosion 2.5s ease-out forwards`,
                      animationDelay: `${j * 0.03}s`,
                      transformOrigin: '0 0',
                      transform: `rotate(${angle}deg) translateY(-80px)`,
                      boxShadow: `0 0 15px ${color}`,
                      '--rotation': `${angle}deg`,
                    } as React.CSSProperties}
                  />
                );
              })}
            </div>
          ))}
          
          {/* Central burst effect */}
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
            <div className="w-8 h-8 rounded-full bg-gradient-to-r from-yellow-400 to-orange-500 animate-ping opacity-75"></div>
            <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-white animate-ping" style={{ animationDelay: '0.1s' }}></div>
          </div>
        </div>
      )}

      {/* Points Banner */}
      {showPointsBanner && !isCreator && (
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-30">
          <div className={`text-white px-8 py-4 rounded-2xl shadow-2xl border-4 animate-bounce ${
            earnedPoints > 0 
              ? 'bg-gradient-to-r from-green-500 to-emerald-600 border-yellow-400' 
              : 'bg-gradient-to-r from-red-500 to-red-600 border-red-300'
          }`}>
            <div className="text-center">
              <div className="text-4xl font-bold mb-2">
                {earnedPoints > 0 ? 'Correct!' : (selectedAnswer === null ? "Time's up!" :  'Wrong!')}
              </div>
              <div className="text-2xl font-semibold">
                {earnedPoints > 0 ? `+${earnedPoints} points` : '0 points'}
              </div>
            </div>
          </div>
        </div>
      )}

      
      <div className="relative z-10 container mx-auto py-8 px-4 pt-24 flex flex-col items-center">
        
        {/* Question progress */}
        <div className="w-full max-w-md mb-2">
          <div className="flex justify-between items-center mb-2">
            <span className="text-lg font-semibold">Question {currentQuestionIndex + 1} of {quiz.questions.length}</span>
          </div>
        </div>
        
        
        {/* Question with animated border timer */}
        <div className="relative mb-8 w-full max-w-2xl" style={{ width: '600px', maxWidth: '90vw' }}>
          {/* Question box with animated border */}
          <div 
            className="bg-white rounded-xl p-8 shadow-2xl relative"
            style={{
              border: '8px solid transparent',
              background: `linear-gradient(white, white) padding-box, 
                          conic-gradient(from 0deg, 
                            ${timeLeft <= 5 ? '#ef4444' : '#8b5cf6'} ${(timeLeft / initialTime) * 360}deg, 
                            #374151 ${(timeLeft / initialTime) * 360}deg) border-box`,
              transition: isAnswered ? 'none' : 'all 1s linear'
            }}
          >
            {/* Timer number indicator */}
            <div className={`absolute -top-6 -right-6 text-white rounded-full w-16 h-16 flex items-center justify-center text-xl font-bold shadow-lg z-20 transition-colors duration-300 ${
              isAnswered 
                ? 'bg-gray-500' 
                : timeLeft <= 5 
                  ? 'bg-red-500 animate-pulse' 
                  : 'bg-purple-600'
            }`}>
              {timeLeft}
            </div>
            
            <div 
              className="font-bold text-center text-gray-800 leading-relaxed"
              style={{
                fontSize: 'clamp(1rem, 4vw, 1.5rem)', // Responsive font size: min 1rem, preferred 4vw, max 1.5rem
                maxHeight: 'clamp(120px, 25vh, 200px)', // Responsive height: min 120px, preferred 25vh, max 200px
                overflow: 'hidden',
                wordWrap: 'break-word',
                wordBreak: 'break-word',
                display: '-webkit-box',
                WebkitLineClamp: 4, // Show max 4 lines
                WebkitBoxOrient: 'vertical',
                textOverflow: 'ellipsis'
              }}
            >
              {currentQuestion.text}
            </div>
          </div>
        </div>
        
        {!isCreator && isSpectatingCurrentQuestion && (
          <div className="mb-4 text-center text-xs text-yellow-200/80">
            ⏳ You joined while this question was already running. You can answer starting from the next one.
          </div>
        )}

        {/* Answer options - Different view for creator vs players */}
        {isCreator ? (
          <div className="w-full max-w-md space-y-4">
            {phase === "question" ? (
              <>
                {/* Subtle time-up notification for creator */}
                {timeLeft === 0 && (
                  <div className="bg-blue-900/20 border border-blue-700/50 rounded-lg p-3 text-center">
                    <p className="text-sm text-blue-200">⏰ Time&apos;s up! You can advance when ready.</p>
                  </div>
                )}

                {/* Answer options list */}
                <div>
                  <h3 className="text-lg font-semibold mb-3 text-purple-200 text-center">
                    Answer Options
                  </h3>
                  <div className="flex flex-col gap-3">
                    {currentQuestion.options.map((option, index) => {
                      const colors = ["#0DCEFB", "#53DB1E", "#FDCC0E", "#F70000"];
                      const baseColor = colors[index % colors.length];
                      
                      return (
                        <div 
                          key={index}
                          className="rounded p-4 text-white relative border-2"
                          style={{ 
                            backgroundColor: `${baseColor}40`,
                            borderColor: baseColor,
                            borderWidth: '2px',
                          }}
                        >
                          <div 
                            className="w-full bg-transparent focus:outline-none text-center"
                            style={{
                              fontSize: 'clamp(0.875rem, 3vw, 1.25rem)',
                              fontWeight: "500",
                              maxHeight: 'clamp(60px, 12vh, 100px)',
                              overflow: 'hidden',
                              wordWrap: 'break-word',
                              wordBreak: 'break-word',
                              display: '-webkit-box',
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: 'vertical',
                              textOverflow: 'ellipsis'
                            }}
                          >
                            {option}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Player responses */}
                <div className="bg-purple-900/30 border border-purple-700/50 rounded-lg p-6">
                  <h3 className="text-xl font-semibold mb-4 text-purple-200 text-center">
                    Player Responses ({Object.keys(playerResponses).length}/{currentGame.players.length - 1})
                  </h3>
                  <div className="space-y-2">
                    {currentGame.players
                      .filter(p => (playerSessionId ? p.id !== playerSessionId : true))
                      .map(player => {
                        const response = playerResponses[player.id];
                        return (
                          <div 
                            key={player.id}
                            className="flex items-center justify-between p-3 rounded bg-purple-700/20 border border-purple-500/30"
                          >
                            <span className="text-purple-100">{player.name}</span>
                            <div className="flex items-center gap-2">
                              {response?.answered ? (
                                <>
                                  <span className={`text-sm ${response.isCorrect ? 'text-green-400' : 'text-red-400'}`}>
                                    {response.isCorrect ? '✓' : '✗'}
                                  </span>
                                  <span className="text-sm text-purple-200">{player.score} pts</span>
                                </>
                              ) : (
                                <span className="text-sm text-gray-400">Waiting...</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>

                {/* Next Question button */}
                <button
                  onClick={handleNextQuestion}
                  disabled={timeLeft > 0}
                  className="w-full py-3 rounded text-white font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{
                    backgroundColor: timeLeft > 0 ? "#6b7280" : "#22c55e",
                  }}
                  onMouseEnter={(e) => {
                    if (timeLeft === 0) {
                      e.currentTarget.style.backgroundColor = "#16a34a";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (timeLeft === 0) {
                      e.currentTarget.style.backgroundColor = "#22c55e";
                    } else {
                      e.currentTarget.style.backgroundColor = "#6b7280";
                    }
                  }}
                >
                  {timeLeft > 0 
                    ? `Wait ${timeLeft}s...` 
                    : isLastQuestion 
                      ? 'Show Results →' 
                      : 'Next Question →'}
                </button>
              </>
            ) : (
              <>
                {/* Correct answer first */}
                <div className="bg-green-900/20 border border-green-700/50 rounded-lg p-4 text-center">
                  <p className="text-sm text-green-200 mb-2">Correct Answer:</p>
                  <p className="text-lg font-semibold text-green-100">
                    {currentQuestion.options[correctAnswerIndex]}
                  </p>
                </div>

                {/* Leaderboard */}
                <div className="bg-purple-900/40 border border-purple-600/50 rounded-lg p-5">
                  <h3 className="text-lg font-semibold text-center text-purple-100 mb-3">
                    Current Standings
                  </h3>
                  <div className="space-y-2">
                    {leaderboardContent || (
                      <p className="text-center text-purple-200 text-sm">
                        No player scores yet.
                      </p>
                    )}
                  </div>
                  <div className="text-center text-gray-300 mt-4">
                    {isPhaseLastQuestion ? (
                      <span>Final results coming up...</span>
                    ) : timeUntilNextQuestion !== null ? (
                      <span>Next question in {timeUntilNextQuestion}s</span>
                    ) : (
                      <span>Waiting for next question...</span>
                    )}
                  </div>
                </div>

                {/* Next button */}
                <button
                  onClick={handleNextQuestion}
                  className="w-full py-3 rounded text-white font-semibold transition-colors"
                  style={{
                    backgroundColor: isLastQuestion ? "#f97316" : "#22c55e",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = isLastQuestion ? "#ea580c" : "#16a34a";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = isLastQuestion ? "#f97316" : "#22c55e";
                  }}
                >
                  {isLastQuestion ? 'Show Results →' : 'Next Question →'}
                </button>

                {/* Player responses */}
                <div className="bg-purple-900/30 border border-purple-700/50 rounded-lg p-6">
                  <h3 className="text-xl font-semibold mb-4 text-purple-200 text-center">
                    Player Responses ({Object.keys(playerResponses).length}/{currentGame.players.length - 1})
                  </h3>
                  <div className="space-y-2">
                    {currentGame.players
                      .filter(p => (playerSessionId ? p.id !== playerSessionId : true))
                      .map(player => {
                        const response = playerResponses[player.id];
                        return (
                          <div 
                            key={player.id}
                            className="flex items-center justify-between p-3 rounded bg-purple-700/20 border border-purple-500/30"
                          >
                            <span className="text-purple-100">{player.name}</span>
                            <div className="flex items-center gap-2">
                              {response?.answered ? (
                                <>
                                  <span className={`text-sm ${response.isCorrect ? 'text-green-400' : 'text-red-400'}`}>
                                    {response.isCorrect ? '✓' : '✗'}
                                  </span>
                                  <span className="text-sm text-purple-200">{player.score} pts</span>
                                </>
                              ) : (
                                <span className="text-sm text-gray-400">Waiting...</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              </>
            )}
          </div>
        ) : (
          // Player view - Show answer options
          <div className="flex flex-col gap-4 w-full max-w-md">
            {currentQuestion.options.map((option, index) => {
              const colors = ["#0DCEFB", "#53DB1E", "#FDCC0E", "#F70000"];
              const baseColor = colors[index % colors.length];
              
              let backgroundColor = `${baseColor}40`; // Sfondo trasparente come admin
              let borderColor = baseColor; // Bordo colorato
              
              if (isAnswered) {
                if (index === correctAnswerIndex) {
                  backgroundColor = "#22c55e40"; // green-500 con trasparenza
                  borderColor = "#22c55e";
                } else if (index === selectedAnswer && index !== correctAnswerIndex) {
                  backgroundColor = "#dc262640"; // red-600 con trasparenza
                  borderColor = "#dc2626";
                } else {
                  backgroundColor = "#37415140"; // gray-700 con trasparenza
                  borderColor = "#374151";
                }
              }
              
              return (
                <div 
                  key={index}
                  className={`rounded p-4 text-white relative border-2 transition-opacity ${
                    isAnswered || showingResults || isSpectatingCurrentQuestion
                      ? 'cursor-not-allowed'
                      : 'cursor-pointer hover:opacity-80'
                  }`}
                  style={{ 
                    backgroundColor: backgroundColor, // Sfondo colorato pieno
                    borderColor: borderColor, // Bordo dello stesso colore
                    borderWidth: '2px',
                    opacity: isAnswered || showingResults || isSpectatingCurrentQuestion
                      ? (index === selectedAnswer || index === correctAnswerIndex ? 1 : 0.7)
                      : 1,
                    pointerEvents: isAnswered || showingResults || isSpectatingCurrentQuestion ? 'none' : 'auto',
                  }}
                  onClick={() => {

                    if (!isAnswered && !showingResults && !isSpectatingCurrentQuestion) {
                      handleAnswerSelect(index);
                    }
                  }}
                >
                  {/* Indicatore di risposta corretta */}
                  {isAnswered && index === correctAnswerIndex && (
                    <div className="absolute top-1 right-1 w-4 h-4 rounded-full flex items-center justify-center bg-white">
                      <svg className="w-3 h-3 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  )}
                  <div 
                    className="w-full bg-transparent focus:outline-none text-center"
                    style={{
                      fontSize: 'clamp(0.875rem, 3vw, 1.25rem)', // Responsive font size
                      fontWeight: "500",
                      cursor: isAnswered || showingResults ? "default" : "pointer",
                      maxHeight: 'clamp(60px, 12vh, 100px)', // Responsive height
                      overflow: 'hidden',
                      wordWrap: 'break-word',
                      wordBreak: 'break-word',
                      display: '-webkit-box',
                      WebkitLineClamp: 2, // Show max 2 lines
                      WebkitBoxOrient: 'vertical',
                      textOverflow: 'ellipsis'
                    }}
                  >
                    {option}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        
        {/* Intermediate Results Screen for Players */}
        {showingResults && !isCreator && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-gradient-to-b from-purple-900/95 to-black/95 border-2 border-purple-500 rounded-2xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
              {/* Question Review */}
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-center mb-4 text-purple-100">Question Review</h2>
                <div className="bg-purple-800/40 border border-purple-600/50 rounded-lg p-4 mb-4">
                  <p className="text-lg text-white mb-3">{currentQuestion.text}</p>
                  
                  {/* Show timeout message if no answer was given */}
                  {(selectedAnswer === null || selectedAnswer === -1) ? (
                    <div className="space-y-2">
                      <div className="p-3 rounded-lg border-2 bg-orange-900/40 border-orange-500">
                        <div className="flex items-center justify-center">
                          <span className="text-orange-200 font-bold">⏰ Time&apos;s up! No answer given</span>
                        </div>
                      </div>
                      <div className="p-3 rounded-lg border-2 bg-green-900/40 border-green-500">
                        <div className="flex items-center justify-between">
                          <span className="text-white">{currentQuestion.options[correctAnswerIndex]}</span>
                          <span className="text-green-400 font-bold">✓ Correct Answer</span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* Show only player's answer and correct answer */
                    <div className="space-y-2">
                      {currentQuestion.options.map((option, index) => {
                        const isCorrect = index === correctAnswerIndex;
                        const isUserAnswer = index === selectedAnswer;
                        
                        // Only show correct answer and user's answer (if different)
                        if (!isCorrect && !isUserAnswer) {
                          return null;
                        }
                        
                        return (
                          <div
                            key={index}
                            className={`p-3 rounded-lg border-2 ${
                              isCorrect
                                ? 'bg-green-900/40 border-green-500'
                                : isUserAnswer
                                ? 'bg-red-900/40 border-red-500'
                                : 'bg-gray-800/40 border-gray-600'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-white">{option}</span>
                              <div className="flex items-center gap-2">
                                {isCorrect && isUserAnswer && (
                                  <span className="text-green-400 font-bold">✓ Your Answer (Correct)</span>
                                )}
                                {isCorrect && !isUserAnswer && (
                                  <span className="text-green-400 font-bold">✓ Correct Answer</span>
                                )}
                                {isUserAnswer && !isCorrect && (
                                  <span className="text-red-400 font-bold">✗ Your Answer</span>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  
                  {/* Points earned */}
                  <div className="mt-4 text-center">
                    <div className={`text-3xl font-bold ${earnedPoints > 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {earnedPoints > 0 ? `+${earnedPoints} points` : '0 points'}
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Current Leaderboard */}
              <div className="mb-4">
                <h3 className="text-xl font-bold text-center mb-3 text-purple-100">Current Standings</h3>
                <div className="bg-purple-800/40 border border-purple-600/50 rounded-lg p-4">
                  <div className="space-y-2">
                    {leaderboardContent || (
                      <p className="text-center text-purple-200 text-sm">
                        No player scores yet.
                      </p>
                    )}
                  </div>
                </div>
              </div>
              
              {/* Waiting message */}
              <div className="text-center">
                {isPhaseLastQuestion ? (
                  <p className="text-gray-300 animate-pulse">Final results coming up...</p>
                ) : timeUntilNextQuestion !== null ? (
                  <p className="text-gray-300 animate-pulse">
                    Next question in {timeUntilNextQuestion}s
                  </p>
                ) : (
                  <p className="text-gray-300 animate-pulse">Waiting for next question...</p>
                )}
              </div>
            </div>
          </div>
        )}
        
        
        {/* Debug info */}
        {process.env.NODE_ENV !== "production" && (
          <div className="mt-8 text-xs text-gray-500 text-center">
            <p>Question Index: {currentQuestionIndex}</p>
            <p>Game Status: {currentGame.status}</p>
            <p>Is Answered: {isAnswered ? "Yes" : "No"}</p>
            <p>Showing Results: {showingResults ? "Yes" : "No"}</p>
            <p>Time Left: {timeLeft}s</p>
            <p>Time Percentage: {timePercentageRef.current.toFixed(1)}%</p>
          </div>
        )}
      </div>
      </div>
    </>
  );
}

export default function PlayQuizPage() {
  return (
    <Suspense fallback={<div className="min-h-screen w-full bg-black text-white flex items-center justify-center">Loading...</div>}>
      <PlayQuizContent />
    </Suspense>
  );
}