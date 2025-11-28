"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuiz } from "@/lib/quiz-context";
import { useSupabase } from "@/lib/supabase-context";
import { useAccount } from "wagmi";
import Link from "next/link";
import { sdk } from "@farcaster/miniapp-sdk";
import { USDC_ADDRESSES, ZERO_ADDRESS } from "@/lib/contracts";
import { NETWORK_TOKENS } from "@/lib/token-config";
import type { Quiz as QuizType, GameState as GameStateType } from "@/lib/types";

export default function ResultsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const {
    currentGame,
    getCurrentQuiz,
    endGame,
    gameSessionId,
    setCurrentGame,
    setCurrentQuiz,
  } = useQuiz();
  const { address } = useAccount();
  const { supabase } = useSupabase();
  
  const [isDistributing, setIsDistributing] = useState(false);
  const [distributionStatus, setDistributionStatus] = useState("");
  const [distributionError, setDistributionError] = useState("");
  const [txHash, setTxHash] = useState("");

  const [quizData, setQuizData] = useState<{
    id: string;
    prize_amount: number;
    prize_token: string | null;
    creator_address: string;
    status: string;
    contract_tx_hash?: string;
  } | null>(null);

  const [isCreator, setIsCreator] = useState(false);
  const [creatorSessionId, setCreatorSessionId] = useState<string | null>(null);
  
  // Final player scores (static - no realtime)
  type PlayerSession = {
    id: string;
    player_name: string;
    wallet_address?: string | null;
    total_score: number;
    joined_at: string;
  };
  
  const [finalPlayers, setFinalPlayers] = useState<PlayerSession[]>([]);
  
  const queryGameId = searchParams.get("game");
  const queryQuizId = searchParams.get("quizId");
  const effectiveGameSessionId = gameSessionId || queryGameId;
  const quiz = getCurrentQuiz();

  useEffect(() => {
    const hydrateQuiz = async () => {
      if (quiz || !queryQuizId) return;

      const { data: quizRow, error: quizError } = await supabase
        .from("quizzes")
        .select("*")
        .eq("id", queryQuizId)
        .single();

      if (quizError || !quizRow) {
        console.error("Failed to load quiz for results:", quizError);
        return;
      }

      const { data: questionsData, error: questionsError } = await supabase
        .from("questions")
        .select("*")
        .eq("quiz_id", queryQuizId)
        .order("order_index", { ascending: true });

      if (questionsError) {
        console.error("Failed to load quiz questions for results:", questionsError);
        return;
      }

      const convertedQuiz: QuizType = {
        id: quizRow.id,
        title: quizRow.title,
        description: quizRow.description || "",
        questions: (questionsData || []).map((q: any) => ({
          id: q.id,
          text: q.question_text,
          options: q.options,
          correctAnswer: q.correct_answer_index,
          timeLimit: q.time_limit || 15,
        })),
        createdAt: quizRow.created_at ? new Date(quizRow.created_at) : new Date(),
      };

      setCurrentQuiz(convertedQuiz);
    };

    hydrateQuiz();
  }, [quiz, queryQuizId, setCurrentQuiz, supabase]);

  useEffect(() => {
    const hydrateGame = async () => {
      if (currentGame || !effectiveGameSessionId) return;

      const fallbackQuizId = getCurrentQuiz()?.id || queryQuizId;
      if (!fallbackQuizId) return;

      const { data: playersData, error: playersError } = await supabase
        .from("player_sessions")
        .select("id, player_name, total_score, joined_at")
        .eq("game_session_id", effectiveGameSessionId)
        .order("joined_at", { ascending: true });

      if (playersError) {
        console.error("Failed to hydrate game state for results:", playersError);
        return;
      }

      const hydratedGame: GameStateType = {
        quizId: fallbackQuizId,
        status: "finished",
        currentQuestionIndex: 0,
        players: (playersData || []).map((player) => ({
          id: player.id,
          name: player.player_name,
          score: player.total_score,
          answers: [],
        })),
        startTime: null,
        questionStartTime: null,
      };

      setCurrentGame(hydratedGame);
    };

    hydrateGame();
  }, [
    currentGame,
    effectiveGameSessionId,
    queryQuizId,
    getCurrentQuiz,
    setCurrentGame,
    supabase,
  ]);
  
  // Load quiz data and player answers from backend (only once on mount)
  useEffect(() => {
    const loadQuizData = async () => {
      if (!currentGame || !quiz) return;
      
      try {
        const { data, error } = await supabase
          .from('quizzes')
          .select('id, prize_amount, prize_token, creator_address, status, contract_tx_hash')
          .eq('id', currentGame.quizId)
          .single();
          
        if (!error && data) {
          setQuizData(data);
          
          // Check if current user is creator
          if (address && data.creator_address) {
            setIsCreator(address.toLowerCase() === data.creator_address.toLowerCase());
          }
        }

        // Fetch creator session ID from game session
        if (effectiveGameSessionId) {
          const { data: gameSession } = await supabase
            .from('game_sessions')
            .select('creator_session_id')
            .eq('id', effectiveGameSessionId)
            .single();
          
          if (gameSession?.creator_session_id) {
            setCreatorSessionId(gameSession.creator_session_id);
          }
        }

        // Load player answers from backend
        const playerSessionId = localStorage.getItem("playerSessionId");
        console.log('Player ID:', playerSessionId);
        if (playerSessionId) {
          const { data: answersData, error: answersError } = await supabase
            .from('answers')
            .select(`
              *,
              questions (
                correct_answer_index
              )
            `)
            .eq('player_session_id', playerSessionId);

          if (!answersError && answersData) {
            
            // Update current player with correct answers
            if (currentGame) {
              const updatedPlayers = currentGame.players.map((player) => {
                if (player.id !== playerSessionId) return player;
                
                const backendAnswers = answersData.map(answer => {
                  // Calculate isCorrect by comparing selected answer with correct answer
                  const isCorrect = answer.questions?.correct_answer_index !== null && 
                    answer.selected_answer_index === answer.questions.correct_answer_index;
                  
                  console.log('Answer calculation:', {
                    questionId: answer.question_id,
                    selected: answer.selected_answer_index,
                    correct: answer.questions?.correct_answer_index,
                    backendIsCorrect: answer.is_correct,
                    calculatedIsCorrect: isCorrect
                  });
                  
                return {
                  questionId: answer.question_id,
                  selectedAnswer: answer.selected_answer_index,
                  timeToAnswer: answer.time_taken,
                  isCorrect: isCorrect, // Use calculated value instead of backend
                  pointsEarned: answer.points_earned || 0
                };
                });
                
                return {
                  ...player,
                  answers: backendAnswers
                };
              });
              
              const updatedGame = {
                ...currentGame,
                players: updatedPlayers
              };
              
              setCurrentGame(updatedGame);
            }
          }
        }
      } catch (err) {
        console.error('Error loading quiz data:', err);
      }
    };
    
    loadQuizData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quiz, address, supabase, effectiveGameSessionId]);
  
  // Fetch final player scores (one-time fetch, no realtime)
  useEffect(() => {
    const fetchFinalScores = async () => {
      if (!effectiveGameSessionId) return;
      
      const { data, error } = await supabase
        .from('player_sessions')
        .select('id, player_name, wallet_address, total_score, joined_at')
        .eq('game_session_id', effectiveGameSessionId)
        .order('total_score', { ascending: false });
      
      if (!error && data) {
        console.log('🏆 Final player scores loaded:', data);
        setFinalPlayers(data);
      } else if (error) {
        console.error('Error fetching final scores:', error);
      }
    };
    
    fetchFinalScores();
  }, [effectiveGameSessionId, supabase]);
  
  // Redirect if no game is active
  useEffect(() => {
    if (currentGame && currentGame.status === "finished") return;
    if (effectiveGameSessionId) return;
    router.push("/");
  }, [currentGame, effectiveGameSessionId, router]);
  
  if (!currentGame || !quiz) {
    return (
      <div className="min-h-screen w-full bg-black text-white relative overflow-hidden flex items-center justify-center">
        <div className="animate-pulse text-2xl font-bold">Loading...</div>
      </div>
    );
  }
  
  // Use final players if available, otherwise fallback to context players
  // Map final players to match the expected format and exclude creator
  const sortedPlayers = (finalPlayers.length > 0
    ? finalPlayers.map(fp => {
        const contextPlayer = currentGame.players.find(p => p.id === fp.id);
        return {
          id: fp.id,
          name: fp.player_name,
          score: fp.total_score,
          answers: contextPlayer?.answers || []
        };
      })
    : [...currentGame.players].sort((a, b) => b.score - a.score))
    .filter(player => player.id !== creatorSessionId); // Exclude creator from leaderboard
  
  // Get current player
  const currentPlayerId = localStorage.getItem("playerSessionId");
  const currentPlayer = currentGame.players.find(p => p.id === currentPlayerId);
  
  // Handle casting result
  const handleCastResult = async () => {
    if (!currentPlayer || !quiz) return;
    
    const correctAnswers = currentPlayer.answers.filter(a => a.isCorrect).length;
    const totalQuestions = quiz.questions.length;
    const playerRank = sortedPlayers.findIndex(p => p.id === currentPlayerId) + 1;
    
    // Create the cast text
    const castText = `🎯 Just completed "${quiz.title}" quiz!\n\n` +
      `📊 My Score: ${currentPlayer.score} points\n` +
      `✅ Got ${correctAnswers}/${totalQuestions} questions right\n` +
      `🏆 Ranked #${playerRank} out of ${sortedPlayers.length} players\n\n` +
      `Play Hoot Quiz and test your knowledge! 🦉`;
    
    // URL della miniapp (home page)
    const appUrl = `${window.location.origin}/`;
    
    try {
      // Use the new composeCast function with embed
      await sdk.actions.composeCast({ 
        text: castText,
        close: false,
        channelKey: 'hoot',
        embeds: [appUrl]
      });
    } catch (error) {
      console.error('Error casting:', error);
      // Fallback to copy to clipboard
      navigator.clipboard.writeText(castText);
      alert('Cast text copied to clipboard!');
    }
  };
  
  const handleDistributePrizes = async () => {
      if (!address || !quizData || !effectiveGameSessionId) {
        return;
      }
    
    setIsDistributing(true);
    setDistributionError("");
    setDistributionStatus("");
    
    try {
      const requestBody = {
        game_session_id: effectiveGameSessionId,
        creator_wallet_address: address
      };
      
      setDistributionStatus("Completing game and distributing prizes...");
      
      // Call the complete-game edge function using Supabase client
      const { data: result, error: invokeError } = await supabase.functions.invoke('complete-game', {
        body: requestBody
      });
      
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
        
        {currentPlayer && !isCreator && (
          <div className="bg-purple-900/30 border border-purple-500 rounded-lg p-4 mb-8 w-full max-w-md">
            <h3 className="text-center mb-2 text-purple-200">Your Score</h3>
            <div className="text-4xl font-bold text-center text-purple-100">{currentPlayer.score}</div>
            <div className="text-center mt-2 text-purple-300">
              {currentPlayer.answers.filter(a => a.isCorrect).length} correct answers out of {quiz.questions.length}
            </div>
          </div>
        )}
        
        <div className="bg-purple-800/40 border border-purple-600/50 rounded-lg p-6 mb-8 w-full max-w-md">
          <h3 className="text-xl font-semibold mb-4 text-center text-purple-200">
            Leaderboard
          </h3>
          
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
                    <div className="w-10 h-10 mr-3 flex items-center justify-center text-2xl">
                      {index === 0 && <span>👑</span>}
                      {index === 1 && <span>🥈</span>}
                      {index === 2 && <span>🥉</span>}
                    </div>
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center mr-3">
                      <span className="text-gray-300 font-bold">{index + 1}</span>
                    </div>
                  )}
                  <span>{player.name}</span>
                </div>
                <div className="font-bold">{player.score}</div>
              </div>
            ))}
          </div>
        </div>
        
        {/* Prize Distribution Section - Only show for paid quizzes */}
        {quizData && quizData.prize_amount > 0 && (() => {
          const prizeToken = quizData.prize_token;

          const isETH =
            !prizeToken ||
            prizeToken.toLowerCase() === ZERO_ADDRESS.toLowerCase();

          const allTokens = Object.values(NETWORK_TOKENS).flat();

          const matchingToken = allTokens.find((token) => {
            if (token.isNative) {
              return isETH;
            }
            return (
              prizeToken &&
              token.address.toLowerCase() === prizeToken.toLowerCase()
            );
          });

          const tokenSymbol = matchingToken?.symbol ?? (isETH ? "ETH" : "TOKEN");
          const decimals = matchingToken?.decimals ?? (isETH ? 6 : 2);

          return (
          <div className="bg-purple-600/20 border border-purple-500 rounded-lg p-6 mb-8 w-full max-w-md">
            <h3 className="text-xl font-semibold mb-4 text-center text-purple-200">Prize Distribution</h3>
            
            <div className="mb-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span>Total Prize Pool:</span>
                <span className="font-bold">{quizData.prize_amount.toFixed(2)} {tokenSymbol}</span>
              </div>
              <div className="flex justify-between">
                <span>1st Place (40%):</span>
                <span>{(quizData.prize_amount * 0.40).toFixed(2)} {tokenSymbol}</span>
              </div>
              <div className="flex justify-between">
                <span>2nd Place (30%):</span>
                <span>{(quizData.prize_amount * 0.30).toFixed(2)} {tokenSymbol}</span>
              </div>
              <div className="flex justify-between">
                <span>3rd Place (20%):</span>
                <span>{(quizData.prize_amount * 0.20).toFixed(2)} {tokenSymbol}</span>
              </div>
              <div className="flex justify-between text-gray-400">
                <span>Treasury (10%):</span>
                <span>{(quizData.prize_amount * 0.1).toFixed(2)} {tokenSymbol}</span>
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
          );
        })()}
        
        {quizData && quizData.status === 'completed' && (
          <div className="bg-purple-800/40 border border-purple-600/50 rounded-lg p-4 mb-8 w-full max-w-md text-center">
            <p className="text-purple-200">✓ Prizes have been distributed!</p>
          </div>
        )}
        
        <div className="flex flex-col gap-4 w-full max-w-md">
          {/* Cast Result Button */}
          {currentPlayer && (
            <button
              onClick={handleCastResult}
              className="py-4 px-8 bg-purple-600 hover:bg-purple-700 rounded text-white font-medium text-center transition-colors flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
              </svg>
              Cast Your Result
            </button>
          )}
          
          <div className="bg-purple-900/30 border border-purple-500 rounded-lg p-4">
            <div className="flex flex-col sm:flex-row gap-4">
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
                className="py-2 px-4 bg-transparent border-2 border-purple-600 hover:bg-purple-600/10 rounded text-purple-200 font-medium flex-1 text-center transition-colors"
              >
                Create New Quiz
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}