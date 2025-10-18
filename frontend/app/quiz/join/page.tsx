"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuiz } from "@/lib/quiz-context";

export default function JoinQuizPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { quizzes, currentGame, joinGame } = useQuiz();
  const [answer, setAnswer] = useState("");
  const [playerName, setPlayerName] = useState("");
  const [joined, setJoined] = useState(false);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  
  // Get the pin from the URL if available
  const pin = searchParams?.get("pin") || "";

  useEffect(() => {
    // If we have a player name stored, use it
    const storedName = localStorage.getItem("playerName");
    if (storedName) {
      setPlayerName(storedName);
    }
  }, []);

  const handleJoin = () => {
    if (!playerName.trim()) {
      alert("Please enter your name");
      return;
    }
    
    // Store player name for future use
    localStorage.setItem("playerName", playerName);
    
    // Join the game
    const playerId = joinGame(playerName);
    localStorage.setItem("playerId", playerId);
    
    setJoined(true);
  };

  const handleSubmitAnswer = () => {
    // In a real implementation, we would submit the answer to the server
    // For now, just show a success message
    alert("Answer submitted!");
    setAnswer("");
  };

  const handleOptionSelect = (index: number) => {
    setSelectedOption(index);
  };

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
      
      {/* Content container */}
      <div className="relative z-10 flex flex-col items-center min-h-screen px-4 py-8">
        {/* Top navigation */}
        <div className="w-full max-w-md flex justify-between items-center mb-4">
          <div className="text-sm">Quiz Game</div>
          <div className="flex space-x-2">
            <button className="px-3 py-1 text-sm rounded bg-gray-700 hover:bg-gray-600">
              Exit
            </button>
          </div>
        </div>
        
        {!joined ? (
          // Join screen
          <div className="w-full max-w-md flex flex-col items-center justify-center h-[70vh]">
            <div className="mb-6 text-2xl font-bold">Join Quiz</div>
            <input
              type="text"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              placeholder="Enter your name"
              className="w-full px-4 py-3 mb-4 rounded-md bg-white text-black"
            />
            <input
              type="text"
              value={pin}
              readOnly={!!pin}
              onChange={(e) => {/* This would update the pin if needed */}}
              placeholder="Enter game pin"
              className="w-full px-4 py-3 mb-6 rounded-md bg-white text-black"
            />
            <button
              onClick={handleJoin}
              className="w-full px-4 py-3 bg-zinc-800 hover:bg-zinc-700 text-white rounded-md transition-colors"
            >
              Join Game
            </button>
          </div>
        ) : (
          // Answer screen
          <div className="w-full max-w-md flex flex-col items-center">
            <div className="mb-6 w-full">
              <div className="border border-white/30 rounded p-4 h-32 flex items-center justify-center mb-4">
                <div className="text-white text-center">
                  What is the capital of France?
                </div>
              </div>
              
              {/* Answer input */}
              <div className="mb-4">
                <div className="relative">
                  <div className="bg-yellow-400 text-black p-4 rounded-md">
                    <div className="text-xs mb-1">Write Reply</div>
                    <input
                      type="text"
                      value={answer}
                      onChange={(e) => setAnswer(e.target.value)}
                      placeholder="xxxx"
                      className="w-full bg-transparent focus:outline-none font-bold"
                    />
                  </div>
                  <div className="absolute right-2 top-2 flex space-x-1">
                    <div className="w-3 h-3 rounded-full bg-gray-500"></div>
                    <div className="w-3 h-3 rounded-full bg-gray-500"></div>
                  </div>
                </div>
                
                <button
                  onClick={handleSubmitAnswer}
                  className="w-full mt-2 py-2 bg-white text-black rounded-md"
                >
                  Correct Answer
                </button>
              </div>
              
              {/* Answer options */}
              <div className="grid grid-cols-2 gap-4 mb-8">
                <div className="bg-lime-500 rounded p-4 text-white">
                  Paris
                </div>
                <div className="bg-red-500 rounded p-4 text-white">
                  London
                </div>
                <div className="bg-blue-600 rounded p-4 text-white">
                  Berlin
                </div>
                <div className="bg-yellow-400 rounded p-4 text-black">
                  Rome
                </div>
              </div>
              
              {/* Question navigation */}
              <div className="flex items-center justify-center space-x-4">
                <div className={`border rounded px-4 py-2 text-xs ${selectedOption === 0 ? 'border-white' : 'border-white/30'}`}>
                  Domanda 1<br/>
                  xx
                </div>
                <div className={`border rounded px-4 py-2 text-xs ${selectedOption === 1 ? 'border-white' : 'border-white/30'}`}>
                  Domanda 2<br/>
                  xx
                </div>
                <button className="border border-white/30 rounded px-3 py-3 text-xs">
                  →
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}