"use client";

import { useEffect, useState, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

// Disable pre-rendering for this page
export const dynamic = 'force-dynamic';
import { useQuiz } from "@/lib/quiz-context";
import { useSupabase } from "@/lib/supabase-context";

function PlayQuizContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { currentGame, getCurrentQuiz, submitAnswer, nextQuestion, setCurrentQuiz } = useQuiz();
  const { supabase } = useSupabase();
  const [timeLeft, setTimeLeft] = useState<number>(10);
  const [initialTime] = useState<number>(10); // Tempo iniziale fisso per calcolare la percentuale
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [isAnswered, setIsAnswered] = useState(false);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [showingResults, setShowingResults] = useState(false);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState<number>(0);
  
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
  
  // Redirect if no game is active
  useEffect(() => {
    if (isLoadingFromUrl) return; // Wait for URL loading to complete
    
    if (!currentGame) {
      router.push("/quiz");
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
    
    if (showingResults) return;

    // Pulisci il timer precedente se esiste
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    
    // Initialize timer
    setStartTime(Date.now());
    setTimeLeft(10);
    setSelectedAnswer(null);
    setIsAnswered(false);
    setShowingResults(false);
    timePercentageRef.current = 100;
    
    // Avvia un nuovo timer
    startTimer();
    
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
          if (!isAnswered) {
            handleTimeUp();
          }
        }
        
        return newTime;
      });
    }, 1000);
  };
  
  const handleTimeUp = () => {
    if (!isAnswered && !showingResults) {
      setIsAnswered(true);
      
      // Auto-submit -1 for no answer
      const playerId = localStorage.getItem("quizPlayerId");
      if (playerId && quiz && currentGame) {
        const question = quiz.questions[currentQuestionIndex];
        if (question) {
          submitAnswer(playerId, question.id, -1, 10000); // Max time
        }
      }
      
      // Show results for 5 seconds
      setShowingResults(true);
      setTimeout(() => {
        handleNextQuestion();
      }, 5000);
    }
  };
  
  const handleAnswerSelect = (answerIndex: number) => {
    console.log("Answer selected:", answerIndex, "for question:", currentQuestionIndex);
    if (isAnswered || showingResults) {
      console.log("Already answered or showing results");
      return;
    }
    
    setSelectedAnswer(answerIndex);
    setIsAnswered(true);
    
    // Calculate time taken
    const endTime = Date.now();
    const timeTaken = startTime ? endTime - startTime : 10000;
    
    // Submit answer
    const playerId = localStorage.getItem("quizPlayerId");
    if (playerId && quiz && currentGame) {
      const question = quiz.questions[currentQuestionIndex];
      if (question) {
        submitAnswer(playerId, question.id, answerIndex, timeTaken);
      }
    }
    const timeoutDuration = Math.min(timeLeft * 1000, 5000);
    // Show results for 5 seconds but keep the timer running
    setShowingResults(true);
    setTimeout(() => {
      handleNextQuestion();
    }, timeoutDuration);
  };
  
  const handleNextQuestion = () => {
    console.log("Moving to next question from:", currentQuestionIndex);
    
    // Ferma il timer prima di passare alla prossima domanda
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setShowingResults(false);
    setIsAnswered(false);

    nextQuestion();
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
      
      {/* Logo in top left */}
      <div className="absolute top-4 left-4 z-20">
        <img 
          src="/Logo.png" 
          alt="Hoot Logo" 
          className="h-20 w-auto cursor-pointer hover:opacity-80 transition-opacity"
          onClick={() => router.push('/')}
        />
      </div>

              {/* Timer circle */}
              <div className="mt-6 flex justify-center">
          <div className="relative">
            <svg className="w-20 h-20 transform -rotate-90" viewBox="0 0 36 36">
              {/* Background circle */}
              <path
                d="M18 2.0845
                  a 15.9155 15.9155 0 0 1 0 31.831
                  a 15.9155 15.9155 0 0 1 0 -31.831"
                fill="none"
                stroke="#374151"
                strokeWidth="3"
              />
              {/* Progress circle */}
              <path
                d="M18 2.0845
                  a 15.9155 15.9155 0 0 1 0 31.831
                  a 15.9155 15.9155 0 0 1 0 -31.831"
                fill="none"
                stroke="#8b5cf6"
                strokeWidth="3"
                strokeLinecap="round"
                strokeDasharray={`${(timeLeft / initialTime) * 100}, 100`}
                style={{
                  transition: 'stroke-dasharray 1s linear'
                }}
              />
            </svg>
            {/* Timer number in center */}
            <div className="absolute inset-0 flex items-center justify-center mt-3">
              <span className="text-xl font-bold text-white">{timeLeft}</span>
            </div>
          </div>
        </div>
      
      <div className="relative z-10 container mx-auto py-8 px-4 pt-20 flex flex-col items-center">
        
        {/* Question progress */}
        <div className="w-full max-w-md mb-2">
          <div className="flex justify-between items-center mb-2">
            <span className="text-lg font-semibold">Question {currentQuestionIndex + 1}</span>
          </div>
        </div>
        
        
        {/* Question */}
        <div className="bg-white rounded-xl p-8 mb-8 w-full max-w-2xl shadow-2xl border-2 border-gray-200" style={{ width: '600px', maxWidth: '90vw' }}>
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
        
        {/* Answer options */}
        <div className="flex flex-col gap-4 w-full max-w-md">
          {currentQuestion.options.map((option, index) => {
            const colors = ["#0DCEFB", "#53DB1E", "#FDCC0E", "#F70000"];
            const baseColor = colors[index % colors.length];
            
            let backgroundColor = `${baseColor}40`; // Sfondo trasparente come admin
            let borderColor = baseColor; // Bordo colorato
            
            if (showingResults) {
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
                {showingResults && index === correctAnswerIndex && (
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
            <div className="text-lg text-gray-300 mt-2">Next question in a moment...</div>
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
  );
}

export default function PlayQuizPage() {
  return (
    <Suspense fallback={<div className="min-h-screen w-full bg-black text-white flex items-center justify-center">Loading...</div>}>
      <PlayQuizContent />
    </Suspense>
  );
}