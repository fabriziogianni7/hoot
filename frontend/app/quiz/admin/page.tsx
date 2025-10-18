"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuiz } from "@/lib/quiz-context";
import { useWallet } from "@/lib/wallet-context";
import { useSupabase } from "@/lib/supabase-context";
import { useNetwork } from "@/lib/network-context";
import { useMiniKit } from "@coinbase/onchainkit/minikit";
import { createQuizOnChain } from "@/lib/contract-helpers";
import { formatAddress, getEthBalance } from "@/lib/contract-helpers";
import NetworkSwitcher from "@/components/NetworkSwitcher";

interface QuestionOption {
  text: string;
  color: string;
}

interface QuizQuestion {
  text: string;
  options: QuestionOption[];
  correctAnswer: number;
}

export default function AdminPage() {
  const router = useRouter();
  const { startGame, createQuizOnBackend, joinGame: joinGameContext } = useQuiz();
  const { account, provider, signer, connectWallet } = useWallet();
  const { supabase } = useSupabase();
  const { currentNetwork, setNetwork } = useNetwork();
  const { context } = useMiniKit();

  // CSS per forzare il colore bianco del placeholder
  const placeholderStyle = `
    .quiz-input::placeholder {
      color: white !important;
      opacity: 1 !important;
    }
    .quiz-input {
      color: white !important;
    }
  `;
  
  const [currentQuestion, setCurrentQuestion] = useState<QuizQuestion>({
    text: "",
    options: [
      { text: "", color: "hover:opacity-80" },
      { text: "", color: "hover:opacity-80" },
      { text: "", color: "hover:opacity-80" },
      { text: "", color: "hover:opacity-80" }
    ],
    correctAnswer: 0
  });
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [quizTitle, setQuizTitle] = useState("Name your Quiz");
  const [prizeAmount, setPrizeAmount] = useState("0.001");
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState("");
  const [showNetworkSwitcher, setShowNetworkSwitcher] = useState(false);
  const [ethBalance, setEthBalance] = useState<string>("");
  const [creationStep, setCreationStep] = useState<string>("");

  // Determine wallet info (Farcaster or MetaMask)
  const farcasterUser = context?.user as { addresses?: string[] } | undefined;
  const walletAddress = account || farcasterUser?.addresses?.[0];
  const isInFarcaster = !!context;

  // Load ETH balance
  useEffect(() => {
    const loadBalance = async () => {
      if (walletAddress && provider) {
        try {
          const balance = await getEthBalance(walletAddress, provider);
          setEthBalance(balance);
        } catch (err) {
          console.error('Error loading balance:', err);
        }
      }
    };

    loadBalance();
  }, [walletAddress, provider]);

  // Effetto per caricare la domanda corrente quando cambia l'indice
  useEffect(() => {
    if (currentQuestionIndex < questions.length) {
      // Stiamo modificando una domanda esistente
      setCurrentQuestion(questions[currentQuestionIndex]);
    } else {
      // Stiamo creando una nuova domanda
      setCurrentQuestion({
        text: "",
        options: [
          { text: "", color: "hover:opacity-80" },
          { text: "", color: "hover:opacity-80" },
          { text: "", color: "hover:opacity-80" },
          { text: "", color: "hover:opacity-80" }
        ],
        correctAnswer: 0
      });
    }
  }, [currentQuestionIndex, questions]);

  const handleOptionChange = (index: number, value: string) => {
    const newOptions = [...currentQuestion.options];
    newOptions[index] = { ...newOptions[index], text: value };
    setCurrentQuestion({ ...currentQuestion, options: newOptions });
  };

  const handleCorrectAnswerChange = (index: number) => {
    setCurrentQuestion({ ...currentQuestion, correctAnswer: index });
  };

  const handleSaveQuestion = () => {
    // Validazione
    if (currentQuestion.text.trim() === "") {
      alert("Please enter a question");
      return;
    }

    // Verifica che almeno due opzioni siano compilate
    const filledOptions = currentQuestion.options.filter(opt => opt.text.trim() !== "");
    if (filledOptions.length < 2) {
      alert("Please add at least two answer options");
      return;
    }

    const newQuestions = [...questions];
    
    if (currentQuestionIndex < questions.length) {
      // Modifica di una domanda esistente
      newQuestions[currentQuestionIndex] = currentQuestion;
    } else {
      // Aggiunta di una nuova domanda
      newQuestions.push(currentQuestion);
    }
    
    setQuestions(newQuestions);
    
    // Passa alla prossima domanda
    setCurrentQuestionIndex(newQuestions.length);
  };

  const handleQuestionClick = (index: number) => {
    // Salva la domanda corrente prima di cambiare
    if (currentQuestion.text.trim() !== "") {
      const newQuestions = [...questions];
      
      if (currentQuestionIndex < questions.length) {
        // Aggiorna la domanda esistente
        newQuestions[currentQuestionIndex] = currentQuestion;
      } else if (currentQuestionIndex === questions.length) {
        // Aggiungi la nuova domanda
        newQuestions.push(currentQuestion);
      }
      
      setQuestions(newQuestions);
    }
    
    // Passa alla domanda selezionata
    setCurrentQuestionIndex(index);
  };

  const handleAddQuestion = () => {
    // Salva la domanda corrente se ha contenuto
    if (currentQuestion.text.trim() !== "") {
      const newQuestions = [...questions];
      
      if (currentQuestionIndex < questions.length) {
        // Aggiorna la domanda esistente
        newQuestions[currentQuestionIndex] = currentQuestion;
      } else {
        // Aggiungi la nuova domanda
        newQuestions.push(currentQuestion);
      }
      
      setQuestions(newQuestions);
    }
    
    // Passa a una nuova domanda
    setCurrentQuestionIndex(questions.length + (currentQuestion.text.trim() !== "" ? 1 : 0));
  };

  const handleSaveQuiz = async () => {
    if (isCreating) return;
    
    setIsCreating(true);
    setError("");
    setCreationStep("");
    
    try {
      // Validate wallet
      if (!walletAddress) {
        setError("Please connect your wallet first");
        setIsCreating(false);
        return;
      }
      console.log("wallet Address", walletAddress);
      if (!signer && !isInFarcaster) {
        setError("No wallet connected. Please connect MetaMask or use Farcaster.");
        setIsCreating(false);
        return;
      }
      
      // Salva la domanda corrente se ha contenuto
      const allQuestions = [...questions];
      if (currentQuestion.text.trim() !== "") {
        if (currentQuestionIndex < questions.length) {
          allQuestions[currentQuestionIndex] = currentQuestion;
        } else {
          allQuestions.push(currentQuestion);
        }
      }
      
      if (allQuestions.length === 0) {
        setError("Please add at least one question");
        setIsCreating(false);
        return;
      }
      
      // Validate prize amount
      const prizeAmountNum = parseFloat(prizeAmount);
      if (isNaN(prizeAmountNum) || prizeAmountNum <= 0) {
        setError("Invalid prize amount");
        setIsCreating(false);
        return;
      }
      
      // Check balance
      if (ethBalance && parseFloat(ethBalance) < prizeAmountNum) {
        setError(`Insufficient balance. You have ${ethBalance} ETH but need ${prizeAmount} ETH`);
        setIsCreating(false);
        return;
      }
      
      // Step 1: Create quiz in backend first (to get quiz_id)
      setCreationStep("Saving quiz to database...");
      
      const quiz = {
        id: `quiz-${Date.now()}`, // Temporary ID, backend will generate the real one
        title: quizTitle || "Name your quiz",
        description: "Created from the admin interface",
        questions: allQuestions.map((q, i) => ({
          id: `q-${i}`,
          text: q.text,
          options: q.options.map(opt => opt.text),
          correctAnswer: q.correctAnswer,
          timeLimit: 15
        })),
        createdAt: new Date()
      };
      
      // Get contract address from environment
      const contractAddress = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || "";
      
      // Create in backend with prize amount and contract address
      const backendQuizId = await createQuizOnBackend(
        quiz,
        contractAddress, // Pass the contract address
        undefined, // tx hash will be set after on-chain creation
        walletAddress,
        prizeAmountNum // Pass the prize amount
      );
      
      console.log("Quiz saved to backend with ID:", backendQuizId);
      
      // Step 2: Create quiz on-chain with prize deposit using the backend quiz_id
      setCreationStep("Creating quiz on blockchain and depositing prize...");
      
      if (signer) {
        // MetaMask wallet - create on-chain with signer
        const { txHash } = await createQuizOnChain(backendQuizId, prizeAmount, signer, currentNetwork);
        console.log("Quiz created on-chain with prize deposit:", txHash);
        console.log("Prize amount deposited:", prizeAmount, "ETH");
        console.log("Network:", currentNetwork);
      } else if (isInFarcaster) {
        // Farcaster wallet - skip on-chain creation for now
        console.log("Farcaster wallet detected - skipping on-chain creation");
        console.log("Prize amount will be handled by backend:", prizeAmount, "ETH");
      }
      
      // Step 3: Start game session and join as creator
      setCreationStep("Creating game session...");
      
      const generatedRoomCode = await startGame(backendQuizId);
      
      // Auto-join as the creator
      const creatorPlayerId = await joinGameContext("Creator", walletAddress, generatedRoomCode);
      
      // Update game session with creator
      const { data: gameSessionData } = await supabase
        .from('game_sessions')
        .select('id')
        .eq('room_code', generatedRoomCode)
        .single();
        
      if (gameSessionData) {
        await supabase
          .from('game_sessions')
          .update({ creator_session_id: creatorPlayerId })
          .eq('id', gameSessionData.id);
      }
      
      // Store creator ID in localStorage
      localStorage.setItem("quizPlayerId", creatorPlayerId);
      
      // Navigate to lobby with room code
      router.push(`/quiz/lobby?room=${generatedRoomCode}`);
      
    } catch (err) {
      console.error("Error creating quiz:", err);
      const errorMessage = err instanceof Error ? err.message : "Failed to create quiz. Please try again.";
      setError(errorMessage);
      setIsCreating(false);
      setCreationStep("");
    }
  };

  const handleUseAI = () => {
    // Simula la generazione di una domanda con AI
    const aiGeneratedQuestion = {
      text: "Quale di queste è una tecnologia blockchain?",
      options: [
        { text: "Ethereum", color: "hover:opacity-80" },
        { text: "MySQL", color: "hover:opacity-80" },
        { text: "MongoDB", color: "hover:opacity-80" },
        { text: "Firebase", color: "hover:opacity-80" }
      ],
      correctAnswer: 0 // Ethereum è la risposta corretta
    };
    
    setCurrentQuestion(aiGeneratedQuestion);
  };

  // Calcola il numero della domanda corrente (per visualizzazione)
  const displayQuestionNumber = currentQuestionIndex + 1;

  // Ottieni un riassunto breve della domanda per i pulsanti (max 10 caratteri)
  const getQuestionSummary = (question: QuizQuestion) => {
    if (!question.text) return "";
    return question.text.length > 10 ? question.text.substring(0, 10) + "..." : question.text;
  };

  return (
    <div className="min-h-screen w-full bg-black text-white relative overflow-hidden">
      <style dangerouslySetInnerHTML={{ __html: placeholderStyle }} />
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
        {/* Network Switcher */}
        <div className="w-full max-w-md mb-4 flex justify-center">
          <div className="relative">
            <button
              onClick={() => setShowNetworkSwitcher(!showNetworkSwitcher)}
              className="flex items-center space-x-2 bg-gray-800/50 rounded-lg px-3 py-2 hover:bg-gray-700/50 transition-colors cursor-pointer"
            >
              <div className="w-4 h-4 rounded-full bg-green-500"></div>
              <span className="text-sm text-gray-300">
                {currentNetwork === 'base' ? 'Base' : 
                 currentNetwork === 'baseSepolia' ? 'Base Sepolia' : 
                 currentNetwork === 'local' ? 'Local' : 'Unknown'}
              </span>
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            
            {showNetworkSwitcher && (
              <div className="absolute top-full left-0 mt-1 w-full bg-gray-800 rounded-lg shadow-lg z-50">
                <button
                  onClick={() => {
                    setNetwork('base');
                    setShowNetworkSwitcher(false);
                  }}
                  className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-700 rounded-t-lg ${
                    currentNetwork === 'base' ? 'bg-gray-700 text-white' : 'text-gray-300'
                  }`}
                >
                  Base
                </button>
                <button
                  onClick={() => {
                    setNetwork('baseSepolia');
                    setShowNetworkSwitcher(false);
                  }}
                  className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-700 ${
                    currentNetwork === 'baseSepolia' ? 'bg-gray-700 text-white' : 'text-gray-300'
                  }`}
                >
                  Base Sepolia
                </button>
                <button
                  onClick={() => {
                    setNetwork('local');
                    setShowNetworkSwitcher(false);
                  }}
                  className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-700 rounded-b-lg ${
                    currentNetwork === 'local' ? 'bg-gray-700 text-white' : 'text-gray-300'
                  }`}
                >
                  Local
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Wallet Connection Section */}
        <div className="w-full max-w-md mb-1 bg-gray-900/50 rounded-lg p-4">
          {!walletAddress ? (
            <div className="flex flex-col items-center space-y-3">
              <div className="text-sm text-gray-300">Connect wallet to create quiz with prizes</div>
              {!isInFarcaster && (
                <button
                  onClick={connectWallet}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded text-white font-medium"
                >
                  Connect Wallet
                </button>
              )}
              {isInFarcaster && (
                <div className="text-sm text-green-400">Using Farcaster Wallet</div>
              )}
            </div>
          ) : (
            <div className="flex flex-col space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-300">Connected:</span>
                <span className="font-mono text-sm">{formatAddress(walletAddress)}</span>
              </div>
              {ethBalance && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-300">Balance:</span>
                  <span className="text-sm">{parseFloat(ethBalance).toFixed(4)} ETH</span>
                </div>
              )}
              <div className="flex flex-col space-y-1">
                <label className="text-sm text-gray-300">Prize Amount (ETH):</label>
                <input
                  type="number"
                  step="0.001"
                  min="0"
                  value={prizeAmount}
                  onChange={(e) => setPrizeAmount(e.target.value)}
                  className="px-3 py-2 rounded bg-black text-white"
                  placeholder="0.001"
                />
              </div>
            </div>
          )}
        </div>

        {/* Error/Status Messages */}
        {error && (
          <div className="w-full max-w-md mb-1 bg-red-500/20 border border-red-500 rounded-lg p-3 text-center text-red-200">
            {error}
          </div>
        )}
        {creationStep && (
          <div className="w-full max-w-md mb-1 bg-blue-500/20 border border-blue-500 rounded-lg p-3 text-center text-blue-200">
            {creationStep}
          </div>
        )}

        {/* Top navigation */}
        <div className="w-full max-w-md flex justify-between items-center mb-1">
          <div className="flex items-center -ml-1">
            <img 
              src="/Logo.png" 
              alt="Hoot Logo" 
              className="h-20 w-auto"
            />
          </div>
          <div className="flex space-x-2">
            <input
              type="text"
              value={quizTitle}
              onChange={(e) => setQuizTitle(e.target.value)}
              placeholder="Quiz Title"
                className="px-4 py-2 text-sm rounded bg-white text-black w-56"
            />
            <button
              onClick={handleSaveQuiz}
              disabled={isCreating || !walletAddress}
              className="px-3 py-1 text-sm rounded disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                backgroundColor: isCreating || !walletAddress ? "#666" : "#8A63D2",
                color: "white"
              }}
            >
              {isCreating ? 'Creating...' : 'Create'}
            </button>
          </div>
        </div>
        
        {/* Question input */}
        <div className="w-full max-w-md mb-6">
          <div className="border border-white rounded p-4 h-32 relative">
            <textarea
              value={currentQuestion.text}
              onChange={(e) => setCurrentQuestion({ ...currentQuestion, text: e.target.value })}
              placeholder="Enter your question here"
              className="quiz-input w-full h-full bg-transparent text-center resize-none focus:outline-none absolute inset-0 flex items-center justify-center"
              style={{ 
                display: 'flex', 
                alignItems: 'center', 
                marginTop: '32px',
                justifyContent: 'center',
                padding: '1rem'
              }}
            />
          </div>
        </div>
        
        {/* Answer options */}
        <div className="w-full max-w-md grid grid-cols-2 gap-4 mb-8">
          {currentQuestion.options.map((option, index) => {
            const colors = ["#0DCEFB", "#53DB1E", "#FDCC0E", "#F70000"];
            return (
            <div 
              key={index}
              className={`${option.color} rounded p-4 text-white relative`}
              style={{ backgroundColor: colors[index] }}
              onClick={() => handleCorrectAnswerChange(index)}
            >
              {/* Indicatore di risposta corretta */}
              <div className="absolute top-1 right-1 w-4 h-4 rounded-full flex items-center justify-center"
                   style={{ 
                     backgroundColor: currentQuestion.correctAnswer === index ? 'white' : 'rgba(255, 255, 255, 0.3)'
                   }}>
                <div className="w-2 h-2 rounded-full"
                     style={{ 
                       backgroundColor: currentQuestion.correctAnswer === index ? '#10B981' : 'white'
                     }}></div>
              </div>
              <input
                type="text"
                value={option.text}
                onChange={(e) => handleOptionChange(index, e.target.value)}
                placeholder={`add reply ${index + 1}`}
                className="quiz-input w-full bg-transparent focus:outline-none"
                onClick={(e) => e.stopPropagation()}
              />
            </div>
            );
          })}
        </div>
        
        {/* Question navigation */}
        <div className="w-full max-w-md flex items-center justify-center space-x-4 overflow-x-auto pb-2">
          {questions.map((question, index) => (
            <div 
              key={index}
              className={`bg-black border ${currentQuestionIndex === index ? 'border-white' : 'border-white/30'} rounded px-4 py-2 text-sm cursor-pointer hover:border-white transition-colors flex-shrink-0`}
              onClick={() => handleQuestionClick(index)}
            >
              Question {index + 1}<br/>
              {getQuestionSummary(question)}
            </div>
          ))}
          
          {/* Current question button (if it's a new question) */}
          {currentQuestionIndex === questions.length && (
            <div 
              className="bg-black border border-white rounded px-4 py-2 text-sm flex-shrink-0"
            >
              Question {displayQuestionNumber}<br/>
              {currentQuestion.text ? getQuestionSummary(currentQuestion) : ""}
            </div>
          )}
          
          {/* Add question button */}
          <button 
            className="bg-black border border-white/30 rounded px-4 py-2 text-2xl flex-shrink-0 hover:border-white transition-colors"
            onClick={handleAddQuestion}
          >
            +
          </button>
        </div>
        
        {/* Action buttons */}
        <div className="mt-6 flex flex-col gap-4 w-full max-w-md">
          <button
            onClick={handleSaveQuestion}
            className="px-4 py-2 rounded text-white"
            style={{
              backgroundColor: "#8A63D2"
            }}
          >
            Save Question
          </button>
          
          {/* AI Agent button */}
          
        </div>
      </div>
    </div>
  );
}