"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuiz } from "@/lib/quiz-context";
import Link from "next/link";

export default function LobbyPage() {
  const router = useRouter();
  const { currentGame, getCurrentQuiz, joinGame } = useQuiz();
  const [countdown, setCountdown] = useState<number | null>(null);
  const [playerName, setPlayerName] = useState("");
  const [joined, setJoined] = useState(false);
  
  const quiz = getCurrentQuiz();
  
  // Redirect if no game is active
  useEffect(() => {
    if (!currentGame) {
      router.push("/quiz");
      return;
    }
    
    // Controlla se c'è un playerId salvato
    const savedPlayerId = localStorage.getItem("quizPlayerId");
    if (savedPlayerId) {
      // Verifica se il giocatore è già nella lista
      const playerExists = currentGame.players.some(p => p.id === savedPlayerId);
      if (playerExists) {
        setJoined(true);
      }
    }
  }, [currentGame, router]);

  // Handle countdown
  useEffect(() => {
    if (countdown === null || countdown <= 0) return;
    
    const timer = setTimeout(() => {
      setCountdown(countdown - 1);
      
      if (countdown === 1) {
        // Start the quiz when countdown reaches 0
        console.log('Countdown finished, redirecting to play page');
        router.push("/quiz/play");
      }
    }, 1000);
    
    return () => clearTimeout(timer);
  }, [countdown, router]);
  
  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (playerName.trim() && currentGame) {
      const playerId = joinGame(playerName);
      setJoined(true);
      // Store player ID in localStorage for persistence
      localStorage.setItem("quizPlayerId", playerId);
    }
  };
  
  const handleStartQuiz = () => {
    console.log('Starting quiz countdown');
    setCountdown(3); // 3 second countdown
  };
  
  if (!currentGame || !quiz) {
    return (
      <div className="min-h-screen w-full bg-black text-white relative overflow-hidden flex items-center justify-center">
        <div className="animate-pulse text-2xl font-bold">Loading...</div>
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
        <h1 className="text-3xl font-bold mb-8">{quiz.title}</h1>
        
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
                <li>Number of questions: {quiz.questions.length}</li>
                <li>Game PIN: <span className="font-mono font-bold">{currentGame.quizId}</span></li>
                <li>Current question index: {currentGame.currentQuestionIndex}</li>
              </ul>
            </div>
            
            <div className="bg-gray-900/50 rounded-lg p-6 mb-8 w-full max-w-md">
              <h2 className="text-xl font-semibold mb-4">
                Players ({currentGame.players.length})
              </h2>
              
              {currentGame.players.length === 0 ? (
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
                <div className="mb-4">
                  <input
                    type="text"
                    value={playerName}
                    onChange={(e) => setPlayerName(e.target.value)}
                    placeholder="Enter your name"
                    className="w-full px-4 py-2 rounded bg-white text-black"
                    required
                  />
                </div>
                <button
                  type="submit"
                  className="w-full py-2 bg-blue-600 hover:bg-blue-700 rounded text-white font-medium"
                >
                  Join Quiz
                </button>
              </form>
            ) : (
              <div className="w-full max-w-md flex flex-col gap-4">
                <div className="bg-green-600/20 border border-green-500 rounded-lg p-4 text-center">
                  <p>You've joined as <strong>{playerName}</strong></p>
                  <p className="text-sm text-gray-300">Waiting for the quiz to start</p>
                </div>
                
                {currentGame.players.length > 0 && (
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