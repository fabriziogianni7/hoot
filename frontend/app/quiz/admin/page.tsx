"use client";

import { useState, useEffect, useRef, Suspense, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuiz } from "@/lib/quiz-context";
import { useSupabase } from "@/lib/supabase-context";
import { callEdgeFunction } from "@/lib/supabase-client";
import {
  useAccount,
  useSwitchChain,
  usePublicClient,
  useWriteContract,
  useSendTransaction,
  useBalance,
  useReadContract,
} from "wagmi";
import {
  HOOT_QUIZ_MANAGER_ABI,
  ZERO_ADDRESS,
  ERC20_ABI,
} from "@/lib/contracts";
import { NETWORK_TOKENS, getDefaultTokenForNetwork } from "@/lib/token-config";
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

enum CreationStep {
  NONE = "",
  SAVING_QUIZ = "Saving quiz...",
  CREATING_ROOM = "Creating room...",
  PREPARING_BOUNTY = "Preparing bounty...",
  CHECKING_ALLOWANCE = "Checking token allowance...",
  REQUESTING_APPROVAL = "Requesting token approval...",
  WAITING_APPROVAL = "Waiting for approval confirmation...",
  CREATING_ON_CHAIN = "Creating quiz with bounty on-chain...",
}

function AdminPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const {
    startGame,
    createQuizOnBackend,
    joinGame: joinGameContext,
  } = useQuiz();
  const {
    address,
    isConnected: _isConnected,
    chain,
    status: _status,
    connector: _connector,
  } = useAccount();
  const { chains: _chains, switchChain } = useSwitchChain();
  const publicClient = usePublicClient();
  const { supabase } = useSupabase();
  const { data: ethBalance } = useBalance({ address });
  const { loggedUser, isAuthLoading, authError, triggerAuth, signatureModal } = useAuth();

  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [quizTitle, setQuizTitle] = useState("Name your Quiz");
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState("");
  const [showShareBox, setShowShareBox] = useState(false);
  const [createdRoomCode, setCreatedRoomCode] = useState<string>("");
  const [addQuestionError, setAddQuestionError] = useState<string>("");
  const [showTooltip, setShowTooltip] = useState(false);
  const [showQuizOptions, setShowQuizOptions] = useState(false);
  const [bountyAmount, setBountyAmount] = useState("10");
  const [selectedCurrency, setSelectedCurrency] = useState<string>("usdc");
  const [quizTransaction, setQuizTransaction] = useState<string>("");
  const [createdQuizId, setCreatedQuizId] = useState<string | null>(null);
  const [scheduledStartTime, setScheduledStartTime] = useState<string>("");
  const [isScheduled, setIsScheduled] = useState(false);
  const [isPrivate, setIsPrivate] = useState(false);

  // Get available tokens for current network
  const availableTokens = NETWORK_TOKENS[chain?.id || 8453] || []
  const selectedToken = availableTokens.find(token => token.id === selectedCurrency)
  const [_approvalTransaction, setApprovalTransaction] = useState<string>("");
  const [hootContractAddress, setHootContractAddress] = useState<string>("");
  const [creationStep, setCreationStep] = useState<CreationStep>(CreationStep.NONE);
  const [hasMyQuizzes, setHasMyQuizzes] = useState(false);
  const [isCheckingMyQuizzes, setIsCheckingMyQuizzes] = useState(false);
  const [loadedFromReuseId, setLoadedFromReuseId] = useState<string | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const addButtonRef = useRef<HTMLButtonElement | null>(null);

  // Badge state for showing user handle (same behavior as Home page)
  const [badgeText, setBadgeText] = useState<{
    primary: string;
    secondary: string | null;
    statusColor?: string;
  }>({
    primary: "Connecting...",
    secondary: null,
    statusColor: "#fbbf24",
  });

  // Wagmi hooks for transactions
  const {
    writeContractAsync,
    isPending: _isWritePending,
    error: writeError,
  } = useWriteContract();

  const { isPending: _isSendPending, error: sendError } = useSendTransaction();

  // Handle loading state
  useEffect(() => {
    if (isAuthLoading) {
      setBadgeText({
        primary: "Connecting...",
        secondary: null,
        statusColor: "#fbbf24",
      });
    }
  }, [isAuthLoading]);

  // Handle error state
  useEffect(() => {
    if (authError && !isAuthLoading) {
      setBadgeText({
        primary: "Not Connected",
        secondary: null,
        statusColor: "#ef4444",
      });
    }
  }, [authError, isAuthLoading]);

  // Handle authenticated user data
  useEffect(() => {
    if (loggedUser?.isAuthenticated) {
      let primary = "Connected";
      let secondary: string | null = null;
      let statusColor = "#4ade80";

      if (loggedUser.session?.user?.user_metadata?.display_name) {
        primary = loggedUser.session.user.user_metadata.display_name;
      }

      if (loggedUser.fid || loggedUser.session?.user?.user_metadata?.fid) {
        secondary = "Farcaster";
      }

      if (loggedUser.address) {
        const walletInfo = `${loggedUser.address.slice(0, 6)}...${loggedUser.address.slice(-4)}`;
        secondary = secondary ? `${secondary} • ${walletInfo}` : walletInfo;
      } else if (!secondary) {
        secondary = "No wallet connected";
        statusColor = "#ef4444";
      }

      setBadgeText({ primary, secondary: secondary || null, statusColor });
    }
  }, [loggedUser]);

  useEffect(() => {
    // Get contract address based on chain ID
    // Base mainnet: 8453
    // Base Sepolia: 84532
    // Local Anvil: 31337
    let hootAddress: `0x${string}`
    
    if (chain?.id === 8453) {
      // Base mainnet
      hootAddress = `0xe210C6Ae4a88327Aad8cd52Cb08cAAa90D8b0f27` as `0x${string}`
    } else if (chain?.id === 84532) {
      // Base Sepolia
      hootAddress = `0x2dC5532610Fe67A185bC9199a2d5975a130ec7f8` as `0x${string}`
    } else if (chain?.id === 31337) {
      // Local Anvil
      hootAddress = `0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0` as `0x${string}`
    } else {
      // Fallback: try to get from env config or default to Base Sepolia
      console.warn(`Unknown chain ID: ${chain?.id}, defaulting to Base Sepolia contract`)
      hootAddress = `0x2dC5532610Fe67A185bC9199a2d5975a130ec7f8` as `0x${string}`
    }
    
    console.log(`Setting contract address for chain ${chain?.id}: ${hootAddress}`)
    setHootContractAddress(hootAddress);
  }, [chain]);

  // Set default token when network changes
  useEffect(() => {
    if (chain?.id) {
      const defaultToken = getDefaultTokenForNetwork(chain.id);
      if (defaultToken) {
        setSelectedCurrency(defaultToken.id);
      }
    }
  }, [chain?.id]);

  // Check if the current user has previously created quizzes
  useEffect(() => {
    let cancelled = false;
    const checkMyQuizzes = async () => {
      try {
        setIsCheckingMyQuizzes(true);
        if (!supabase) return;
        const inMini = await sdk.isInMiniApp();
        if (inMini) {
          const ctx = await sdk.context;
          const fid = loggedUser?.fid ?? ctx?.user?.fid;
          if (!fid) {
            if (!cancelled) setHasMyQuizzes(false);
            return;
          }
          const { count } = await supabase
            .from("quizzes")
            .select("id", { count: "exact", head: true })
            .eq("user_fid", String(fid));
          if (!cancelled) setHasMyQuizzes((count ?? 0) > 0);
        } else if (address) {
          const { count } = await supabase
            .from("quizzes")
            .select("id", { count: "exact", head: true })
            .eq("creator_address", address);
          if (!cancelled) setHasMyQuizzes((count ?? 0) > 0);
        } else {
          if (!cancelled) setHasMyQuizzes(false);
        }
      } catch (e) {
        console.error("Error checking user quizzes:", e);
      } finally {
        if (!cancelled) setIsCheckingMyQuizzes(false);
      }
    };
    checkMyQuizzes();
    return () => {
      cancelled = true;
    };
  }, [supabase, address, loggedUser?.fid]);

  // Load AI-generated quiz if query param is present
  useEffect(() => {
    const aiQuizData = searchParams?.get('aiQuiz');
    if (aiQuizData && !loadedFromReuseId) {
      try {
        const decoded = JSON.parse(decodeURIComponent(aiQuizData));
        console.log('AI Quiz Data Received:', decoded);
        
        if (decoded.title && decoded.questions) {
          setQuizTitle(decoded.title || 'Name your Quiz');
          
          const normalizedQuestions: QuizQuestion[] = decoded.questions.map((q: {
            question_text: string;
            options: string[];
            correct_answer_index: number;
            time_limit: number;
          }) => {
            console.log('Processing question:', {
              question_text: q.question_text,
              options: q.options,
              correct_answer_index: q.correct_answer_index,
            });
            
            return {
              text: q.question_text,
              options: q.options.map((option: string) => ({
                text: option,
                color: 'hover:opacity-80',
              })),
              correctAnswer: q.correct_answer_index,
            };
          });
          
          console.log('Normalized Questions:', normalizedQuestions);
          setQuestions(normalizedQuestions);
          setCurrentQuestionIndex(0);
          setLoadedFromReuseId('ai-generated'); // Mark as loaded to prevent re-loading
        }
      } catch (e) {
        console.error('Failed to load AI quiz data:', e);
      }
    }
  }, [searchParams, loadedFromReuseId]);

  // Load quiz for reuse if query param is present
  useEffect(() => {
    const reuseId = searchParams?.get('reuse');
    if (!reuseId || !supabase) return;
    if (loadedFromReuseId === reuseId) return;

    const loadForReuse = async () => {
      try {
        const { data: quizRow, error: quizErr } = await supabase
          .from('quizzes')
          .select('*')
          .eq('id', reuseId)
          .single();
        if (quizErr || !quizRow) return;

        const { data: qsRows } = await supabase
          .from('questions')
          .select('*')
          .eq('quiz_id', reuseId)
          .order('order_index', { ascending: true });

        // Normalize to editor format
        const normalized = (qsRows || []).map((qr: any) => {
          const optionTexts: string[] = Array.isArray(qr.options) ? qr.options : [];
          const four = [...optionTexts.slice(0, 4)];
          while (four.length < 4) four.push('');
          return {
            text: qr.question_text || '',
            options: four.map((t) => ({ text: t || '', color: 'hover:opacity-80' })),
            correctAnswer: typeof qr.correct_answer_index === 'number' ? qr.correct_answer_index : 0,
          } as QuizQuestion;
        });

        setQuizTitle(quizRow.title || 'Name your Quiz');
        setQuestions(normalized);
        setCurrentQuestionIndex(0);
        setLoadedFromReuseId(reuseId);
      } catch (e) {
        console.error('Failed to load quiz for reuse:', e);
      }
    };
    loadForReuse();
  }, [searchParams, supabase, loadedFromReuseId]);

  // Determine ERC20 token address based on selected token
  const getTokenAddress = (): `0x${string}` | undefined => {
    if (!selectedToken) return undefined
    return selectedToken.address
  };

  const tokenAddress = getTokenAddress();

  // Read ERC20 token balance
  const { data: erc20Balance, refetch: refetchErc20Balance } = useReadContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: {
      enabled: !!address && !!tokenAddress && !selectedToken?.isNative,
    },
  });

  // Read ERC20 token decimals (fallback to config decimals)
  const { data: tokenDecimals } = useReadContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: "decimals",
    query: {
      enabled: !!tokenAddress && !selectedToken?.isNative,
    },
  });

  // Create quiz on-chain using wagmi
  const createQuizOnChain = async (
    quizId: string,
    tokenAddress: string,
    amount: string,
    decimals?: number
  ) => {
    const isETH = tokenAddress === ZERO_ADDRESS;
    const tokenDecimals = selectedToken?.decimals || decimals || 18;

    // Parse amount based on token type
    const amountWei = isETH ? parseEther(amount) : parseUnits(amount, tokenDecimals);

    console.log("Creating quiz on-chain:", {
      hootContractAddress,
      quizId,
      tokenAddress,
      amount,
      decimals,
      amountWei: amountWei.toString(),
      isETH,
    });

    const txHash = await writeContractAsync({
      address: hootContractAddress as `0x${string}`,
      abi: HOOT_QUIZ_MANAGER_ABI,
      functionName: "createQuiz",
      args: [quizId, tokenAddress as `0x${string}`, amountWei],
      value: isETH ? amountWei : BigInt(0),
    });
    setQuizTransaction(txHash);
    console.log("Quiz created on-chain, tx hash:", txHash);
    return txHash;
  };

  const [currentQuestion, setCurrentQuestion] = useState<QuizQuestion>({
    text: "",
    options: [
      { text: "", color: "hover:opacity-80" },
      { text: "", color: "hover:opacity-80" },
      { text: "", color: "hover:opacity-80" },
      { text: "", color: "hover:opacity-80" },
    ],
    correctAnswer: 0,
  });

  // Compute display balance based on selected token
  const displayBalance: string = (() => {
    if (selectedToken?.isNative && ethBalance) {
      return ethBalance.formatted;
    } else if (
      selectedToken && !selectedToken.isNative &&
      erc20Balance !== undefined &&
      (tokenDecimals !== undefined || selectedToken.decimals)
    ) {
      // Format ERC20 balance using token decimals (from contract or config)
      const decimals = tokenDecimals || selectedToken.decimals;
      const formattedBalance = (
        Number(erc20Balance) / Math.pow(10, decimals)
      ).toString();
      return formattedBalance;
    }
    return "0";
  })();

  // Refetch ERC20 balance when token or chain changes
  useEffect(() => {
    if (
      selectedToken && !selectedToken.isNative &&
      refetchErc20Balance
    ) {
      refetchErc20Balance();
    }
  }, [selectedToken?.id, chain?.id, refetchErc20Balance]);

  // Update default amount when token changes
  useEffect(() => {
    if (selectedToken?.id === "usdc") {
      setBountyAmount("10");
    } else if (selectedToken?.isNative) {
      setBountyAmount("0.001");
    } else {
      setBountyAmount("100");
    }
  }, [selectedToken]);

  // Effetto per caricare la domanda corrente quando cambia l'indice
  useEffect(() => {
    if (currentQuestionIndex < questions.length) {
      // Stiamo modificando una domanda esistente
      const question = questions[currentQuestionIndex];
      console.log('Loading question at index', currentQuestionIndex, ':', {
        text: question.text,
        options: question.options.map(opt => opt.text),
        correctAnswer: question.correctAnswer,
      });
      setCurrentQuestion(question);
    } else {
      // Stiamo creando una nuova domanda
      setCurrentQuestion({
        text: "",
        options: [
          { text: "", color: "hover:opacity-80" },
          { text: "", color: "hover:opacity-80" },
          { text: "", color: "hover:opacity-80" },
          { text: "", color: "hover:opacity-80" },
        ],
        correctAnswer: 0,
      });
    }
  }, [currentQuestionIndex, questions]);

  // Auto-scroll to current question when it changes
  useEffect(() => {
    const scrollContainer = scrollContainerRef.current || document.querySelector('.overflow-x-auto');
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

  // Keep the "+" button visible when questions grow
  useEffect(() => {
    if (addButtonRef.current) {
      addButtonRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'end' });
    } else if (scrollContainerRef.current) {
      const el = scrollContainerRef.current;
      el.scrollTo({ left: el.scrollWidth, behavior: 'smooth' });
    }
  }, [questions.length]);

  const handleOptionChange = (index: number, value: string) => {
    const newOptions = [...currentQuestion.options];
    newOptions[index] = { ...newOptions[index], text: value };
    setCurrentQuestion({ ...currentQuestion, options: newOptions });
    // Pulisci l'errore quando l'utente modifica le opzioni
    setAddQuestionError("");
    // Nascondi il tooltip se la domanda è ora completa
    const filledOptions = newOptions.filter((opt) => opt.text.trim() !== "");
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
    const filledOptions = currentQuestion.options.filter(
      (opt) => opt.text.trim() !== ""
    );
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
    setCurrentQuestionIndex(
      questions.length + (currentQuestion.text.trim() !== "" ? 1 : 0)
    );
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
            { text: "", color: "hover:opacity-80" },
          ],
          correctAnswer: 0,
        });
      }
    } else if (currentQuestionIndex > index) {
      // Se la domanda eliminata era prima di quella corrente, decrementa l'indice
      setCurrentQuestionIndex(currentQuestionIndex - 1);
    }
  };

  const minScheduledTime = useMemo(() => {
    const date = new Date(Date.now() + 60_000);
    const offset = date.getTimezoneOffset();
    const local = new Date(date.getTime() - offset * 60_000);
    return local.toISOString().slice(0, 16);
  }, []);

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

      // First, ensure the quiz and game session exist (idempotent)
      let quizId: string;
      let roomCode: string;

      if (createdQuizId && createdRoomCode) {
        quizId = createdQuizId;
        roomCode = createdRoomCode;
        console.log("Reusing existing quiz and room for bounty:", {
          quizId,
          roomCode,
        });
      } else {
        const result = await handleSaveQuiz();

        if (!result) {
          setError("Failed to create quiz. Please try again.");
          return;
        }

        quizId = result.quizId;
        roomCode = result.roomCode;
        setCreatedQuizId(quizId);
        setCreatedRoomCode(roomCode);
      }
      setCreationStep(CreationStep.PREPARING_BOUNTY);

      // Validate bounty amount
      const bountyAmountNum = parseFloat(bountyAmount);
      if (isNaN(bountyAmountNum) || bountyAmountNum <= 0) {
        setError("Invalid bounty amount");
        setCreationStep(CreationStep.NONE);
        return;
      }

      // Determine token address and decimals
      let tokenAddress: string;
      let decimals: number;

      if (selectedToken?.isNative) {
        tokenAddress = ZERO_ADDRESS;
        decimals = 18;

        // Check ETH balance
        if (ethBalance && parseFloat(ethBalance.formatted) < bountyAmountNum) {
          setError(
            `Insufficient ${selectedToken.symbol} balance. You have ${ethBalance.formatted} ${selectedToken.symbol} but need ${bountyAmount} ${selectedToken.symbol}`
          );
          setCreationStep(CreationStep.NONE);
          return;
        }
      } else if (selectedToken) {
        tokenAddress = selectedToken.address;
        decimals = tokenDecimals ? Number(tokenDecimals) : selectedToken.decimals;

        // Check token balance
        const tokenBalanceNum = parseFloat(displayBalance);
        if (tokenBalanceNum < bountyAmountNum) {
          setError(
            `Insufficient ${selectedToken.symbol} balance. You have ${displayBalance} ${selectedToken.symbol} but need ${bountyAmount} ${selectedToken.symbol}`
          );
          setCreationStep(CreationStep.NONE);
          return;
        }
      } else {
        setError("Invalid token selection");
        setCreationStep(CreationStep.NONE);
        return;
      }

      // For ERC20 tokens, approve the contract first
        if (tokenAddress !== ZERO_ADDRESS) {
          const amountWei = parseUnits(bountyAmount, decimals);

          setCreationStep(CreationStep.CHECKING_ALLOWANCE);

        const currentAllowance = (await publicClient?.readContract({
          address: tokenAddress as `0x${string}`,
          abi: ERC20_ABI,
          functionName: "allowance",
          args: [address, hootContractAddress as `0x${string}`],
        })) as bigint | undefined;

        // If allowance is insufficient, request approval
        if (!currentAllowance || currentAllowance < amountWei) {
          setCreationStep(CreationStep.REQUESTING_APPROVAL);
          const approvalHash = await writeContractAsync({
            address: tokenAddress as `0x${string}`,
            abi: ERC20_ABI,
            functionName: "approve",
            args: [hootContractAddress as `0x${string}`, BigInt(amountWei)],
          });

          setApprovalTransaction(approvalHash);

          setCreationStep(CreationStep.WAITING_APPROVAL);
        }
      }

      // Create quiz on-chain with bounty
      setCreationStep(CreationStep.CREATING_ON_CHAIN);
      const txHash = await createQuizOnChain(
        quizId,
        tokenAddress,
        bountyAmount,
        decimals
      );

      // Update backend with prize token, contract address, and transaction hash
      // Use update-quiz edge function to trigger Telegram notification when bounty is added
      await callEdgeFunction("update-quiz", {
        quiz_id: quizId,
        prize_token: tokenAddress,
        prize_amount: parseFloat(bountyAmount),
        contract_address: hootContractAddress,
        contract_tx_hash: txHash,
      });

      console.log("Quiz created on-chain with bounty:", {
        quizId,
        roomCode: createdRoomCode,
        txHash,
        amount: bountyAmount,
        currency: selectedCurrency,
        tokenAddress,
      });
    } catch (error) {
      console.error("Error adding bounty to quiz:", error);
      setError(
        error instanceof Error
          ? error.message
          : "Failed to add bounty. Please try again."
      );
      setCreationStep(CreationStep.NONE);
    }
  };

  useEffect(() => {
    if (quizTransaction) {
      setShowQuizOptions(false);
      setShowShareBox(true);
      setCreationStep(CreationStep.NONE);
    }
  }, [quizTransaction]);

  // Step 1: Create quiz in backend and generate room
  const handleSaveQuiz = async (): Promise<{
    quizId: string;
    roomCode: string;
  } | null> => {
    if (isCreating) return null;

    setIsCreating(true);
    setError("");
    setCreationStep(CreationStep.SAVING_QUIZ);

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

      if (isScheduled && !scheduledStartTime) {
        setError("Please choose a scheduled start time or disable scheduling");
        setIsCreating(false);
        setCreationStep(CreationStep.NONE);
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
          options: q.options.map((opt) => opt.text),
          correctAnswer: q.correctAnswer,
          timeLimit: 15,
        })),
        createdAt: new Date(),
      };
      const userFid = (await (sdk.context))?.user?.fid;
      
      const scheduledStartIso =
        isScheduled && scheduledStartTime
          ? new Date(scheduledStartTime).toISOString()
          : undefined;

      console.log("Saving quiz", {
        title: quiz.title,
        questionCount: quiz.questions.length,
        isScheduled,
        scheduledStartIso,
      });

      // Create quiz in backend (no contract info yet) and initial game session
      const { quizId: backendQuizId, roomCode } = await createQuizOnBackend(
        quiz,
        undefined, // Contract address (will be set later if bounty is added)
        chain?.id, // network id
        userFid?.toString() || '', // user fid
        address, // user address
        0, // prize amount (will be updated later for bounty quizzes)
        undefined, // prize token (will be updated later for bounty quizzes)
        scheduledStartIso,
        isPrivate
      );

      console.log("Quiz saved to backend with ID:", backendQuizId, "and room code:", roomCode);
      if (scheduledStartIso) {
        console.log("Scheduling quiz start for", scheduledStartIso);
      }

      // Join existing game session as the creator
      setCreationStep(CreationStep.CREATING_ROOM);
      const creatorPlayerId = await joinGameContext(
        "Creator",
        address,
        roomCode
      );

      // Store creator ID in localStorage
      localStorage.setItem("playerSessionId", creatorPlayerId);

      // Store quiz and room info
      setCreatedQuizId(backendQuizId);
      setCreatedRoomCode(roomCode);
      setIsCreating(false);
      setCreationStep(CreationStep.NONE);

      return { quizId: backendQuizId, roomCode };
    } catch (err) {
      console.error("Error creating quiz:", err);
      const errorMessage =
        err instanceof Error
          ? err.message
          : "Failed to create quiz. Please try again.";
      setError(errorMessage);
      setIsCreating(false);
      setCreationStep(CreationStep.NONE);
      return null;
    }
  };

  // Calcola il numero della domanda corrente (per visualizzazione)
  const displayQuestionNumber = currentQuestionIndex + 1;

  // Ottieni un riassunto breve della domanda per i pulsanti (max 10 caratteri)
  const getQuestionSummary = (question: QuizQuestion) => {
    if (!question.text) return "";
    return question.text.length > 10
      ? question.text.substring(0, 10) + "..."
      : question.text;
  };

  return (
    <div className="min-h-screen w-full bg-black text-white relative overflow-hidden">
      {/* Background network effect */}
      <div
        className="absolute inset-0 z-0 opacity-40"
        style={{
          backgroundImage: "url('/network-bg.svg')",
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      />

      {/* User badge (handle) top-right - FIXED: aligned with logo */}
      <div
        style={{
          position: "absolute",
          top: "1.2rem",
          right: "1rem",
          zIndex: 30,
        }}
      >
        <button
          type="button"
          onClick={() => router.push('/quiz/admin/my-quizzes')}
          title="My Quizzes"
          onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.9")}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
          style={{
            backgroundColor: "#795AFF",
            color: "white",
            padding: "0.5rem 1rem",
            borderRadius: "0.5rem",
            fontSize: "0.875rem",
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            cursor: "pointer",
            border: "none",
            outline: "none",
          }}
        >
          <div
            style={{
              width: "8px",
              height: "8px",
              borderRadius: "50%",
              backgroundColor: badgeText.statusColor || "#4ade80",
            }}
          ></div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "0.125rem",
              flex: 1,
              alignItems: "center",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ opacity: 0.9 }}
                aria-hidden="true"
              >
                <path d="M3 10l9-7 9 7" />
                <path d="M5 10v10h6v-6h2v6h6V10" />
              </svg>
            </div>
            {(() => {
              const secondaryText = badgeText.primary !== "Connected" ? badgeText.primary : badgeText.secondary;
              return secondaryText && !secondaryText.includes("Farcaster") ? (
                <div style={{ fontSize: "0.75rem", opacity: 0.8, textAlign: "center" }}>{secondaryText}</div>
              ) : null;
            })()}
          </div>
          {/* small chevron icon to indicate clickability */}
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ opacity: 0.85 }}
            aria-hidden="true"
          >
            <path d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* Logo - centered vertically with badge */}
      <div className="absolute left-4 z-20 flex items-center" style={{ top: "1rem", height: "3.5rem" }}>
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
                setCurrentQuestion({
                  ...currentQuestion,
                  text: e.target.value,
                });
                // Pulisci l'errore quando l'utente modifica il testo della domanda
                setAddQuestionError("");
                // Nascondi il tooltip se la domanda è ora completa
                const filledOptions = currentQuestion.options.filter(
                  (opt) => opt.text.trim() !== ""
                );
                if (e.target.value.trim() !== "" && filledOptions.length >= 2) {
                  setShowTooltip(false);
                }
              }}
              placeholder="Enter your question here"
              maxLength={MAX_QUESTION_LENGTH}
              className="quiz-input question-text w-full h-full bg-transparent text-center resize-none focus:outline-none absolute inset-0 flex items-center justify-center text-sm font-bold text-black"
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
                  borderWidth: isCorrect ? "3px" : "2px",
                  boxShadow: isCorrect
                    ? `0 0 0 3px ${colors[index]}30`
                    : "none",
                  transform: isCorrect ? "scale(1.02)" : "scale(1)",
                }}
                onClick={() => handleCorrectAnswerChange(index)}
              >
                {/* Indicatore di risposta corretta - molto più grande e visibile */}
                <div
                  className="absolute -top-2 -right-2 w-10 h-10 rounded-full flex items-center justify-center transition-all duration-200 z-10 shadow-lg"
                  style={{
                    backgroundColor: isCorrect
                      ? "#10B981"
                      : "rgba(255, 255, 255, 0.2)",
                    border: "3px solid white",
                  }}
                >
                  {isCorrect ? (
                    <svg
                      className="w-6 h-6 text-white"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={3}
                        d="M5 13l4 4L19 7"
                      />
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
                    className="quiz-input w-full bg-transparent text-white placeholder:text-gray-300 focus:outline-none pr-12"
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
          <div ref={scrollContainerRef} className="flex items-center space-x-4 pb-2 overflow-x-auto px-2 scrollbar-hide" 
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
                ref={addButtonRef}
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
                backgroundColor: "#666",
              }}
            >
              Loading...
            </button>
          ) : loggedUser?.isAuthenticated && loggedUser?.session ? (
            // User is authenticated - show Create Quiz button
            <button
              onClick={() => {
                // Reset per-creation identifiers so each new quiz is fresh
                setCreatedQuizId(null);
                setCreatedRoomCode("");
                setShowQuizOptions(true);
              }}
              disabled={isCreating}
              className="px-8 py-4 rounded text-white font-bold disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                backgroundColor: isCreating ? "#666" : "#795AFF",
              }}
            >
              {isCreating ? "Creating..." : "Create Quiz"}
            </button>
          ) : (
            // User is not authenticated - show Connect Wallet button
            <button
              onClick={() => triggerAuth(8453)}
              className="px-8 py-4 rounded text-white font-bold"
              style={{
                backgroundColor: "#795AFF",
              }}
            >
              Connect To Hoot to Create Quiz
            </button>
          )}

          

          {/* AI Agent button */}
        </div>
      </div>

      {/* Quiz Options Modal */}
      {showQuizOptions && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-end justify-center z-50"
          onClick={(e) => {
            // Prevent closing modal during creation
            if (creationStep === CreationStep.NONE && e.target === e.currentTarget) {
              setShowQuizOptions(false);
            }
          }}
        >
          <div className="bg-black border border-white rounded-t-lg p-6 w-full max-w-md mx-4 mb-0 relative">
            {/* X button to close modal */}
            <button
              onClick={() => {
                // Prevent closing during creation
                if (creationStep === CreationStep.NONE) {
                  setShowQuizOptions(false);
                }
              }}
              disabled={creationStep !== CreationStep.NONE}
              className={`absolute top-4 right-4 transition-colors z-10 ${
                creationStep !== CreationStep.NONE
                  ? "text-gray-500 cursor-not-allowed"
                  : "text-white hover:text-gray-300"
              }`}
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
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

            {/* Creation status banner */}
            {creationStep && (
              <div className="mb-4 bg-purple-500/20 border border-purple-500 rounded-lg p-3 text-purple-200 flex items-center gap-3">
                <div className="h-5 w-5 border-2 border-purple-300 border-t-transparent rounded-full animate-spin" />
                <div className="flex-1">
                  <div className="text-sm font-medium">{creationStep}</div>
                  {(creationStep === CreationStep.REQUESTING_APPROVAL ||
                    creationStep === CreationStep.WAITING_APPROVAL ||
                    creationStep === CreationStep.CREATING_ON_CHAIN) && (
                    <div className="text-xs text-purple-100 mt-1">
                      Please confirm the transaction in your wallet. This might take a few seconds.
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Privacy configuration */}
            <div className="mb-4 bg-purple-600/10 border border-purple-500/40 rounded-lg p-4 text-sm text-white">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isPrivate}
                  onChange={(e) => setIsPrivate(e.target.checked)}
                  className="h-4 w-4 rounded border-white/40 bg-transparent mt-0.5"
                  disabled={creationStep !== CreationStep.NONE}
                />
                <div>
                  <span className="font-medium block">Make this quiz private</span>
                  <p className="text-gray-300 text-xs mt-1">
                    Private quizzes will not be shown on the home page banner. Only players with the room code can join.
                  </p>
                </div>
              </label>
            </div>

            {/* Scheduled start configuration */}
            <div className="mb-6 bg-purple-600/10 border border-purple-500/40 rounded-lg p-4 text-sm text-white">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isScheduled}
                  onChange={(e) => {
                    setIsScheduled(e.target.checked);
                    if (!e.target.checked) {
                      setScheduledStartTime("");
                    }
                  }}
                  className="h-4 w-4 rounded border-white/40 bg-transparent"
                  disabled={creationStep !== CreationStep.NONE}
                />
                <span className="font-medium">
                  Schedule this quiz to start automatically
                </span>
              </label>
              {isScheduled && (
                <div className="mt-3 space-y-2">
                  <input
                    type="datetime-local"
                    value={scheduledStartTime}
                    onChange={(e) => setScheduledStartTime(e.target.value)}
                    min={minScheduledTime}
                    className="w-full rounded-md bg-black/40 border border-white/30 px-3 py-2 text-white focus:outline-none focus:border-white"
                    disabled={creationStep !== CreationStep.NONE}
                  />
                  <p className="text-gray-300 text-xs">
                    Times are shown in your local timezone. The quiz will move to
                    the lobby automatically and generate a room code.
                  </p>
                </div>
              )}
            </div>

            <div className="space-y-4">
              {/* Free Quiz Option */}
              <button
                onClick={handleFreeQuiz}
                disabled={creationStep !== CreationStep.NONE}
                className={`w-full p-4 bg-purple-600/20 border border-gray-600 rounded-lg text-white transition-colors ${
                  creationStep !== CreationStep.NONE
                    ? "opacity-50 cursor-not-allowed"
                    : "hover:bg-purple-700"
                }`}
              >
                <div className="text-left">
                  <div className="font-semibold text-lg">Free Quiz</div>
                  <div className="text-sm text-gray-300">
                    Create quiz without bounty
                  </div>
                </div>
              </button>

              {/* Quiz Bounty Option with Input */}
              <div className="bg-purple-600/20 rounded-lg p-4">
                <button
                  onClick={handleBountyQuiz}
                  disabled={creationStep !== CreationStep.NONE}
                  className={`w-full p-3 bg-purple-600/40 border border-purple-500 rounded-lg text-white transition-colors mb-3 ${
                    creationStep !== CreationStep.NONE
                      ? "opacity-50 cursor-not-allowed"
                      : "hover:bg-purple-700"
                  }`}
                >
                  <div className="text-left">
                    <div className="font-semibold">Quiz with Bounty</div>
                    <div className="text-sm text-purple-200">
                      Add bounty from your wallet
                    </div>
                  </div>
                </button>

                {/* Network Switcher */}
                <div className="p-3 bg-purple-600/20 rounded-lg mb-3">
                  <button
                    onClick={() => {
                      const newNetworkid = chain?.id === 84532 ? 8453 : 84532;
                      console.log("newNetworkid", newNetworkid);
                      switchChain({ chainId: newNetworkid });
                    }}
                    className="w-full flex items-center justify-between p-2 bg-gray-600 hover:bg-gray-500 rounded text-white transition-colors"
                  >
                    <div className="flex items-center space-x-2">
                      <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                      <span className="text-sm font-medium">
                        {chain?.id === 84532
                          ? "Base Sepolia"
                          : chain?.id === 8453
                          ? "Base Mainnet"
                          : "Base Sepolia"}
                      </span>
                    </div>
                    <svg
                      className="w-4 h-4 text-gray-400"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
                      />
                    </svg>
                  </button>
                </div>

                {/* Currency Selector */}
                <div className="p-3 bg-purple-600/20 rounded-lg mb-3">
                  <label className="block text-white text-sm font-medium mb-2">
                    Bounty Currency
                  </label>
                  <div className="flex gap-2 flex-wrap">
                    {availableTokens.map((token) => (
                      <button
                        key={token.id}
                        onClick={() => setSelectedCurrency(token.id)}
                        className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                          selectedCurrency === token.id
                            ? "bg-purple-600/40 text-white"
                            : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                        }`}
                      >
                        {token.symbol}
                      </button>
                    ))}
                  </div>
                </div>


                {/* Quiz Bounty Amount Input */}
                <div className="p-3 bg-purple-600/20 rounded-lg">
                  <label className="block text-white text-sm font-medium mb-2">
                    Quiz Bounty (
                    {selectedToken?.symbol || "Tokens"}
                    )
                  </label>
                  <input
                    type="number"
                    step="1"
                    min="0"
                    value={bountyAmount}
                    onChange={(e) => setBountyAmount(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-600 border border-gray-500 rounded text-white focus:outline-none focus:border-purple-500"
                    placeholder={
                      selectedToken?.id === "usdc"
                        ? "10"
                        : selectedToken?.isNative
                        ? "0.001"
                        : "100"
                    }
                  />
                  <div className="text-xs text-gray-400 mt-1">
                    Current balance:{" "}
                    {parseFloat(displayBalance).toFixed(
                      selectedToken?.isNative ? 4 : 2
                    )}{" "}
                    {selectedToken?.symbol || "Tokens"}
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
            router.push(`/quiz/lobby/${createdRoomCode}`);
          }}
          onGoToLobby={() => {
            setShowShareBox(false);
            router.push(`/quiz/lobby/${createdRoomCode}`);
          }}
        />
      )}

      {/* Signature confirmation modal */}
      {signatureModal}
    </div>
  );
}

// Wrap in Suspense to handle useSearchParams
export default function AdminPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen w-full bg-black text-white flex items-center justify-center">
        <div className="text-center">
          <div className="text-xl font-semibold mb-2">Loading...</div>
          <div className="text-gray-400">Please wait</div>
        </div>
      </div>
    }>
      <AdminPageContent />
    </Suspense>
  );
}