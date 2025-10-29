"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuiz } from "@/lib/quiz-context";
import { useSupabase } from "@/lib/supabase-context";
import { useAccount, useSwitchChain, usePublicClient, useWriteContract, useSendTransaction, useBalance, useReadContract } from "wagmi";
import { HOOT_QUIZ_MANAGER_ABI, ZERO_ADDRESS, USDC_ADDRESSES, ERC20_ABI } from "@/lib/contracts";
import { parseEther, parseUnits } from "viem";
import ShareBox from "@/components/ShareBox";
import { sdk } from "@farcaster/miniapp-sdk";
import { useAuth } from "@/lib/use-auth";

// Character limits for quiz content
const MAX_QUESTION_LENGTH = 500;
const MAX_ANSWER_LENGTH = 200;
const MAX_QUIZ_TITLE_LENGTH = 100;

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
  const { address, isConnected: _isConnected, chain, status: _status, connector: _connector} = useAccount();
  const { chains: _chains, switchChain } = useSwitchChain()
  const publicClient = usePublicClient();
  const { supabase } = useSupabase();
  const { data: ethBalance } = useBalance({address});
  const { loggedUser, isAuthLoading, authError: authErrorMessage, triggerAuth } = useAuth();


  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [quizTitle, setQuizTitle] = useState("Name your Quiz");
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState("");
  const [creationStep, setCreationStep] = useState<string>("");
  const [showShareBox, setShowShareBox] = useState(false);
  const [createdRoomCode, setCreatedRoomCode] = useState<string>("");
  const [addQuestionError, setAddQuestionError] = useState<string>("");
  const [showTooltip, setShowTooltip] = useState(false);
  const [showQuizOptions, setShowQuizOptions] = useState(false);
  const [bountyAmount, setBountyAmount] = useState("0.001");
  const [selectedCurrency, setSelectedCurrency] = useState<'usdc' | 'eth' | 'custom'>('usdc');
  const [customTokenAddress, _setCustomTokenAddress] = useState("");
  const [quizTransaction, setQuizTransaction] = useState<string>("");
  const [_approvalTransaction, setApprovalTransaction] = useState<string>("");
  const [hootContractAddress, setHootContractAddress] = useState<string>("");
  
  // Wagmi hooks for transactions
  const { writeContractAsync, isPending: _isWritePending, error: writeError } = useWriteContract();

  const { isPending: _isSendPending, error: sendError } = useSendTransaction();


  useEffect(() => {
    const hootAddress = chain?.id === 8453 ? `0x013e9b64f97e6943dcd1e167ec5c96754a6e9636` as `0x${string}` : `0x573496a44ace1d713723f5d91fcde63bf3d82d3a` as `0x${string}`;
    setHootContractAddress(hootAddress);
  }, [chain]);


  // Determine ERC20 token address based on selected currency
  const getTokenAddress = (): `0x${string}` | undefined => {
    if (selectedCurrency === 'usdc') {
      return (chain?.id === 8453 ? USDC_ADDRESSES.base : USDC_ADDRESSES.baseSepolia) as `0x${string}`;
    } else if (selectedCurrency === 'custom' && customTokenAddress) {
      return customTokenAddress as `0x${string}`;
    }
    return undefined;
  };

  const tokenAddress = getTokenAddress();

  // Read ERC20 token balance
  const { data: erc20Balance, refetch: refetchErc20Balance } = useReadContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: {
      enabled: !!address && !!tokenAddress && selectedCurrency !== 'eth'
    }
  });

  // Read ERC20 token decimals
  const { data: tokenDecimals } = useReadContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: 'decimals',
    query: {
      enabled: !!tokenAddress && selectedCurrency !== 'eth'
    }
  });



  // Create quiz on-chain using wagmi
  const createQuizOnChain = async (
    quizId: string,
    tokenAddress: string,
    amount: string,
    decimals: number = 18
  ) => {
    
    const isETH = tokenAddress === ZERO_ADDRESS;
    
    // Parse amount based on token type
    const amountWei = isETH 
      ? parseEther(amount)
      : parseUnits(amount, decimals);
    
    console.log('Creating quiz on-chain:', {
      hootContractAddress,
      quizId,
      tokenAddress,
      amount,
      decimals,
      amountWei: amountWei.toString(),
      isETH
    });
    
    const txHash = await  writeContractAsync({
      address: hootContractAddress as `0x${string}`,
        abi: HOOT_QUIZ_MANAGER_ABI,
        functionName: 'createQuiz',
      args: [quizId, tokenAddress as `0x${string}`, amountWei],
      value: isETH ? amountWei : BigInt(0),
      });
    setQuizTransaction(txHash);
    console.log('Quiz created on-chain, tx hash:', txHash);
      return txHash;
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
    .quiz-input.question-text {
      color: black !important;
    }
    .quiz-input.question-text::placeholder {
      color: #6B7280 !important;
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
  

  // Compute display balance based on selected currency
  const displayBalance: string = (() => {
    if (selectedCurrency === 'eth' && ethBalance) {
      return ethBalance.formatted;
    } else if ((selectedCurrency === 'usdc' || selectedCurrency === 'custom') && erc20Balance !== undefined && tokenDecimals !== undefined) {
      // Format ERC20 balance using the token's decimals
      const decimals = Number(tokenDecimals);
      const formattedBalance = (Number(erc20Balance) / Math.pow(10, decimals)).toString();
      return formattedBalance;
    }
    return '0';
  })();

  // Refetch ERC20 balance when currency or chain changes
  useEffect(() => {
    if ((selectedCurrency === 'usdc' || selectedCurrency === 'custom') && refetchErc20Balance) {
      refetchErc20Balance();
    }
  }, [selectedCurrency, chain?.id, refetchErc20Balance]);

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

  // Auto-scroll to current question when it changes
  useEffect(() => {
    const scrollContainer = document.querySelector('.overflow-x-auto');
    if (scrollContainer) {
      // Find the current question element
      const currentQuestionElement = scrollContainer.querySelector('.border-white');
      if (currentQuestionElement) {
        currentQuestionElement.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'nearest', 
          inline: 'center' 
        });
      }
    }
  }, [currentQuestionIndex]);

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

  const handleFreeQuiz = async () => {
    // Create quiz without bounty
    const result = await handleSaveQuiz();
    
    if (result) {
      // After quiz is created, show share box
    setShowQuizOptions(false);
    setShowShareBox(true);
    }
  };

  // Step 2: Create quiz and add bounty on-chain
  const handleBountyQuiz = async () => {
    if (!address) {
      setError("Please connect your wallet to add a bounty");
      return;
    }

    try {
      setError("");
      
      // First, create the quiz in backend
      const result = await handleSaveQuiz();
      
      if (!result) {
        setError("Failed to create quiz. Please try again.");
        return;
      }
      
      const { quizId } = result;
      setCreationStep("Preparing bounty...");
      
      // Validate bounty amount
      const bountyAmountNum = parseFloat(bountyAmount);
      if (isNaN(bountyAmountNum) || bountyAmountNum <= 0) {
        setError("Invalid bounty amount");
        return;
      }
      
      // Determine token address and decimals
      let tokenAddress: string;
      let decimals: number;

      if (selectedCurrency === 'eth') {
        tokenAddress = ZERO_ADDRESS;
        decimals = 18;
        
        // Check ETH balance
        if (ethBalance && parseFloat(ethBalance.formatted) < bountyAmountNum) {
          setError(`Insufficient ETH balance. You have ${ethBalance.formatted} ETH but need ${bountyAmount} ETH`);
          return;
        }
      } else if (selectedCurrency === 'usdc') {
        tokenAddress = chain?.id === 8453 
          ? USDC_ADDRESSES.base 
          : USDC_ADDRESSES.baseSepolia;
        decimals = 6;
        
        // Check USDC balance
        const usdcBalanceNum = parseFloat(displayBalance);
        if (usdcBalanceNum < bountyAmountNum) {
          setError(`Insufficient USDC balance. You have ${displayBalance} USDC but need ${bountyAmount} USDC`);
          return;
        }
      } else if (selectedCurrency === 'custom') {
        if (!customTokenAddress || customTokenAddress.trim() === '') {
          setError("Please enter a valid token contract address");
          return;
        }
        tokenAddress = customTokenAddress.trim();
        decimals = tokenDecimals ? Number(tokenDecimals) : 18;
      } else {
        setError("Invalid currency selection");
        return;
      }

      // For ERC20 tokens, approve the contract first
      if (tokenAddress !== ZERO_ADDRESS) {
        

        const amountWei = parseUnits(bountyAmount, decimals);

        setCreationStep("Checking token allowance...");
        
        const currentAllowance = await publicClient?.readContract({
          address: tokenAddress as `0x${string}`,
          abi: ERC20_ABI,
          functionName: 'allowance',
          args: [address, hootContractAddress as `0x${string}`]
        }) as bigint | undefined;

        // If allowance is insufficient, request approval
        if (!currentAllowance || currentAllowance < amountWei) {
          setCreationStep("Requesting token approval...");
          const approvalHash = await writeContractAsync({
            address: tokenAddress as `0x${string}`,
            abi: ERC20_ABI,
            functionName: 'approve',
            args: [hootContractAddress as `0x${string}`, BigInt(amountWei)]
          });

          setApprovalTransaction(approvalHash);
          
          setCreationStep("Waiting for approval confirmation...");
          
        }
      }
      
      // Create quiz on-chain with bounty
      setCreationStep("Creating quiz with bounty on-chain...");
      const txHash = await createQuizOnChain(quizId, tokenAddress, bountyAmount, decimals);
      
      // Update backend with prize token, contract address, and transaction hash
      await supabase
        .from('quizzes')
        .update({ 
          prize_token: tokenAddress,
          prize_amount: parseFloat(bountyAmount),
          contract_address: hootContractAddress,
          contract_tx_hash: txHash
        })
        .eq('id', quizId);
      
      console.log("Quiz created on-chain with bounty:", {
        quizId,
        roomCode: createdRoomCode,
        txHash,
        amount: bountyAmount,
        currency: selectedCurrency,
        tokenAddress
      });
    
      
    } catch (error) {
      console.error("Error adding bounty to quiz:", error);
      setError(error instanceof Error ? error.message : "Failed to add bounty. Please try again.");
      setCreationStep("");
    }
  };

  useEffect(() => {
    if (quizTransaction) {
      setShowQuizOptions(false);
        setShowShareBox(true);
        setCreationStep("");
      }
  }, [quizTransaction]);


 


  // Step 1: Create quiz in backend and generate room
  const handleSaveQuiz = async (): Promise<{ quizId: string; roomCode: string } | null> => {
    if (isCreating) return null;
    
    setIsCreating(true);
    setError("");
    setCreationStep("Saving quiz...");
    
    try {
      // Save current question if it has content
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
        return null;
      }
      
      // Prepare quiz data
      const quiz = {
        id: `quiz-${Date.now()}`,
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
      // Get user FID from Farcaster context
      const context = await sdk.context;
      const userFid = context?.user?.fid;
      
      if (!userFid) {
        setError("Please open this app in Farcaster to create a quiz");
        setIsCreating(false);
        return null;
      }
      
      if (!address) {
        setError("Please connect your wallet to create a quiz");
        setIsCreating(false);
        return null;
      }
      
      // Create quiz in backend (no contract info yet)
      const backendQuizId = await createQuizOnBackend(
        quiz,
        undefined, // Contract address (will be set later if bounty is added)
        chain?.id, // network id
        userFid.toString(), // user fid
        address, // user address
        0, // prize amount (will be updated later for bounty quizzes)
        undefined // prize token (will be updated later for bounty quizzes)
      );
      
      console.log("Quiz saved to backend with ID:", backendQuizId);
      
      // Start game session and join as creator
      setCreationStep("Creating room...");
      const generatedRoomCode = await startGame(backendQuizId);
      
      // Auto-join as the creator
      const creatorPlayerId = await joinGameContext("Creator", address, generatedRoomCode);
      
      // Update game session with creator in one call
        await supabase
          .from('game_sessions')
          .update({ creator_session_id: creatorPlayerId })
        .eq('room_code', generatedRoomCode);
      
      // Store creator ID in localStorage
      localStorage.setItem("quizPlayerId", creatorPlayerId);
      
      // Store room code
      setCreatedRoomCode(generatedRoomCode);
      setIsCreating(false);
      setCreationStep("");
      
      return { quizId: backendQuizId, roomCode: generatedRoomCode };
      
    } catch (err) {
      console.error("Error creating quiz:", err);
      const errorMessage = err instanceof Error ? err.message : "Failed to create quiz. Please try again.";
      setError(errorMessage);
      setIsCreating(false);
      setCreationStep("");
      return null;
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
      
      {/* Logo centered */}
      <div className="absolute top-0.1 left-1/2 transform -translate-x-1/2 z-20">
        <img 
          src="/Logo.png" 
          alt="Hoot Logo" 
          className="h-28 w-auto cursor-pointer hover:opacity-80 transition-opacity"
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
            
            {/* {showNetworkSwitcher && (
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
              {/* </div> */}
            {/* )}  */}
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
          <div className="w-full max-w-md mb-3 bg-purple-500/20 border border-purple-500 rounded-lg p-3 text-center text-purple-200">
            {creationStep}
          </div>
        )}

        {/* Top navigation */}
        <div className="w-full max-w-md flex justify-center items-center mb-1 relative">
          <input
            type="text"
            value={quizTitle}
            onChange={(e) => setQuizTitle(e.target.value)}
            onFocus={(e) => e.target.select()}
            placeholder="Quiz Title"
            maxLength={MAX_QUIZ_TITLE_LENGTH}
            className="px-4 py-2 mb-3 text- rounded bg-black text-white border border-white w-full"
          />
          {/* Character counter for quiz title - only show when limit reached */}
          {quizTitle.length >= MAX_QUIZ_TITLE_LENGTH && (
            <div className="absolute bottom-0 right-2 text-xs text-red-400 bg-red-900/50 px-1 rounded">
              {quizTitle.length}/{MAX_QUIZ_TITLE_LENGTH}
            </div>
          )}
        </div>
        
        {/* Question input */}
        <div className="w-full max-w-md mb-6">
          <div className="bg-white rounded p-3 h-24 relative">
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
              maxLength={MAX_QUESTION_LENGTH}
              className="quiz-input question-text w-full h-full bg-transparent text-center resize-none focus:outline-none absolute inset-0 flex items-center justify-center text-sm"
              style={{ 
                display: 'flex', 
                marginTop: '16px',
                alignItems: 'center', 
                justifyContent: 'center',
                padding: '1rem'
              }}
            />
            {/* Character counter for question - only show when limit reached */}
            {currentQuestion.text.length >= MAX_QUESTION_LENGTH && (
              <div className="absolute bottom-1 right-1 text-xs text-red-500 bg-red-100 px-1 rounded">
                {currentQuestion.text.length}/{MAX_QUESTION_LENGTH}
              </div>
            )}
          </div>
        </div>
        
        {/* Answer options */}
        <div className="w-full max-w-md flex flex-col gap-4 mb-8">
          {currentQuestion.options.map((option, index) => {
            const colors = ["#0DCEFB", "#53DB1E", "#FDCC0E", "#F70000"];
            const isCorrect = currentQuestion.correctAnswer === index;
            return (
              <div 
                key={index}
                className={`${option.color} rounded p-4 text-white relative border-2 transition-all duration-200 cursor-pointer select-none`}
                style={{ 
                  backgroundColor: `${colors[index]}40`,
                  borderColor: colors[index],
                  borderWidth: isCorrect ? '3px' : '2px',
                  boxShadow: isCorrect ? `0 0 0 3px ${colors[index]}30` : 'none',
                  transform: isCorrect ? 'scale(1.02)' : 'scale(1)'
                }}
                onClick={() => handleCorrectAnswerChange(index)}
              >
                {/* Indicatore di risposta corretta - molto più grande e visibile */}
                <div 
                  className="absolute -top-2 -right-2 w-10 h-10 rounded-full flex items-center justify-center transition-all duration-200 z-10 shadow-lg"
                  style={{ 
                    backgroundColor: isCorrect ? '#10B981' : 'rgba(255, 255, 255, 0.2)',
                    border: '3px solid white'
                  }}
                >
                  {isCorrect ? (
                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <div className="w-4 h-4 rounded-full bg-white opacity-50"></div>
                  )}
                </div>
                
                
                <div className="relative">
                  <input
                    type="text"
                    value={option.text}
                    onChange={(e) => handleOptionChange(index, e.target.value)}
                    placeholder={`add reply ${index + 1}`}
                    maxLength={MAX_ANSWER_LENGTH}
                    className="quiz-input w-full bg-transparent focus:outline-none pr-12"
                    onClick={(e) => e.stopPropagation()}
                  />
                  {/* Character counter for answer - only show when limit reached */}
                  {option.text.length >= MAX_ANSWER_LENGTH && (
                    <div className="absolute bottom-0 right-12 text-xs text-red-300 bg-red-900/50 px-1 rounded">
                      {option.text.length}/{MAX_ANSWER_LENGTH}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        
        {/* Question navigation */}
        <div className="w-full max-w-md relative">
          {/* Container with horizontal scroll */}
          <div className="flex items-center space-x-4 pb-2 overflow-x-auto px-2 scrollbar-hide" 
               style={{ 
                 scrollBehavior: 'smooth',
                 scrollPaddingLeft: '50%',
                 scrollPaddingRight: '50%'
               }}>
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
            
            {/* Add question button - always visible on the right */}
            <div className="flex flex-col items-center relative flex-shrink-0">
              <button 
                className="bg-black border border-white/30 rounded px-4 py-2 text-2xl hover:border-white transition-colors"
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
        </div>
        
        {/* Action buttons */}
        <div className="mt-6 flex flex-col gap-4 w-full max-w-md">
          {isAuthLoading ? (
            // Show loading state while checking authentication
            <button
              disabled
              className="px-8 py-4 rounded text-white font-bold opacity-50 cursor-not-allowed"
              style={{
                backgroundColor: "#666"
              }}
            >
              Loading...
            </button>
          ) : loggedUser?.isAuthenticated && loggedUser?.session ? (
            // User is authenticated - show Create Quiz button
            <button
              onClick={() => setShowQuizOptions(true)}
              disabled={isCreating}
              className="px-8 py-4 rounded text-white font-bold disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                backgroundColor: isCreating ? "#666" : "#795AFF"
              }}
            >
              {isCreating ? 'Creating...' : 'Create Quiz'}
            </button>
          ) : (
            // User is not authenticated - show Connect Wallet button
            <button
              onClick={triggerAuth}
              className="px-8 py-4 rounded text-white font-bold"
              style={{
                backgroundColor: "#795AFF"
              }}
            >
              Connect Wallet to Create Quiz
            </button>
          )}
          
          {/* AI Agent button */}
          
        </div>
      </div>
      
      {/* Quiz Options Modal */}
      {showQuizOptions && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end justify-center z-50">
          <div className="bg-black border border-white rounded-t-lg p-6 w-full max-w-md mx-4 mb-0 relative">
            {/* X button to close modal */}
            <button
              onClick={() => setShowQuizOptions(false)}
              className="absolute top-4 right-4 text-white hover:text-gray-300 transition-colors z-10"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <div className="text-center mb-6">
              <h3 className="text-white text-lg font-semibold mb-2">
                Choose Quiz Type
              </h3>
              <p className="text-gray-300 text-sm">
                How would you like to create your quiz?
              </p>
            </div>
            
            <div className="space-y-4">
              {/* Free Quiz Option */}
              <button
                onClick={handleFreeQuiz}
                className="w-full p-4 bg-purple-600/20 border border-gray-600 rounded-lg text-white hover:bg-purple-700 transition-colors"
              >
                <div className="text-left">
                  <div className="font-semibold text-lg">Free Quiz</div>
                  <div className="text-sm text-gray-300">Create quiz without bounty</div>
                </div>
              </button>
              
              {/* Quiz Bounty Option with Input */}
              <div className="bg-purple-600/20 rounded-lg p-4">
                <button
                  onClick={handleBountyQuiz}
                  className="w-full p-3 bg-purple-600/40 border border-purple-500 rounded-lg text-white hover:bg-purple-700 transition-colors mb-3"
                >
                  <div className="text-left">
                    <div className="font-semibold">Quiz with Bounty</div>
                    <div className="text-sm text-purple-200">Add bounty from your wallet</div>
                  </div>
                </button>
                
                {/* Network Switcher */}
                <div className="p-3 bg-purple-600/20 rounded-lg mb-3">
                  <button
                    onClick={() => {
                      const newNetworkid = chain?.id === 84532 ? 8453 : 84532;
                      console.log('newNetworkid', newNetworkid);
                      switchChain({ chainId: newNetworkid })
                    }}
                    className="w-full flex items-center justify-between p-2 bg-gray-600 hover:bg-gray-500 rounded text-white transition-colors"
                  >
                    <div className="flex items-center space-x-2">
                      <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                      <span className="text-sm font-medium">
                        {chain?.id === 84532 ? 'Base Sepolia' : 
                         chain?.id === 8453 ? 'Base Mainnet' : 
                         'Base Sepolia'}
                      </span>
                    </div>
                    <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                    </svg>
                  </button>
                </div>
                
                {/* Currency Selector - temp commented*/}
                <div className="p-3 bg-purple-600/20 rounded-lg mb-3">
                  <label className="block text-white text-sm font-medium mb-2">
                    Bounty Currency
                  </label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setSelectedCurrency('usdc')}
                      className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                        selectedCurrency === 'usdc'
                          ? 'bg-purple-600/40 text-white'
                          : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      }`}
                    >
                      USDC
                    </button>
                    <button
                      onClick={() => setSelectedCurrency('eth')}
                      className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                        selectedCurrency === 'eth'
                          ? 'bg-purple-600/40 text-white'
                          : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      }`}
                    >
                      ETH
                    </button>
                    {/* temp commenting custom */}
                    {/* <button
                      onClick={() => setSelectedCurrency('custom')}
                      className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                        selectedCurrency === 'custom'
                          ? 'bg-purple-600/40 text-white'
                          : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      }`}
                    >
                      Custom
                    </button> */}
                  </div>
                </div>

                {/* Custom Token Address Input - Temporary disabled!*/}  
                {/* {selectedCurrency === 'custom' && (
                  <div className="p-3 bg-purple-600/20 rounded-lg mb-3">
                    <label className="block text-white text-sm font-medium mb-2">
                      Token Contract Address
                    </label>
                    <input
                      type="text"
                      value={customTokenAddress}
                      onChange={(e) => setCustomTokenAddress(e.target.value)}
                      placeholder="0x..."
                      maxLength={42}
                      className="w-full px-3 py-2 bg-gray-600 border border-gray-500 rounded text-white focus:outline-none focus:border-purple-500"
                    />
                    <div className="text-xs text-gray-400 mt-1">
                      Enter the ERC20 token contract address
                    </div>
                  </div>
                )} */}

                {/* Quiz Bounty Amount Input */}
                <div className="p-3 bg-purple-600/20 rounded-lg">
                  <label className="block text-white text-sm font-medium mb-2">
                    Quiz Bounty ({selectedCurrency === 'usdc' ? 'USDC' : selectedCurrency === 'eth' ? 'ETH' : 'Tokens'})
                  </label>
                  <input
                    type="number"
                    step="1"
                    min="0"
                    value={bountyAmount}
                    onChange={(e) => setBountyAmount(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-600 border border-gray-500 rounded text-white focus:outline-none focus:border-purple-500"
                    placeholder={selectedCurrency === 'usdc' ? '10' : selectedCurrency === 'eth' ? '0.001' : '100'}
                  />
                  <div className="text-xs text-gray-400 mt-1">
                    Current balance: {parseFloat(displayBalance).toFixed(selectedCurrency === 'eth' ? 4 : 2)} {selectedCurrency === 'usdc' ? 'USDC' : selectedCurrency === 'eth' ? 'ETH' : 'Tokens'}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

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