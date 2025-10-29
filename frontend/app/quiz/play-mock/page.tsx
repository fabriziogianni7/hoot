"use client";

import { useEffect, useState, useRef, Suspense } from "react";
import { useRouter } from "next/navigation";

// Disable pre-rendering for this page
export const dynamic = 'force-dynamic';

function MockPlayQuizContent() {
  const router = useRouter();
  
  // Mock data - quiz with questions
  const mockQuiz = {
    id: "mock-quiz-123",
    title: "Test Quiz",
    description: "A mock quiz for testing purposes",
    questions: [
      {
        id: "q1",
        text: "What is the capital of France?",
        options: ["London", "Berlin", "Paris", "Madrid"],
        correctAnswer: 2,
        timeLimit: 15
      },
      {
        id: "q2", 
        text: "Which planet is closest to the Sun?",
        options: ["Venus", "Mercury", "Earth", "Mars"],
        correctAnswer: 1,
        timeLimit: 15
      },
      {
        id: "q3",
        text: "What is 2 + 2?",
        options: ["3", "4", "5", "6"],
        correctAnswer: 1,
        timeLimit: 10
      },
      {
        id: "q4",
        text: "What is the largest mammal?",
        options: ["Elephant", "Blue Whale", "Giraffe", "Hippopotamus"],
        correctAnswer: 1,
        timeLimit: 12
      },
      {
        id: "q5",
        text: "Which programming language is this written in?",
        options: ["JavaScript", "Python", "TypeScript", "Java"],
        correctAnswer: 2,
        timeLimit: 8
      }
    ],
    createdAt: new Date()
  };

  // Mock game data
  const mockGame = {
    id: "mock-game-123",
    quizId: "mock-quiz-123",
    status: "active",
    currentQuestionIndex: 0,
    questionStartTime: Date.now(),
    players: [
      {
        id: "player-1",
        name: "Test Player 1",
        score: 0
      },
      {
        id: "player-2", 
        name: "Test Player 2",
        score: 0
      },
      {
        id: "player-3",
        name: "Test Player 3", 
        score: 0
      }
    ]
  };

  // State management
  const [timeLeft, setTimeLeft] = useState<number>(15);
  const [initialTime, setInitialTime] = useState<number>(15);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [isAnswered, setIsAnswered] = useState(false);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [showingResults, setShowingResults] = useState(false);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState<number>(0);
  const [isCreator, setIsCreator] = useState(false);
  const [playerResponses, setPlayerResponses] = useState<Record<string, { answered: boolean; isCorrect?: boolean }>>({});
  const [showPointsBanner, setShowPointsBanner] = useState(false);
  const [earnedPoints, setEarnedPoints] = useState(0);
  const [showConfetti, setShowConfetti] = useState(false);
  
  // Timer refs
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const timePercentageRef = useRef<number>(100);

  // Calculate points using the same logic as backend
  const calculatePoints = (isCorrect: boolean, timeTakenMs: number, timeLimitSeconds: number): number => {
    if (!isCorrect) {
      return 0;
    }
    
    // Same constants as backend
    const BASE_POINTS = 100;
    const TIME_BONUS_MULTIPLIER = 10.5;
    
    const timeLimitMs = timeLimitSeconds * 1000;
    const remainingTimeSeconds = Math.max(0, timeLimitMs - timeTakenMs) / 1000;
    const timeBonus = remainingTimeSeconds * TIME_BONUS_MULTIPLIER;
    
    return Math.floor(BASE_POINTS + timeBonus);
  };

  // Mock backend call - simulates the real submit-answer endpoint
  // TODO: Replace with real API call to /api/submit-answer when integrating
  const mockSubmitAnswerToBackend = async (playerId: string, questionId: string, answerIndex: number, timeTaken: number) => {
    const question = mockQuiz.questions[currentQuestionIndex];
    const isCorrect = answerIndex === question.correctAnswer;
    
    // Calculate points using backend logic
    const pointsEarned = calculatePoints(isCorrect, timeTaken, question.timeLimit);
    
    // Simulate backend response
    const mockResponse = {
      success: true,
      is_correct: isCorrect,
      points_earned: pointsEarned,
      new_total_score: pointsEarned, // In real app, this would be cumulative
      answer_id: `mock-answer-${Date.now()}`
    };
    
    console.log('Mock backend response:', mockResponse);
    
    // Show points banner for all answers (correct or incorrect)
    setEarnedPoints(pointsEarned);
    setShowPointsBanner(true);
    
    // Show confetti for correct answers
    if (isCorrect) {
      setShowConfetti(true);
      setTimeout(() => {
        setShowConfetti(false);
      }, 3000);
    }
    
    // Hide banner after 3 seconds and advance to next question for players
    setTimeout(() => {
      setShowPointsBanner(false);
      
      // Auto-advance to next question for non-creators after showing results
      if (!isCreator) {
        setTimeout(() => {
          mockNextQuestion();
        }, 2000); // Wait 2 more seconds after banner disappears
      }
    }, 3000);
    
    return mockResponse;
  };

  // Mock functions
  const mockSubmitAnswer = async (playerId: string, questionId: string, answerIndex: number, timeTaken: number) => {
    console.log('Mock submit answer:', { playerId, questionId, answerIndex, timeTaken });
    
    // Call mock backend
    const response = await mockSubmitAnswerToBackend(playerId, questionId, answerIndex, timeTaken);
    
    // Update player responses for creator view
    setPlayerResponses(prev => ({
      ...prev,
      [playerId]: {
        answered: true,
        isCorrect: response.is_correct
      }
    }));
  };

  const mockNextQuestion = () => {
    console.log('Mock next question from:', currentQuestionIndex);
    
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    
    if (currentQuestionIndex < mockQuiz.questions.length - 1) {
      setCurrentQuestionIndex(prev => prev + 1);
      setShowingResults(false);
      setIsAnswered(false);
      setSelectedAnswer(null);
      setPlayerResponses({});
      setShowPointsBanner(false);
      setShowConfetti(false);
      
      // Reset timer for new question
      const newQuestion = mockQuiz.questions[currentQuestionIndex + 1];
      setTimeLeft(newQuestion.timeLimit);
      setInitialTime(newQuestion.timeLimit);
      setStartTime(Date.now());
      startTimer();
    } else {
      // Quiz finished
      console.log('Quiz finished!');
      alert('Quiz completed! This is just a mock - no real data was saved.');
    }
  };

  // Timer functions
  const startTimer = () => {
    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        const newTime = prev <= 1 ? 0 : prev - 1;
        
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

  const handleTimeUp = () => {
    // Only handle timeout if no answer was given and not already showing results
    if (!isAnswered && !showingResults && selectedAnswer === null) {
      setIsAnswered(true);
      
      // Auto-submit -1 for no answer (only for non-creators)
      if (!isCreator) {
        const playerId = "mock-player-123";
        const question = mockQuiz.questions[currentQuestionIndex];
        mockSubmitAnswer(playerId, question.id, -1, 10000);
      } else {
        // For creator mode, show timeout banner
        setEarnedPoints(0);
        setShowPointsBanner(true);
        setTimeout(() => {
          setShowPointsBanner(false);
        }, 3000);
      }
      
      setShowingResults(true);
    }
  };

  const handleAnswerSelect = (answerIndex: number) => {
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
    const timeTaken = startTime ? endTime - startTime : 10000;
    
    // Submit answer
    const playerId = "mock-player-123";
    const question = mockQuiz.questions[currentQuestionIndex];
    mockSubmitAnswer(playerId, question.id, answerIndex, timeTaken);
    
    setShowingResults(true);
  };

  const handleNextQuestion = () => {
    mockNextQuestion();
  };

  // Initialize timer when component mounts or question changes
  useEffect(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    
    setSelectedAnswer(null);
    setIsAnswered(false);
    setShowingResults(false);
    setPlayerResponses({});
    setShowPointsBanner(false);
    setShowConfetti(false);
    timePercentageRef.current = 100;
    
    const question = mockQuiz.questions[currentQuestionIndex];
    setTimeLeft(question.timeLimit);
    setStartTime(Date.now());
    startTimer();
    
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [currentQuestionIndex]);

  // Check if current player is the creator (mock)
  useEffect(() => {
    // Simulate creator mode - you can toggle this for testing
    const urlParams = new URLSearchParams(window.location.search);
    const creatorMode = urlParams.get('creator') === 'true';
    setIsCreator(creatorMode);
  }, []);

  // Verify question index is valid
  if (currentQuestionIndex >= mockQuiz.questions.length) {
    console.error("Invalid question index:", currentQuestionIndex, "max:", mockQuiz.questions.length - 1);
    return (
      <div className="min-h-screen w-full bg-black text-white relative overflow-hidden flex items-center justify-center">
        <div className="text-2xl font-bold">Quiz error: Invalid question index</div>
      </div>
    );
  }
  
  const currentQuestion = mockQuiz.questions[currentQuestionIndex];
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

      {/* Mock indicator */}
      <div className="absolute top-4 right-4 z-20">
        <div className="bg-yellow-500 text-black px-3 py-1 rounded-full text-sm font-bold">
          MOCK MODE
        </div>
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
            <div className={`absolute -top-10 -right-6 text-white rounded-full w-16 h-16 flex items-center justify-center text-xl font-bold shadow-lg z-20 transition-colors duration-300 ${
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
                Player Responses ({Object.keys(playerResponses).length}/{mockGame.players.length - 1})
              </h3>
              <div className="space-y-2">
                {mockGame.players
                  .filter(p => p.id !== "mock-player-123") // Exclude creator
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
              
              let backgroundColor = `${baseColor}40`;
              let borderColor = baseColor;
              
              if (isAnswered) {
                if (index === correctAnswerIndex) {
                  backgroundColor = "#22c55e40";
                  borderColor = "#22c55e";
                } else if (index === selectedAnswer && index !== correctAnswerIndex) {
                  backgroundColor = "#dc262640";
                  borderColor = "#dc2626";
                } else {
                  backgroundColor = "#37415140";
                  borderColor = "#374151";
                }
              }
              
              return (
                <div 
                  key={index}
                  className="rounded p-4 text-white relative border-2 cursor-pointer hover:opacity-80 transition-opacity"
                  style={{ 
                    backgroundColor: backgroundColor,
                    borderColor: borderColor,
                    borderWidth: '2px',
                    opacity: isAnswered || showingResults ? (index === selectedAnswer || index === correctAnswerIndex ? 1 : 0.7) : 1,
                  }}
                  onClick={() => handleAnswerSelect(index)}
                >
                  {/* Correct answer indicator */}
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
        <div className="mt-8 text-xs text-gray-500 text-center">
          <p>Question Index: {currentQuestionIndex}</p>
          <p>Game Status: {mockGame.status}</p>
          <p>Is Answered: {isAnswered ? "Yes" : "No"}</p>
          <p>Showing Results: {showingResults ? "Yes" : "No"}</p>
          <p>Time Left: {timeLeft}s</p>
          <p>Time Percentage: {timePercentageRef.current.toFixed(1)}%</p>
          <p>Mode: {isCreator ? "Creator" : "Player"}</p>
          <div className="mt-2">
            <a 
              href={isCreator ? "/quiz/play-mock" : "/quiz/play-mock?creator=true"} 
              className="text-blue-400 hover:text-blue-300 underline"
            >
              Switch to {isCreator ? "Player" : "Creator"} mode
            </a>
          </div>
        </div>
      </div>
      </div>
    </>
  );
}

export default function MockPlayQuizPage() {
  return (
    <Suspense fallback={<div className="min-h-screen w-full bg-black text-white flex items-center justify-center">Loading...</div>}>
      <MockPlayQuizContent />
    </Suspense>
  );
}
