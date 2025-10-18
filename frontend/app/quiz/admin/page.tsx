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
  const { currentNetwork } = useNetwork();
  const { context } = useMiniKit();
  
  const [currentQuestion, setCurrentQuestion] = useState<QuizQuestion>({
    text: "",
    options: [
      { text: "", color: "bg-lime-500 hover:bg-lime-600" },
      { text: "", color: "bg-red-500 hover:bg-red-600" },
      { text: "", color: "bg-blue-600 hover:bg-blue-700" },
      { text: "", color: "bg-yellow-400 hover:bg-yellow-500" }
    ],
    correctAnswer: 0
  });
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [quizTitle, setQuizTitle] = useState("New Quiz");
  const [prizeAmount, setPrizeAmount] = useState("0.001");
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState("");
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
          { text: "", color: "bg-lime-500 hover:bg-lime-600" },
          { text: "", color: "bg-red-500 hover:bg-red-600" },
          { text: "", color: "bg-blue-600 hover:bg-blue-700" },
          { text: "", color: "bg-yellow-400 hover:bg-yellow-500" }
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
      
      if (!signer && !isInFarcaster) {
        setError("No signer available. Please reconnect your wallet.");
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
        title: quizTitle || "New Quiz",
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
        const { txHash } = await createQuizOnChain(backendQuizId, prizeAmount, signer, currentNetwork);
        console.log("Quiz created on-chain with prize deposit:", txHash);
        console.log("Prize amount deposited:", prizeAmount, "ETH");
        console.log("Network:", currentNetwork);
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
        { text: "Ethereum", color: "bg-lime-500 hover:bg-lime-600" },
        { text: "MySQL", color: "bg-red-500 hover:bg-red-600" },
        { text: "MongoDB", color: "bg-blue-600 hover:bg-blue-700" },
        { text: "Firebase", color: "bg-yellow-400 hover:bg-yellow-500" }
      ],
      correctAnswer: 0 // Ethereum è la risposta corretta
    };
    
    setCurrentQuestion(aiGeneratedQuestion);
  };

  // Calcola il numero della domanda corrente (per visualizzazione)
  const displayQuestionNumber = currentQuestionIndex + 1;

  // Ottieni un riassunto breve della domanda per i pulsanti (max 10 caratteri)
  const getQuestionSummary = (question: QuizQuestion) => {
    if (!question.text) return "xx";
    return question.text.length > 10 ? question.text.substring(0, 10) + "..." : question.text;
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
        {/* Network Switcher */}
        <div className="w-full max-w-md mb-4">
          <NetworkSwitcher />
        </div>

        {/* Wallet Connection Section */}
        <div className="w-full max-w-md mb-6 bg-gray-900/50 rounded-lg p-4">
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
                  className="px-3 py-2 rounded bg-white text-black"
                  placeholder="0.001"
                />
              </div>
            </div>
          )}
        </div>

        {/* Error/Status Messages */}
        {error && (
          <div className="w-full max-w-md mb-4 bg-red-500/20 border border-red-500 rounded-lg p-3 text-center text-red-200">
            {error}
          </div>
        )}
        {creationStep && (
          <div className="w-full max-w-md mb-4 bg-blue-500/20 border border-blue-500 rounded-lg p-3 text-center text-blue-200">
            {creationStep}
          </div>
        )}

        {/* Top navigation */}
        <div className="w-full max-w-md flex justify-between items-center mb-4">
          <div className="text-sm">Question Editor</div>
          <div className="flex space-x-2">
            <input
              type="text"
              value={quizTitle}
              onChange={(e) => setQuizTitle(e.target.value)}
              placeholder="Quiz Title"
              className="px-2 py-1 text-sm rounded bg-white text-black"
            />
            <button
              onClick={handleSaveQuiz}
              disabled={isCreating || !walletAddress}
              className="px-3 py-1 text-sm rounded bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isCreating ? 'Creating...' : 'Create & Start'}
            </button>
          </div>
        </div>
        
        {/* Question input */}
        <div className="w-full max-w-md mb-6">
          <div className="border border-white/30 rounded p-4 h-32 flex items-center justify-center">
            <textarea
              value={currentQuestion.text}
              onChange={(e) => setCurrentQuestion({ ...currentQuestion, text: e.target.value })}
              placeholder="Enter your question here"
              className="w-full h-full bg-transparent text-white text-center resize-none focus:outline-none"
            />
          </div>
        </div>
        
        {/* Answer options */}
        <div className="w-full max-w-md grid grid-cols-2 gap-4 mb-8">
          {currentQuestion.options.map((option, index) => (
            <div 
              key={index}
              className={`${option.color} rounded p-4 text-white relative`}
              onClick={() => handleCorrectAnswerChange(index)}
            >
              {/* Indicatore di risposta corretta */}
              {currentQuestion.correctAnswer === index && (
                <div className="absolute top-1 right-1 w-4 h-4 bg-white rounded-full flex items-center justify-center">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                </div>
              )}
              <input
                type="text"
                value={option.text}
                onChange={(e) => handleOptionChange(index, e.target.value)}
                placeholder={`add reply ${index + 1}`}
                className="w-full bg-transparent focus:outline-none"
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          ))}
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
              {currentQuestion.text ? getQuestionSummary(currentQuestion) : "xx"}
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
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded text-white"
          >
            Save Question
          </button>
          
          {/* AI Agent button */}
          <button
            onClick={handleUseAI}
            className="flex items-center justify-center gap-2 px-4 py-3 bg-[#7B68EE] hover:bg-[#6A5ACD] rounded-md text-white font-medium"
          >
            <span>Use AI Agent</span>
            <div className="flex items-center">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM12 5C13.66 5 15 6.34 15 8C15 9.66 13.66 11 12 11C10.34 11 9 9.66 9 8C9 6.34 10.34 5 12 5ZM12 19.2C9.5 19.2 7.29 17.92 6 15.98C6.03 13.99 10 12.9 12 12.9C13.99 12.9 17.97 13.99 18 15.98C16.71 17.92 14.5 19.2 12 19.2Z" fill="white"/>
              </svg>
              <span className="font-bold ml-1">CIVIC</span>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}