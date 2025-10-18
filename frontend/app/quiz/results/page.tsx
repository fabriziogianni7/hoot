"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuiz } from "@/lib/quiz-context";
import Link from "next/link";

export default function ResultsPage() {
  const router = useRouter();
  const { currentGame, getCurrentQuiz, endGame } = useQuiz();
  
  const quiz = getCurrentQuiz();
  
  // Redirect if no game is active
  useEffect(() => {
    if (!currentGame || currentGame.status !== "finished") {
      router.push("/");
    }
  }, [currentGame, router]);
  
  if (!currentGame || !quiz) {
    return (
      <div className="min-h-screen w-full bg-black text-white relative overflow-hidden flex items-center justify-center">
        <div className="animate-pulse text-2xl font-bold">Loading...</div>
      </div>
    );
  }
  
  // Sort players by score
  const sortedPlayers = [...currentGame.players].sort((a, b) => b.score - a.score);
  
  // Get current player
  const currentPlayerId = localStorage.getItem("quizPlayerId");
  const currentPlayer = currentGame.players.find(p => p.id === currentPlayerId);
  
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
        <h1 className="text-3xl font-bold mb-2">Quiz Results</h1>
        <h2 className="text-xl mb-8">{quiz.title}</h2>
        
        {currentPlayer && (
          <div className="bg-blue-900/30 border border-blue-500 rounded-lg p-4 mb-8 w-full max-w-md">
            <h3 className="text-center mb-2">Your Score</h3>
            <div className="text-4xl font-bold text-center">{currentPlayer.score}</div>
            <div className="text-center mt-2">
              {currentPlayer.answers.filter(a => a.isCorrect).length} correct answers out of {quiz.questions.length}
            </div>
          </div>
        )}
        
        <div className="bg-gray-900/50 rounded-lg p-6 mb-8 w-full max-w-md">
          <h3 className="text-xl font-semibold mb-4 text-center">Leaderboard</h3>
          
          <div className="space-y-3">
            {sortedPlayers.map((player, index) => (
              <div 
                key={player.id}
                className={`flex items-center justify-between p-3 rounded ${
                  player.id === currentPlayerId ? "bg-blue-900/30 border border-blue-500" : "bg-gray-800"
                }`}
              >
                <div className="flex items-center">
                  <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center mr-3">
                    {index + 1}
                  </div>
                  <div>{player.name}</div>
                </div>
                <div className="font-bold">{player.score}</div>
              </div>
            ))}
          </div>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-4 w-full max-w-md">
          <button
            onClick={() => {
              endGame();
              router.push("/");
            }}
            className="py-2 px-4 bg-gray-700 hover:bg-gray-600 rounded text-white font-medium flex-1 text-center"
          >
            Exit
          </button>
          
          <Link 
            href="/quiz/admin"
            className="py-2 px-4 bg-blue-600 hover:bg-blue-700 rounded text-white font-medium flex-1 text-center"
          >
            Create New Quiz
          </Link>
        </div>
      </div>
    </div>
  );
}