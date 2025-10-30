"use client";

import { useEffect, useState, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

// Disable pre-rendering for this page
export const dynamic = 'force-dynamic';
import { useQuiz } from "@/lib/quiz-context";
import { useSupabase } from "@/lib/supabase-context";
import { useAnswersRealtime } from "@/lib/use-realtime-hooks";

function PlayQuizContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { currentGame, getCurrentQuiz, submitAnswer, nextQuestion, setCurrentQuiz, gameSessionId } = useQuiz();
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
  
  // Use realtime hook for answers (creator only)
  const { playerResponses } = useAnswersRealtime(
    gameSessionId,
    currentGame?.players.map(p => p.id) || [],
    isCreator
  );
  
  // Utilizziamo useRef per mantenere lo stato del timer tra i render
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const timePercentageRef = useRef<number>(100);
  
  const [isLoadingFromUrl, setIsLoadingFromUrl] = useState(true);
  
  const quiz = getCurrentQuiz();
  
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
      
      const playerSessionId = localStorage.getItem("playerSessionId");
      if (data && playerSessionId) {
        setIsCreator(data.creator_session_id === playerSessionId);
      }
    };
    
    checkCreator();
  }, [gameSessionId, supabase]);
  
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
  
  // Reset states when question changes
  useEffect(() => {
    if (!currentGame || !quiz) return;

    // Pulisci il timer precedente se esiste
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    
    // Reset states FIRST - this must run every time the question changes
    setSelectedAnswer(null);
    setIsAnswered(false);
    setShowingResults(false);
    setShowPointsBanner(false);
    setShowConfetti(false);
    timePercentageRef.current = 100;
    
    // Get server start time for synchronized timing
    const questionStartTimeFromServer = currentGame.questionStartTime;
    if (questionStartTimeFromServer) {
      // Calculate elapsed time since question started
      const now = Date.now();
      const currentQuestion = quiz?.questions[currentQuestionIndex];
      const questionTimeLimit = currentQuestion?.timeLimit || 10;
      const elapsed = Math.floor((now - questionStartTimeFromServer) / 1000);
      const remaining = Math.max(0, questionTimeLimit - elapsed);
      
      setTimeLeft(remaining);
      setInitialTime(questionTimeLimit);
      
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
      const questionTimeLimit = currentQuestion?.timeLimit || 10;
      setTimeLeft(questionTimeLimit);
      setInitialTime(questionTimeLimit);
      setStartTime(Date.now());
      startTimer();
    }
    
    console.log("Question reset for index:", currentQuestionIndex);
    
    // Cleanup function
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [currentQuestionIndex, quiz, currentGame]);
  
  // Funzione per avviare il timer
  const startTimer = () => {
    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        const newTime = prev <= 1 ? 0 : prev - 1;
        
        // Aggiorna la percentuale del tempo rimanente
        timePercentageRef.current = (newTime / initialTime) * 100;
        
        if (newTime === 0) {
          clearInterval(timerRef.current!);
          if (!isAnswered && selectedAnswer === null) {
            handleTimeUp();
          }
        }
        
        return newTime;
      });
    }, 1000);
  };
  
  const handleTimeUp = async () => {
    // Only handle timeout if no answer was given and not already showing results
    if (!isAnswered && !showingResults && selectedAnswer === null) {
      setIsAnswered(true);
      
      // Show timeout banner
      setEarnedPoints(0);
      setShowPointsBanner(true);
      setTimeout(() => {
        setShowPointsBanner(false);
      }, 3000);
      
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
      
      // Show results
      setShowingResults(true);
      
      // Creator has manual control via "Next Question" button, no automatic advancement
      // Non-creators wait for creator to advance
    }
  };
  
  const handleAnswerSelect = async (answerIndex: number) => {
    console.log("Answer selected:", answerIndex, "for question:", currentQuestionIndex);
    if (isAnswered || showingResults) {
      console.log("Already answered or showing results");
      return;
    }
    
    // Stop the timer immediately when answer is selected
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    
    setSelectedAnswer(answerIndex);
    setIsAnswered(true);
    
    // Calculate time taken
    const endTime = Date.now();
    const question = quiz?.questions[currentQuestionIndex];
    const maxTime = question?.timeLimit ? question.timeLimit * 1000 : 10000;
    const timeTaken = startTime ? endTime - startTime : maxTime;
    
    // Submit answer and get points from backend
    const playerSessionId = localStorage.getItem("playerSessionId");
    if (playerSessionId && quiz && currentGame && question) {
      try {
        // Call submitAnswer which returns the backend response
        await submitAnswer(playerSessionId, question.id, answerIndex, timeTaken);
        
        // Get the updated player data from the game state
        const updatedPlayer = currentGame.players.find(p => p.id === playerSessionId);
        if (updatedPlayer) {
          // Get the last answer to extract points
          const lastAnswer = updatedPlayer.answers[updatedPlayer.answers.length - 1];
          if (lastAnswer) {
            const points = lastAnswer.isCorrect ? lastAnswer.pointsEarned || 0 : 0;
            
            setEarnedPoints(points);
            setShowPointsBanner(true);
            
            // Show confetti for correct answers
            if (lastAnswer.isCorrect) {
              setShowConfetti(true);
              setTimeout(() => {
                setShowConfetti(false);
              }, 3000);
            }
            
            // Hide banner after 3 seconds
            setTimeout(() => {
              setShowPointsBanner(false);
            }, 3000);
          }
        }
      } catch (error) {
        console.error('Error submitting answer:', error);
        // Fallback to showing 0 points
        setEarnedPoints(0);
        setShowPointsBanner(true);
        setTimeout(() => {
          setShowPointsBanner(false);
        }, 3000);
      }
    }
    
    // Show results
    setShowingResults(true);
    
    // Creator has manual control via "Next Question" button
    // Non-creators wait for creator to advance via realtime update
  };
  
  const handleNextQuestion = () => {
    console.log("Moving to next question from:", currentQuestionIndex);
    
    // Ferma il timer prima di passare alla prossima domanda
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    
    // Reset timer states
    setSelectedAnswer(null);
    setIsAnswered(false);
    setShowingResults(false);
    setShowPointsBanner(false);
    setShowConfetti(false);
    timePercentageRef.current = 100;
    
    // Only creator can advance questions
    if (isCreator) {
      console.log("Creator advancing to next question");
      nextQuestion();
    } else {
      console.log("Non-creator waiting for question advance from host");
    }
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
      <div className="absolute top-1 left-1/2 transform -translate-x-1/2 z-20">
        <img 
          src="/Logo.png" 
          alt="Hoot Logo" 
          className="h-28 w-auto cursor-pointer hover:opacity-80 transition-opacity"
          onClick={() => router.push('/')}
        />
      </div>

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
      {showPointsBanner && (
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-30">
          <div className={`text-white px-8 py-4 rounded-2xl shadow-2xl border-4 animate-bounce ${
            earnedPoints > 0 
              ? 'bg-gradient-to-r from-green-500 to-emerald-600 border-yellow-400' 
              : 'bg-gradient-to-r from-red-500 to-red-600 border-red-300'
          }`}>
            <div className="text-center">
              <div className="text-4xl font-bold mb-2">
                {earnedPoints > 0 ? 'Correct!' : (selectedAnswer === null ? "Time's up!" : 'Wrong!')}
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
            <span className="text-lg font-semibold">Question {currentQuestionIndex + 1}</span>
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
              className="text-2xl font-bold text-center text-gray-800 leading-relaxed"
              style={{
                maxHeight: '120px',
                overflow: 'hidden',
                wordWrap: 'break-word',
                wordBreak: 'break-word'
              }}
            >
              {currentQuestion.text.length > 150 ? 
                `${currentQuestion.text.substring(0, 150)}...` : 
                currentQuestion.text
              }
            </div>
          </div>
        </div>
        
        {/* Answer options - Different view for creator vs players */}
        {isCreator ? (
          // Creator view - Show player responses
          <div className="w-full max-w-md">
            <div className="bg-purple-900/30 border border-purple-700/50 rounded-lg p-6 mb-4">
              <h3 className="text-xl font-semibold mb-4 text-purple-200 text-center">
                Player Responses ({Object.keys(playerResponses).length}/{currentGame.players.length - 1})
              </h3>
              <div className="space-y-2">
                {currentGame.players
                  .filter(p => p.id !== localStorage.getItem("playerSessionId")) // Exclude creator
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
            
            {/* Show correct answer to creator */}
            <div className="bg-green-900/20 border border-green-700/50 rounded-lg p-4 text-center mb-4">
              <p className="text-sm text-green-200 mb-2">Correct Answer:</p>
              <p className="text-lg font-semibold text-green-100">
                {currentQuestion.options[correctAnswerIndex]}
              </p>
            </div>
            
            {/* Next Question button for creator */}
            <button
              onClick={handleNextQuestion}
              className="w-full py-3 rounded text-white font-semibold transition-colors hover:opacity-90"
              style={{
                backgroundColor: "#22c55e",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "#16a34a";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "#22c55e";
              }}
            >
              Next Question →
            </button>
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
                  className="rounded p-4 text-white relative border-2 cursor-pointer hover:opacity-80 transition-opacity"
                  style={{ 
                    backgroundColor: backgroundColor, // Sfondo colorato pieno
                    borderColor: borderColor, // Bordo dello stesso colore
                    borderWidth: '2px',
                    opacity: isAnswered || showingResults ? (index === selectedAnswer || index === correctAnswerIndex ? 1 : 0.7) : 1,
                  }}
                  onClick={() => handleAnswerSelect(index)}
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
                      fontSize: "1.25rem",
                      fontWeight: "500",
                      cursor: isAnswered || showingResults ? "default" : "pointer",
                      maxHeight: '60px',
                      overflow: 'hidden',
                      wordWrap: 'break-word',
                      wordBreak: 'break-word'
                    }}
                  >
                    {option.length > 50 ? 
                      `${option.substring(0, 50)}...` : 
                      option
                    }
                  </div>
                </div>
              );
            })}
          </div>
        )}
        
        {/* Results info */}
        {showingResults && (
          <div className="mt-8 text-center">
            {selectedAnswer === correctAnswerIndex ? (
              <div className="text-green-400 text-2xl font-bold">Correct!</div>
            ) : (
              <div className="text-red-400 text-2xl font-bold">
                {selectedAnswer !== null ? "Wrong answer!" : "Time's up!"}
              </div>
            )}
            <div className="text-lg text-gray-300 mt-2">
              {isCreator ? "Click 'Next Question' to continue" : "Next question in a moment..."}
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