"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuiz } from "@/lib/quiz-context";
import { useSupabase } from "@/lib/supabase-context";
import { useAccount } from "wagmi";
import Link from "next/link";

export default function ResultsPage() {
  const router = useRouter();
  const { currentGame, getCurrentQuiz, endGame, gameSessionId } = useQuiz();
  const { address } = useAccount();
  const { supabase } = useSupabase();
  
  const [isDistributing, setIsDistributing] = useState(false);
  const [distributionStatus, setDistributionStatus] = useState("");
  const [distributionError, setDistributionError] = useState("");
  const [txHash, setTxHash] = useState("");
  const [quizData, setQuizData] = useState<{
    id: string;
    prize_amount: number;
    creator_address: string;
    status: string;
    contract_tx_hash?: string;
  } | null>(null);
  const [isCreator, setIsCreator] = useState(false);
  
  const quiz = getCurrentQuiz();
  
  // Load quiz data from backend
  useEffect(() => {
    const loadQuizData = async () => {
      if (!currentGame || !quiz) return;
      
      try {
        const { data, error } = await supabase
          .from('quizzes')
          .select('*')
          .eq('id', currentGame.quizId)
          .single();
          
        if (!error && data) {
          setQuizData(data);
          
          // Check if current user is creator
          if (address && data.creator_address) {
            setIsCreator(address.toLowerCase() === data.creator_address.toLowerCase());
          }
        }
      } catch (err) {
        console.error('Error loading quiz data:', err);
      }
    };
    
    loadQuizData();
  }, [currentGame, quiz, address, supabase]);
  
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
  
  const handleDistributePrizes = async () => {
    if (!address || !quizData || !gameSessionId) {
      console.error('❌ Missing required data:', { address, quizDataId: quizData?.id, gameSessionId });
      return;
    }
    
    setIsDistributing(true);
    setDistributionError("");
    setDistributionStatus("");
    
    try {
      const requestBody = {
        game_session_id: gameSessionId,
        creator_wallet_address: address
      };
      
      console.log('📤 Sending complete-game request:', requestBody);
      setDistributionStatus("Completing game and distributing prizes...");
      
      // Call the complete-game edge function using Supabase client
      const { data: result, error: invokeError } = await supabase.functions.invoke('complete-game', {
        body: requestBody
      });
      
      console.log('📥 Complete-game response:', result);
      
      if (invokeError) {
        console.error('❌ Edge function error:', invokeError);
        throw new Error(invokeError.message || 'Failed to call complete-game function');
      }

      if (result?.success) {
        setDistributionStatus("Prizes distributed successfully!");
        
        // Set transaction hash if available (from the backend response or quiz data)
        if (result.contract_address) {
          // Refresh quiz data to get the updated transaction hash
          const { data: updatedQuiz } = await supabase
            .from('quizzes')
            .select('contract_tx_hash')
            .eq('id', quizData.id)
            .single();
          
          if (updatedQuiz?.contract_tx_hash) {
            setTxHash(updatedQuiz.contract_tx_hash);
          }
        }
        
        // Refresh the page to show updated status
        setTimeout(() => {
          window.location.reload();
        }, 2000);
      } else {
        const errorMessage = result?.error || 'Failed to distribute prizes';
        console.error('❌ Backend returned error:', errorMessage);
        throw new Error(errorMessage);
      }
    } catch (err) {
      console.error('❌ Error distributing prizes:', err);
      setDistributionError(err instanceof Error ? err.message : 'Failed to distribute prizes');
    } finally {
      setIsDistributing(false);
    }
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
      
 
      
      <div className="relative z-10 container mx-auto py-8 px-4 flex flex-col items-center">
        <h1 className="text-3xl font-bold mb-2">Quiz Results</h1>
        <h2 className="text-xl mb-8">{quiz.title}</h2>
        
        {currentPlayer && (
          <div className="bg-purple-900/30 border border-purple-500 rounded-lg p-4 mb-8 w-full max-w-md">
            <h3 className="text-center mb-2 text-purple-200">Your Score</h3>
            <div className="text-4xl font-bold text-center text-purple-100">{currentPlayer.score}</div>
            <div className="text-center mt-2 text-purple-300">
              {currentPlayer.answers.filter(a => a.isCorrect).length} correct answers out of {quiz.questions.length}
            </div>
            {/* Debug info */}
            <div className="text-xs text-purple-400 mt-2 text-center">
              Debug: Total answers: {currentPlayer.answers.length}, 
              Correct: {currentPlayer.answers.filter(a => a.isCorrect).length},
              Score from backend: {currentPlayer.score}
            </div>
            <div className="text-xs text-purple-400 mt-1 text-center">
              Answers: {JSON.stringify(currentPlayer.answers.map(a => ({ 
                questionId: a.questionId, 
                selected: a.selectedAnswer, 
                correct: a.isCorrect 
              })))}
            </div>
          </div>
        )}
        
        <div className="bg-purple-800/40 border border-purple-600/50 rounded-lg p-6 mb-8 w-full max-w-md">
          <h3 className="text-xl font-semibold mb-4 text-center text-purple-200">Leaderboard</h3>
          
          <div className="space-y-3">
            {sortedPlayers.map((player, index) => (
              <div 
                key={player.id}
                className={`flex items-center justify-between p-3 rounded ${
                  player.id === currentPlayerId ? "bg-purple-700/30 border border-purple-500" : "bg-purple-600/20 border border-purple-400/30"
                } ${index < 3 ? 'border-2 border-yellow-500/50' : ''}`}
              >
                <div className="flex items-center">
                  {index < 3 ? (
                    <div className="w-10 h-10 mr-3 flex items-center justify-center">
                      {index === 0 && (
                        <div className="relative">
                          {/* Gold Medal */}
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-yellow-400 to-yellow-600 shadow-lg border-2 border-yellow-300 flex items-center justify-center">
                            <span className="text-yellow-900 font-bold text-lg">1</span>
                          </div>
                          {/* Ribbon */}
                          <div className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 w-6 h-3 bg-gradient-to-r from-blue-600 via-white to-red-600 rounded-sm"></div>
                        </div>
                      )}
                      {index === 1 && (
                        <div className="relative">
                          {/* Silver Medal */}
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-gray-300 to-gray-500 shadow-lg border-2 border-gray-200 flex items-center justify-center">
                            <span className="text-gray-800 font-bold text-lg">2</span>
                          </div>
                          {/* Ribbon */}
                          <div className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 w-6 h-3 bg-gradient-to-r from-blue-600 via-white to-red-600 rounded-sm"></div>
                        </div>
                      )}
                      {index === 2 && (
                        <div className="relative">
                          {/* Bronze Medal */}
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 shadow-lg border-2 border-orange-300 flex items-center justify-center">
                            <span className="text-orange-900 font-bold text-lg">3</span>
                          </div>
                          {/* Ribbon */}
                          <div className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 w-6 h-3 bg-gradient-to-r from-blue-600 via-white to-red-600 rounded-sm"></div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center mr-3">
                      <span className="text-gray-300 font-bold">{index + 1}</span>
                    </div>
                  )}
                  <div>{player.name}</div>
                </div>
                <div className="font-bold">{player.score}</div>
              </div>
            ))}
          </div>
        </div>
        
        {/* Prize Distribution Section - Visible to all, but only creator can distribute */}
        {quizData && quizData.prize_amount > 0 && quizData.status !== 'completed' && (
          <div className="bg-purple-600/20 border border-purple-500 rounded-lg p-6 mb-8 w-full max-w-md">
            <h3 className="text-xl font-semibold mb-4 text-center text-purple-200">Prize Distribution</h3>
            
            <div className="mb-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span>Total Prize Pool:</span>
                <span className="font-bold">{quizData.prize_amount} ETH</span>
              </div>
              <div className="flex justify-between">
                <span>1st Place (40%):</span>
                <span>{(quizData.prize_amount * 0.36).toFixed(4)} ETH</span>
              </div>
              <div className="flex justify-between">
                <span>2nd Place (30%):</span>
                <span>{(quizData.prize_amount * 0.27).toFixed(4)} ETH</span>
              </div>
              <div className="flex justify-between">
                <span>3rd Place (20%):</span>
                <span>{(quizData.prize_amount * 0.18).toFixed(4)} ETH</span>
              </div>
              <div className="flex justify-between text-gray-400">
                <span>Treasury (10%):</span>
                <span>{(quizData.prize_amount * 0.1).toFixed(4)} ETH</span>
              </div>
            </div>
            
            {distributionStatus && (
              <div className="mb-4 bg-blue-500/20 border border-blue-500 rounded p-3 text-center text-sm">
                {distributionStatus}
              </div>
            )}
            
            {distributionError && (
              <div className="mb-4 bg-red-500/20 border border-red-500 rounded p-3 text-center text-sm">
                {distributionError}
              </div>
            )}
            
            {txHash && (
              <div className="mb-4 bg-green-500/20 border border-green-500 rounded p-3 text-center text-sm">
                <p className="mb-2">Transaction successful!</p>
                <a 
                  href={`https://etherscan.io/tx/${txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:underline break-all"
                >
                  View on Explorer
                </a>
              </div>
            )}
            
            {isCreator ? (
              <button
                onClick={handleDistributePrizes}
                disabled={isDistributing || !address}
                className="w-full py-3 rounded text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                style={{
                  backgroundColor: isDistributing ? "#16a34a" : "#22c55e", // green-600 when loading, green-500 when ready
                }}
                onMouseEnter={(e) => {
                  if (!isDistributing) {
                    e.currentTarget.style.backgroundColor = "#16a34a"; // green-600 on hover
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isDistributing) {
                    e.currentTarget.style.backgroundColor = "#22c55e"; // green-500 normal state
                  }
                }}
              >
                {isDistributing ? 'Distributing Prizes...' : 'Distribute Prizes'}
              </button>
            ) : (
              <div className="w-full py-3 bg-gray-600 rounded text-white font-medium text-center">
                Only the quiz creator can distribute prizes
              </div>
            )}
          </div>
        )}
        
        {quizData && quizData.status === 'completed' && (
          <div className="bg-purple-800/40 border border-purple-600/50 rounded-lg p-4 mb-8 w-full max-w-md text-center">
            <p className="text-purple-200">✓ Prizes have been distributed!</p>
          </div>
        )}
        
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
            className="py-2 px-4 bg-purple-600 hover:bg-purple-700 rounded text-white font-medium flex-1 text-center transition-colors"
          >
            Create New Quiz
          </Link>
        </div>
      </div>
    </div>
  );
}