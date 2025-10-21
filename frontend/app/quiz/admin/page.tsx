"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuiz } from "@/lib/quiz-context";
import { useSupabase } from "@/lib/supabase-context";
import { useNetwork } from "@/lib/network-context";
import { useMiniKit } from "@coinbase/onchainkit/minikit";
import { useAccount, useWalletClient, usePublicClient, useConnect, useConnectors, useWriteContract, useSendTransaction, useBalance } from "wagmi";
import { BrowserProvider,  } from "ethers";
import { createQuizOnChain } from "@/lib/contract-helpers";
import { formatAddress, getEthBalance } from "@/lib/contract-helpers";
import { HOOT_QUIZ_MANAGER_ABI, getCurrentContractAddress, ZERO_ADDRESS } from "@/lib/contracts";
import { parseEther } from "viem";
import NetworkSwitcher from "@/components/NetworkSwitcher";
import ShareBox from "@/components/ShareBox";

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
  const { address } = useAccount();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const { connect } = useConnect();
  const connectors = useConnectors();
  const { supabase } = useSupabase();
  const { currentNetwork, setNetwork } = useNetwork();
  const { context } = useMiniKit();
  
  // Wagmi hooks for transactions
  const { writeContract, isPending: isWritePending, error: writeError } = useWriteContract();
  const { sendTransaction, isPending: isSendPending, error: sendError } = useSendTransaction();
  const { data: balance } = useBalance({ address });

  // Debug wagmi state
  useEffect(() => {
    console.log("🔍 Wagmi Debug Info:");
    console.log("address:", address);
    console.log("isWritePending:", isWritePending);
    console.log("isSendPending:", isSendPending);
    console.log("writeError:", writeError);
    console.log("sendError:", sendError);
    console.log("balance:", balance);
    console.log("walletClient:", walletClient);
    console.log("publicClient:", publicClient);
  }, [address, isWritePending, isSendPending, writeError, sendError, balance, walletClient, publicClient]);

  // Helper function to convert wagmi walletClient to ethers Signer
  const getEthersSigner = async () => {
    if (!walletClient) return null;
    const { account, chain, transport } = walletClient;
    const network = {
      chainId: chain.id,
      name: chain.name,
      ensAddress: chain.contracts?.ensRegistry?.address,
    };
    const provider = new BrowserProvider(transport, network);
    const signer = await provider.getSigner(account.address);
    return signer;
  };

  // Helper function to get ethers Provider from publicClient
  const getEthersProvider = () => {
    if (!publicClient) return null;
    const network = {
      chainId: publicClient.chain.id,
      name: publicClient.chain.name,
      ensAddress: publicClient.chain.contracts?.ensRegistry?.address,
    };
    return new BrowserProvider(publicClient.transport, network);
  };

  // Create quiz on-chain using wagmi (Farcaster compatible)
  const createQuizWithWagmi = async (quizId: string, prizeAmount: string) => {
    const contractAddress = getCurrentContractAddress('base');
    const prizeAmountWei = parseEther(prizeAmount);
    
    console.log('Creating quiz with wagmi:', {
      contractAddress,
      quizId,
      prizeAmount,
      prizeAmountWei: prizeAmountWei.toString()
    });

    try {
      const txHash = await writeContract({
        address: contractAddress as `0x${string}`,
        abi: HOOT_QUIZ_MANAGER_ABI,
        functionName: 'createQuiz',
        args: [quizId, ZERO_ADDRESS, prizeAmountWei],
        value: prizeAmountWei,
      });
      
      console.log('Quiz created successfully:', txHash);
      return txHash;
    } catch (error) {
      console.error('Error creating quiz:', error);
      throw error;
    }
  };

  // CSS per forzare i colori degli input
  const placeholderStyle = `
    .quiz-input::placeholder {
      color: #D1D5DB !important;
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
  const [showShareBox, setShowShareBox] = useState(false);
  const [createdRoomCode, setCreatedRoomCode] = useState<string>("");
  const [addQuestionError, setAddQuestionError] = useState<string>("");
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);

  // Determine wallet info (Farcaster or wagmi)
  const farcasterUser = context?.user as { addresses?: string[] } | undefined;
  const walletAddress = address || farcasterUser?.addresses?.[0];
  const isInFarcaster = !!context;

  // Load ETH balance using wagmi
  useEffect(() => {
    if (balance) {
      setEthBalance(balance.formatted);
    }
  }, [balance]);

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
    // Pulisci l'errore quando l'utente modifica le opzioni
    setAddQuestionError("");
    // Nascondi il tooltip se la domanda è ora completa
    const filledOptions = newOptions.filter(opt => opt.text.trim() !== "");
    if (currentQuestion.text.trim() !== "" && filledOptions.length >= 2) {
      setShowTooltip(false);
    }
  };

  const handleCorrectAnswerChange = (index: number) => {
    setCurrentQuestion({ ...currentQuestion, correctAnswer: index });
    // Pulisci l'errore quando l'utente seleziona una risposta corretta
    setAddQuestionError("");
    // Non nascondere il tooltip qui, solo quando la domanda è completa
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
    // Pulisci errori precedenti
    setAddQuestionError("");
    
    // Controlla se la domanda è completa (testo + almeno 2 risposte)
    const hasQuestionText = currentQuestion.text.trim() !== "";
    const filledOptions = currentQuestion.options.filter(opt => opt.text.trim() !== "");
    const hasEnoughAnswers = filledOptions.length >= 2;
    
    // Se la domanda non è completa, mostra il tooltip e non procedere
    if (!hasQuestionText || !hasEnoughAnswers) {
      setShowTooltip(true);
      return;
    }

    // Salva automaticamente la domanda corrente se ha contenuto
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

  const handleDeleteQuestion = (index: number) => {
    const newQuestions = questions.filter((_, i) => i !== index);
    setQuestions(newQuestions);
    
    // Se stiamo eliminando la domanda corrente, vai alla prima domanda disponibile
    if (currentQuestionIndex === index) {
      if (newQuestions.length > 0) {
        setCurrentQuestionIndex(0);
      } else {
        setCurrentQuestionIndex(0);
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
    } else if (currentQuestionIndex > index) {
      // Se la domanda eliminata era prima di quella corrente, decrementa l'indice
      setCurrentQuestionIndex(currentQuestionIndex - 1);
    }
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
      if (!walletClient && !isInFarcaster) {
        setError("No wallet connected. Please connect wallet or use Farcaster.");
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
      
      if (address) {
        // Use wagmi for transaction (works with both regular wallets and Farcaster)
        try {
          const txHash = await createQuizWithWagmi(backendQuizId, prizeAmount);
          console.log("Quiz created on-chain with prize deposit:", txHash);
          console.log("Prize amount deposited:", prizeAmount, "ETH");
          console.log("Network:", currentNetwork);
        } catch (error) {
          console.error("Error creating quiz on-chain:", error);
          setError("Failed to create quiz on blockchain. Please try again.");
          setIsCreating(false);
          return;
        }
      } else {
        // No wallet connected
        console.log("No wallet connected - skipping on-chain creation");
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
      
      // Show share box instead of immediate redirect
      setCreatedRoomCode(generatedRoomCode);
      setShowShareBox(true);
      
    } catch (err) {
      console.error("Error creating quiz:", err);
      const errorMessage = err instanceof Error ? err.message : "Failed to create quiz. Please try again.";
      setError(errorMessage);
      setIsCreating(false);
      setCreationStep("");
    }
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
      
      {/* Logo in top left */}
      <div className="absolute top-4 left-4 z-20">
        <img 
          src="/Logo.png" 
          alt="Hoot Logo" 
          className="h-20 w-auto cursor-pointer hover:opacity-80 transition-opacity"
          onClick={() => router.push('/')}
        />
      </div>

      {/* Content container */}
      <div className="relative z-10 flex flex-col items-center min-h-screen px-4 pt-20">
        {/* Network Switcher */}
        <div className="w-full max-w-md mb-4 flex justify-center">
          <div className="relative">
            {/* <button
              onClick={() => setShowNetworkSwitcher(!showNetworkSwitcher)}
              className="flex items-center space-x-2 bg-gray-800/50 rounded-lg px-3 py-2 hover:bg-gray-700/50 transition-colors cursor-pointer"
            >
              <div className="w-4 h-4 rounded-full bg-green-500"></div>
              <span className="text-sm text-gray-300">
                Base Sepolia
              </span>
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button> */}
            
            {showNetworkSwitcher && (
              <div className="absolute top-full left-0 mt-1 w-full bg-gray-800 rounded-lg shadow-lg z-50">
                {/* <button
                  onClick={() => {
                    setNetwork('baseSepolia');
                    setShowNetworkSwitcher(false);
                  }}
                  className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-700 rounded-lg ${
                    currentNetwork === 'baseSepolia' ? 'bg-gray-700 text-white' : 'text-gray-300'
                  }`}
                >
                  Base Sepolia
                </button> */}
              </div>
            )}
          </div>
        </div>


        {/* Error/Status Messages */}
        {error && (
          <div className="w-full max-w-md mb-1 bg-red-500/20 border border-red-500 rounded-lg p-3 text-center text-red-200">
            {error}
          </div>
        )}
        {writeError && (
          <div className="w-full max-w-md mb-1 bg-red-500/20 border border-red-500 rounded-lg p-3 text-center text-red-200">
            Transaction Error: {writeError.message}
          </div>
        )}
        {sendError && (
          <div className="w-full max-w-md mb-1 bg-red-500/20 border border-red-500 rounded-lg p-3 text-center text-red-200">
            Send Error: {sendError.message}
          </div>
        )}
        {creationStep && (
          <div className="w-full max-w-md mb-1 bg-blue-500/20 border border-blue-500 rounded-lg p-3 text-center text-blue-200">
            {creationStep}
          </div>
        )}

        {/* Top navigation */}
        <div className="w-full max-w-md flex justify-center items-center mb-1">
          <input
            type="text"
            value={quizTitle}
            onChange={(e) => setQuizTitle(e.target.value)}
            placeholder="Quiz Title"
            className="px-4 py-2 mb-3 text-sm rounded bg-black text-white border border-white w-full"
          />
        </div>
        
        {/* Question input */}
        <div className="w-full max-w-md mb-6">
          <div className="bg-white rounded p-4 h-32 relative">
            <textarea
              value={currentQuestion.text}
              onChange={(e) => {
                setCurrentQuestion({ ...currentQuestion, text: e.target.value });
                // Pulisci l'errore quando l'utente modifica il testo della domanda
                setAddQuestionError("");
                // Nascondi il tooltip se la domanda è ora completa
                const filledOptions = currentQuestion.options.filter(opt => opt.text.trim() !== "");
                if (e.target.value.trim() !== "" && filledOptions.length >= 2) {
                  setShowTooltip(false);
                }
              }}
              placeholder="Enter your question here"
              className="quiz-input w-full h-full bg-transparent text-center resize-none focus:outline-none absolute inset-0 flex items-center justify-center text-black"
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
        <div className="w-full max-w-md flex flex-col gap-4 mb-8">
          {currentQuestion.options.map((option, index) => {
            const colors = ["#0DCEFB", "#53DB1E", "#FDCC0E", "#F70000"];
            return (
            <div 
              key={index}
              className={`${option.color} rounded p-4 text-white relative border-2`}
              style={{ 
                backgroundColor: `${colors[index]}40`, // Aggiunge opacità al colore di sfondo
                borderColor: colors[index],
                borderWidth: '2px'
              }}
              onClick={() => handleCorrectAnswerChange(index)}
            >
              {/* Indicatore di risposta corretta */}
              <div className="absolute top-1 right-1 w-4 h-4 rounded-full flex items-center justify-center"
                   style={{ 
                     backgroundColor: currentQuestion.correctAnswer === index ? 'white' : 'rgba(255, 255, 255, 0.3)'
                   }}>
                {currentQuestion.correctAnswer === index ? (
                  <svg className="w-3 h-3 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <div className="w-2 h-2 rounded-full bg-white"></div>
                )}
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
        <div className="w-full max-w-md flex items-center justify-center space-x-4 pb-2">
          {questions.map((question, index) => (
            <div 
              key={index}
              className={`bg-black border ${currentQuestionIndex === index ? 'border-white' : 'border-white/30'} rounded px-4 py-2 text-sm cursor-pointer hover:border-white transition-colors flex-shrink-0 relative`}
              onClick={() => handleQuestionClick(index)}
            >
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteQuestion(index);
                }}
                className="absolute top-0 right-0 text-white hover:text-gray-300 p-1"
                title="Delete question"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              <div>
                Question {index + 1}
              </div>
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
          <div className="flex flex-col items-center relative">
            <button 
              className="bg-black border border-white/30 rounded px-4 py-2 text-2xl flex-shrink-0 hover:border-white transition-colors"
              onClick={handleAddQuestion}
            >
              +
            </button>
            {addQuestionError && (
              <div className="mt-2 text-xs text-red-400 text-center max-w-48">
                {addQuestionError}
              </div>
            )}
            {showTooltip && (
              <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 bg-gray-300 text-black text-xs px-2 py-1 rounded shadow-lg z-50 whitespace-nowrap">
                Complete the current question
                <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-300"></div>
              </div>
            )}
          </div>
        </div>
        
        {/* Action buttons */}
        <div className="mt-6 flex flex-col gap-4 w-full max-w-md">
          <button
            onClick={handleSaveQuiz}
            disabled={isCreating || !walletAddress || isWritePending || isSendPending}
            className="px-4 py-2 rounded text-white disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              backgroundColor: isCreating || !walletAddress || isWritePending || isSendPending ? "#666" : "#8A63D2"
            }}
          >
            {isCreating ? 'Creating...' : isWritePending || isSendPending ? 'Transaction Pending...' : 'Create Quiz'}
          </button>
          
          {/* AI Agent button */}
          
        </div>
      </div>
      
      {/* Share Box */}
      {showShareBox && (
        <ShareBox 
          roomCode={createdRoomCode}
          onClose={() => {
            setShowShareBox(false);
            // Navigate to lobby after closing share box
            router.push(`/quiz/lobby?room=${createdRoomCode}`);
          }}
          onGoToLobby={() => {
            setShowShareBox(false);
            router.push(`/quiz/lobby?room=${createdRoomCode}`);
          }}
        />
      )}

    </div>
  );
}