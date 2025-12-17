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
import Footer from "@/components/Footer";
import WalletModal from "@/components/WalletModal";
import { generateQuizViaAI } from "@/lib/supabase-client";
import type { GenerateQuizResponse } from "@/lib/backend-types";
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
  const [bountyAmount, setBountyAmount] = useState("10");
  const [bountyAmountSetFromStorage, setBountyAmountSetFromStorage] = useState(false);
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
  const [isRestoringFromStorage, setIsRestoringFromStorage] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const addButtonRef = useRef<HTMLButtonElement | null>(null);
  const [showQuickMenu, setShowQuickMenu] = useState(false);
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [pendingQuizCreation, setPendingQuizCreation] = useState<{ type: "free" | "bounty"; options: any } | null>(null);

  // Badge state for showing user handle (same behavior as Home page)
  const [badgeText, setBadgeText] = useState<{
    primary: string;
    secondary: string | null;
    statusColor?: string;
  }>({
    primary: "Connecting...",
    secondary: null,
    statusColor: "var(--color-warning)",
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
        statusColor: "var(--color-warning)",
      });
    }
  }, [isAuthLoading]);

  // Handle error state
  useEffect(() => {
    if (authError && !isAuthLoading) {
      setBadgeText({
        primary: "Not Connected",
        secondary: null,
        statusColor: "var(--color-error)",
      });
    }
  }, [authError, isAuthLoading]);

  // Handle authenticated user data
  useEffect(() => {
    if (loggedUser?.isAuthenticated) {
      // ← Add the isAuthenticated check
      let primary: string | null = null;
      let secondary: string | null = null;
      let statusColor = "var(--color-success)"; // Green for connected

      // Check if user is authenticated and has data
      if (loggedUser.session?.user?.user_metadata?.display_name) {
        primary = loggedUser.session.user.user_metadata.display_name;
      }

      // Add Farcaster badge if user has FID
      if (loggedUser.fid || loggedUser.session?.user?.user_metadata?.fid) {
        secondary = "Farcaster";
      }

      // Add wallet address as tertiary info
      if (loggedUser.address) {
        const walletInfo = `${loggedUser.address.slice(
          0,
          6
        )}...${loggedUser.address.slice(-4)}`;
        if (secondary) {
          secondary = `${secondary} • ${walletInfo}`;
        } else {
          secondary = walletInfo;
        }
      } else if (!secondary) {
        secondary = "No wallet connected";
        statusColor = "var(--color-error)"; // Red for not connected
      }

      setBadgeText({
        primary: primary,
        secondary: secondary || null,
        statusColor: statusColor,
      });
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

  // Restore quiz data when returning from create-quiz page (without creation)
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isRestoringFromStorage) return;
    
    const createType = searchParams?.get('create');
    const quizData = localStorage.getItem("quizDataBeforeCreation");
    
    // If we're returning from create-quiz page but not creating yet, restore quiz data
    if (!createType && quizData) {
      try {
        const { questions: savedQuestions, currentQuestion: savedCurrentQuestion, currentQuestionIndex: savedIndex, title: savedTitle } = JSON.parse(quizData);
        
        // Only restore if we don't have questions already
        if (questions.length === 0 && savedQuestions && savedQuestions.length > 0) {
          setQuestions(savedQuestions);
          setCurrentQuestionIndex(savedIndex || savedQuestions.length);
          if (savedTitle && savedTitle !== "Name your Quiz") {
            setQuizTitle(savedTitle);
          }
        }
        
        // Clean up after restoring
        localStorage.removeItem("quizDataBeforeCreation");
      } catch (e) {
        console.error('Failed to restore quiz data:', e);
        localStorage.removeItem("quizDataBeforeCreation");
      }
    }
  }, [searchParams, questions.length, isRestoringFromStorage]);

  // Handle quiz creation from create-quiz page
  useEffect(() => {
    if (typeof window === "undefined") return;
    
    const createType = searchParams?.get('create');
    if (!createType) return;
    
    const optionsData = localStorage.getItem("quizCreationOptions");
    if (!optionsData) return;
    
    // Restore quiz data before creating
    const quizData = localStorage.getItem("quizDataBeforeCreation");
    if (quizData) {
      try {
        const { questions: savedQuestions, currentQuestion: savedCurrentQuestion, currentQuestionIndex: savedIndex, title: savedTitle } = JSON.parse(quizData);
        
        if (savedQuestions && savedQuestions.length > 0) {
          setQuestions(savedQuestions);
          setCurrentQuestionIndex(savedIndex || savedQuestions.length);
          if (savedTitle && savedTitle !== "Name your Quiz") {
            setQuizTitle(savedTitle);
          }
        }
      } catch (e) {
        console.error('Failed to restore quiz data before creation:', e);
      }
    }
    
    try {
      const options = JSON.parse(optionsData);
      
      // Set pending creation
      setPendingQuizCreation({
        type: createType as "free" | "bounty",
        options,
      });
      
      // Set options from localStorage
      setIsPrivate(options.isPrivate || false);
      setIsScheduled(options.isScheduled || false);
      setScheduledStartTime(options.scheduledStartTime || "");
      
      if (createType === "bounty") {
        // Set bounty options
        if (options.bountyAmount) {
          setBountyAmount(options.bountyAmount);
          setBountyAmountSetFromStorage(true);
        } else {
          setBountyAmount("10");
        }
        setSelectedCurrency(options.selectedCurrency || "usdc");
      }
      
      // Clean up
      localStorage.removeItem("quizCreationOptions");
      localStorage.removeItem("quizDataBeforeCreation");
      // Remove query param to prevent re-triggering
      router.replace("/quiz/admin", { scroll: false });
    } catch (e) {
      console.error('Failed to parse quiz creation options:', e);
      localStorage.removeItem("quizCreationOptions");
      localStorage.removeItem("quizDataBeforeCreation");
    }
  }, [searchParams, router]);

  // Execute pending quiz creation
  useEffect(() => {
    if (!pendingQuizCreation || isCreating) return;
    
    // Use setTimeout to ensure all state updates are applied, including question restoration
    const timer = setTimeout(() => {
      // Double-check that we have questions before creating
      if (questions.length === 0) {
        console.error('Cannot create quiz: no questions available');
        setError("Please add at least one question");
        setPendingQuizCreation(null);
        return;
      }
      
      // Check if wallet is connected (required for quiz creation)
      if (!address || !chain?.id) {
        console.error('Cannot create quiz: wallet not connected', { address, chainId: chain?.id });
        setError("Please connect your wallet to create a quiz");
        setPendingQuizCreation(null);
        return;
      }
      
      if (pendingQuizCreation.type === "free") {
        handleFreeQuiz();
      } else if (pendingQuizCreation.type === "bounty") {
        // Pass the bounty amount directly from options to avoid race condition with state
        handleBountyQuiz(pendingQuizCreation.options.bountyAmount, pendingQuizCreation.options.selectedCurrency);
      }
      
      setPendingQuizCreation(null);
    }, 500); // Increased timeout to ensure wallet and questions are ready
    
    return () => clearTimeout(timer);
  }, [pendingQuizCreation, isCreating, questions.length, address, chain?.id]);

  // Restore existing questions when returning from AI generation page (without new questions)
  // or add new AI questions to existing ones
  // This must run FIRST before any other useEffect that might modify questions
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isRestoringFromStorage) return; // Prevent multiple restorations
    
    const aiQuizData = searchParams?.get('aiQuiz');
    const existingData = localStorage.getItem("existingQuizData");
    
    // If no data to restore, skip
    if (!existingData && !aiQuizData) return;
    
    if (aiQuizData && !loadedFromReuseId) {
      setIsRestoringFromStorage(true);
      // We have new AI questions
      try {
        const decoded = JSON.parse(decodeURIComponent(aiQuizData));
        console.log('AI Quiz Data Received:', decoded);
        
        if (decoded.title && decoded.questions) {
          const normalizedQuestions: QuizQuestion[] = decoded.questions.map((q: {
            question_text: string;
            options: string[];
            correct_answer_index: number;
            time_limit: number;
          }) => {
            return {
              text: q.question_text,
              options: q.options.map((option: string) => ({
                text: option,
                color: 'hover:opacity-80',
              })),
              correctAnswer: q.correct_answer_index,
            };
          });
          
          // Check if we have existing questions to preserve
          if (existingData) {
            try {
              const { questions: savedQuestions, currentQuestion: savedCurrentQuestion, currentQuestionIndex: savedIndex, title: savedTitle } = JSON.parse(existingData);
              
              // Prepare saved questions including current question if it was new
              let savedQuestionsList = savedQuestions && savedQuestions.length > 0 ? [...savedQuestions] : [];
              
              // If there's a current question that wasn't saved in questions, add it
              if (savedCurrentQuestion && savedIndex !== undefined && savedIndex >= savedQuestionsList.length) {
                const hasContent = savedCurrentQuestion.text.trim() !== "" || 
                  savedCurrentQuestion.options.some(opt => opt.text.trim() !== "");
                if (hasContent) {
                  savedQuestionsList.push(savedCurrentQuestion);
                }
              }
              
              console.log('Restoring with AI questions:', {
                savedCount: savedQuestionsList.length,
                aiCount: normalizedQuestions.length,
                savedQuestions: savedQuestionsList.map(q => q.text),
              });
              
              // Add new AI-generated questions to saved ones
              // Use saved questions as source of truth, then add AI questions
              const allQuestions = [...savedQuestionsList, ...normalizedQuestions];
              
              console.log('Setting all questions:', {
                total: allQuestions.length,
                questions: allQuestions.map(q => q.text),
              });
              
              // Force set questions - saved data is the source of truth
              // This will replace any existing questions in state
              // Use setTimeout to ensure this happens after other effects
              setTimeout(() => {
                setQuestions(allQuestions);
                
                // Set index to first new AI question
                const firstNewQuestionIndex = savedQuestionsList.length;
                setCurrentQuestionIndex(firstNewQuestionIndex);
                
                // Reset current question to empty for new editing
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
                
              // Update title: first restore saved title if it exists and is not default
              // Only use AI title if saved title is empty or still the default
              if (savedTitle && savedTitle !== "Name your Quiz" && savedTitle.trim() !== "") {
                // We have a valid saved title - keep it
                setQuizTitle(savedTitle);
              } else if (decoded.title && decoded.title !== "Name your Quiz") {
                // No valid saved title, use AI-generated title
                setQuizTitle(decoded.title);
              } else if (savedTitle) {
                // Fallback: restore saved title even if it's default
                setQuizTitle(savedTitle);
              }
                
                // Clear the stored data and reset flag AFTER setting questions
                if (existingData) {
                  localStorage.removeItem("existingQuizData");
                }
                setIsRestoringFromStorage(false);
              }, 0);
            } catch (e) {
              console.error('Failed to parse existing data:', e);
              // Fallback: just use new questions
              setTimeout(() => {
          setQuestions(normalizedQuestions);
          setCurrentQuestionIndex(0);
                // Only set AI title if current title is empty or still the default
                if (decoded.title && decoded.title !== "Name your Quiz") {
                  // Check current quizTitle state - only replace if it's empty or default
                  setQuizTitle((currentTitle) => {
                    if (!currentTitle || currentTitle === "Name your Quiz" || currentTitle.trim() === "") {
                      return decoded.title;
                    }
                    return currentTitle; // Keep existing title
                  });
                }
                setIsRestoringFromStorage(false);
              }, 0);
            }
          } else {
            // No existing questions - just use new ones
            setTimeout(() => {
              setQuestions(normalizedQuestions);
              setCurrentQuestionIndex(0);
              // Only set AI title if current title is empty or still the default
              if (decoded.title && decoded.title !== "Name your Quiz") {
                // Check current quizTitle state - only replace if it's empty or default
                setQuizTitle((currentTitle) => {
                  if (!currentTitle || currentTitle === "Name your Quiz" || currentTitle.trim() === "") {
                    return decoded.title;
                  }
                  return currentTitle; // Keep existing title
                });
              }
              setIsRestoringFromStorage(false);
            }, 0);
          }
          
          setLoadedFromReuseId('ai-generated');
        }
      } catch (e) {
        console.error('Failed to load AI quiz data:', e);
        setIsRestoringFromStorage(false);
      }
    } else if (existingData) {
      setIsRestoringFromStorage(true);
      // No new AI questions but we have existing data - restore them
      try {
        const { questions: savedQuestions, currentQuestion: savedCurrentQuestion, currentQuestionIndex: savedIndex, title: savedTitle } = JSON.parse(existingData);
        
        // Prepare questions to restore - start with saved questions
        let questionsToRestore = savedQuestions && savedQuestions.length > 0 ? [...savedQuestions] : [];
        
        // If there's a current question that wasn't saved in questions, add it
        if (savedCurrentQuestion && savedIndex !== undefined && savedIndex >= questionsToRestore.length) {
          const hasContent = savedCurrentQuestion.text.trim() !== "" || 
            savedCurrentQuestion.options.some(opt => opt.text.trim() !== "");
          if (hasContent) {
            questionsToRestore.push(savedCurrentQuestion);
          }
        }
        
        console.log('Restoring questions without AI:', {
          savedCount: questionsToRestore.length,
          questions: questionsToRestore.map(q => q.text),
        });
        
        // Restore questions directly - use saved as source of truth
        // This will replace any existing questions in state
        // Use setTimeout to ensure this happens after other effects
        setTimeout(() => {
          setQuestions(questionsToRestore);
          
          // Restore current question and index
          if (savedCurrentQuestion && savedIndex !== undefined) {
            const hasContent = savedCurrentQuestion.text.trim() !== "" || 
              savedCurrentQuestion.options.some(opt => opt.text.trim() !== "");
            
            if (hasContent) {
              if (savedIndex < (savedQuestions?.length || 0)) {
                // Editing an existing question
                setCurrentQuestion(savedCurrentQuestion);
                setCurrentQuestionIndex(savedIndex);
              } else {
                // Current question was a new question being edited
                setCurrentQuestion(savedCurrentQuestion);
                setCurrentQuestionIndex(questionsToRestore.length);
              }
            } else {
              // No content, reset to empty
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
              setCurrentQuestionIndex(questionsToRestore.length);
            }
          } else {
            // No saved current question, reset to empty
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
            setCurrentQuestionIndex(questionsToRestore.length);
          }
          
          if (savedTitle && savedTitle !== "Name your Quiz") {
            setQuizTitle(savedTitle);
          }
          
          // Clear the stored data and reset flag AFTER setting questions
          localStorage.removeItem("existingQuizData");
          setIsRestoringFromStorage(false);
        }, 0);
      } catch (e) {
        console.error('Failed to restore existing quiz data:', e);
        localStorage.removeItem("existingQuizData");
        setIsRestoringFromStorage(false);
      }
    }
  }, [searchParams, loadedFromReuseId, isRestoringFromStorage]);

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
    // Validate that amount is greater than 0 (free quizzes should not call this function)
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      throw new Error("Cannot create quiz on-chain with zero or negative amount. Use handleFreeQuiz for free quizzes.");
    }

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
      address,
      chainId: chain?.id,
    });

    try {
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
    } catch (error) {
      console.error("Error in writeContractAsync:", error);
      throw error;
    }
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

  // Update default amount when token changes (only if no value is set from localStorage)
  useEffect(() => {
    // Don't override if bountyAmount was set from localStorage
    if (bountyAmountSetFromStorage) {
      return;
    }
    
    // Don't override if we have a pending quiz creation with a bounty amount
    if (pendingQuizCreation?.type === "bounty" && pendingQuizCreation?.options?.bountyAmount) {
      return;
    }
    
    // Don't override if we're in the middle of creating a quiz with bounty
    if (isCreating && creationStep !== CreationStep.NONE) {
      return;
    }
    
    // Set default based on token type
    if (selectedToken?.id === "usdc") {
      setBountyAmount("10");
    } else if (selectedToken?.isNative) {
      setBountyAmount("0.001");
    } else {
      setBountyAmount("100");
    }
  }, [selectedToken?.id, selectedToken?.isNative, bountyAmountSetFromStorage, pendingQuizCreation, isCreating, creationStep]);

  // Effetto per caricare la domanda corrente quando cambia l'indice
  useEffect(() => {
    // Don't interfere if we're restoring from storage
    if (isRestoringFromStorage) return;
    
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
  }, [currentQuestionIndex, questions, isRestoringFromStorage]);

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
    try {
      setError("");
      console.log("Creating free quiz - NO on-chain transaction needed");
      // Create quiz without bounty - NO on-chain transaction needed
      const result = await handleSaveQuiz();

      if (result) {
        console.log("Free quiz created successfully, navigating to lobby:", result.roomCode);
        // After quiz is created, navigate directly to lobby
        router.push(`/quiz/lobby/${result.roomCode}`);
      } else {
        console.error("Failed to create free quiz - handleSaveQuiz returned null");
        setError("Failed to create quiz. Please try again.");
      }
    } catch (error) {
      console.error("Error creating free quiz:", error);
      setError(
        error instanceof Error
          ? error.message
          : "Failed to create quiz. Please try again."
      );
    }
  };

  // Step 2: Create quiz and add bounty on-chain
  const handleBountyQuiz = async (bountyAmountOverride?: string, currencyOverride?: string) => {
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

      // Use override values if provided (from pendingQuizCreation), otherwise use state
      const actualBountyAmount = bountyAmountOverride || bountyAmount;
      const actualCurrency = currencyOverride || selectedCurrency;
      
      // Update state if override values were provided
      if (bountyAmountOverride) {
        setBountyAmount(bountyAmountOverride);
      }
      if (currencyOverride) {
        setSelectedCurrency(currencyOverride);
      }

      // Get the correct token based on actual currency
      const actualToken = availableTokens.find(token => token.id === actualCurrency);

      // Validate bounty amount
      const bountyAmountNum = parseFloat(actualBountyAmount);
      if (isNaN(bountyAmountNum) || bountyAmountNum <= 0) {
        setError("Invalid bounty amount");
        setCreationStep(CreationStep.NONE);
        return;
      }

      // Determine token address and decimals
      let tokenAddress: string;
      let decimals: number;

      if (actualToken?.isNative) {
        tokenAddress = ZERO_ADDRESS;
        decimals = 18;

        // Check ETH balance
        if (ethBalance && parseFloat(ethBalance.formatted) < bountyAmountNum) {
          setError(
            `Insufficient ${actualToken.symbol} balance. You have ${ethBalance.formatted} ${actualToken.symbol} but need ${actualBountyAmount} ${actualToken.symbol}`
          );
          setCreationStep(CreationStep.NONE);
          return;
        }
      } else if (actualToken) {
        tokenAddress = actualToken.address;
        decimals = tokenDecimals ? Number(tokenDecimals) : actualToken.decimals;

        // Read token balance for the actual token
        let actualDisplayBalance = "0";
        if (actualToken.isNative) {
          actualDisplayBalance = ethBalance?.formatted || "0";
        } else {
          // Read ERC20 balance using publicClient
          try {
            const balance = await publicClient?.readContract({
              address: actualToken.address as `0x${string}`,
              abi: ERC20_ABI,
              functionName: "balanceOf",
              args: [address!],
            }) as bigint | undefined;
            
            if (balance !== undefined) {
              const tokenDecs = tokenDecimals ? Number(tokenDecimals) : actualToken.decimals;
              actualDisplayBalance = (Number(balance) / Math.pow(10, tokenDecs)).toString();
            }
          } catch (err) {
            console.error("Error reading token balance:", err);
            // Fallback to displayBalance if available and token matches
            if (selectedToken?.id === actualToken.id) {
              actualDisplayBalance = displayBalance;
            }
          }
        }

        // Check token balance
        const tokenBalanceNum = parseFloat(actualDisplayBalance);
        if (tokenBalanceNum < bountyAmountNum) {
          setError(
            `Insufficient ${actualToken.symbol} balance. You have ${actualDisplayBalance} ${actualToken.symbol} but need ${actualBountyAmount} ${actualToken.symbol}`
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
          const amountWei = parseUnits(actualBountyAmount, decimals);

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
      
      console.log("About to create quiz on-chain with:", {
        quizId,
        tokenAddress,
        actualBountyAmount,
        decimals,
        address,
        chainId: chain?.id,
      });
      
      const txHash = await createQuizOnChain(
        quizId,
        tokenAddress,
        actualBountyAmount,
        decimals
      );

      // Update backend with prize token, contract address, and transaction hash
      // Use update-quiz edge function to trigger Telegram notification when bounty is added
      await callEdgeFunction("update-quiz", {
        quiz_id: quizId,
        prize_token: tokenAddress,
        prize_amount: parseFloat(actualBountyAmount),
        contract_address: hootContractAddress,
        contract_tx_hash: txHash,
      });

      console.log("Quiz created on-chain with bounty:", {
        quizId,
        roomCode: createdRoomCode,
        txHash,
        amount: actualBountyAmount,
        currency: actualCurrency,
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
    if (quizTransaction && createdRoomCode) {
      // Navigate directly to lobby instead of showing share box
      setCreationStep(CreationStep.NONE);
      // Reset the flag so default values work for next quiz
      setBountyAmountSetFromStorage(false);
      router.push(`/quiz/lobby/${createdRoomCode}`);
    }
  }, [quizTransaction, createdRoomCode, router]);

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
        setCreationStep(CreationStep.NONE);
        return null;
      }

      // Validate all questions have content
      const invalidQuestions = allQuestions.filter(q => 
        !q.text.trim() || 
        q.options.length < 4 || 
        q.options.some(opt => !opt.text.trim())
      );
      
      if (invalidQuestions.length > 0) {
        setError("Please complete all questions. Each question needs text and 4 answer options.");
        setIsCreating(false);
        setCreationStep(CreationStep.NONE);
        return null;
      }

      if (isScheduled && !scheduledStartTime) {
        setError("Please choose a scheduled start time or disable scheduling");
        setIsCreating(false);
        setCreationStep(CreationStep.NONE);
        return null;
      }

      // Validate required fields
      if (!address) {
        setError("Please connect your wallet to create a quiz");
        setIsCreating(false);
        setCreationStep(CreationStep.NONE);
        return null;
      }

      if (!chain?.id) {
        setError("Please connect to a supported network");
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
        address,
        chainId: chain?.id,
      });

      // Create quiz in backend (no contract info yet) and initial game session
      const { quizId: backendQuizId, roomCode } = await createQuizOnBackend(
        quiz,
        undefined, // Contract address (will be set later if bounty is added)
        chain.id, // network id
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
      let generatedRoomCode: string;
      try {
        generatedRoomCode = await startGame(backendQuizId);
      } catch (gameError) {
        console.error("Error starting game:", gameError);
        throw new Error(`Failed to create game session: ${gameError instanceof Error ? gameError.message : "Unknown error"}`);
      }

      // Auto-join as the creator
      let creatorPlayerId: string;
      try {
        creatorPlayerId = await joinGameContext(
          "Creator",
          address,
          generatedRoomCode
        );
      } catch (joinError) {
        console.error("Error joining as creator:", joinError);
        throw new Error(`Failed to join as creator: ${joinError instanceof Error ? joinError.message : "Unknown error"}`);
      }

      // Update game session with creator in one call
      const { error: updateError } = await supabase
        .from("game_sessions")
        .update({ creator_session_id: creatorPlayerId })
        .eq("room_code", generatedRoomCode);
      
      if (updateError) {
        console.error("Error updating game session with creator:", updateError);
        // Don't throw here, the quiz is already created and game session exists
      }

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

      {/* User badge in top right corner */}
      <div
        style={{
          position: "absolute",
          top: "var(--spacing-md)",
          right: "var(--spacing-md)",
          zIndex: 10,
        }}
      >
        <div
          className="btn btn--primary"
          style={{
            opacity:
              loggedUser?.isAuthenticated && loggedUser?.address ? 1 : 0.7,
            maxWidth: "140px",
            overflow: "hidden",
            cursor: "default",
          }}
        >
          {/* Status dot */}
          <div
            style={{
              marginRight: "0.5rem",
              width: "8px",
              height: "8px",
              borderRadius: "50%",
              backgroundColor: badgeText.statusColor || "var(--color-success)",
              flexShrink: 0,
            }}
          ></div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "0.125rem",
              minWidth: 0,
              flex: 1,
            }}
          >
            {badgeText.primary && (
              <div
                style={{
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {badgeText.primary}
            </div>
            )}
            {badgeText.secondary &&
              !badgeText.secondary.includes("Farcaster") && (
                <div
                  className="text-caption"
                  style={{
                    opacity: 0.8,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {badgeText.secondary}
                </div>
              )}
          </div>
        </div>
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
              className="flex items-center space-x-2 rounded-lg px-3 py-2 transition-colors cursor-pointer"
              style={{ backgroundColor: "var(--color-surface-elevated)" }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "var(--color-surface)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "var(--color-surface-elevated)";
              }}
            >
              <div className="w-4 h-4 rounded-full bg-green-500"></div>
              <span className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
                Base Sepolia
              </span>
              <svg className="w-4 h-4" style={{ color: "var(--color-text-muted)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button> */}

            {/* {showNetworkSwitcher && (
              <div className="absolute top-full left-0 mt-1 w-full rounded-lg shadow-lg z-50" style={{ backgroundColor: "var(--color-surface-elevated)" }}>
                {/* <button
                  onClick={() => {
                    setNetwork('baseSepolia');
                    setShowNetworkSwitcher(false);
                  }}
                  className="w-full px-3 py-2 text-left text-sm rounded-lg transition-colors"
                  style={{
                    backgroundColor: currentNetwork === 'baseSepolia' ? "var(--color-surface)" : "transparent",
                    color: currentNetwork === 'baseSepolia' ? "var(--color-text)" : "var(--color-text-secondary)",
                  }}
                  onMouseEnter={(e) => {
                    if (currentNetwork !== 'baseSepolia') {
                      e.currentTarget.style.backgroundColor = "var(--color-surface)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (currentNetwork !== 'baseSepolia') {
                      e.currentTarget.style.backgroundColor = "transparent";
                    }
                  }}
                >
                  Base Sepolia
                </button> */}
            {/* </div> */}
            {/* )}  */}
          </div>
        </div>

        {/* Error/Status Messages */}
        {error && (
          <div className="w-full max-w-md mb-1 rounded-lg p-3 text-center" style={{ backgroundColor: "rgba(239, 68, 68, 0.2)", border: "1px solid var(--color-error)", color: "var(--color-error)" }}>
            {error}
          </div>
        )}
        {writeError && (
          <div className="w-full max-w-md mb-1 rounded-lg p-3 text-center" style={{ backgroundColor: "rgba(239, 68, 68, 0.2)", border: "1px solid var(--color-error)", color: "var(--color-error)" }}>
            Transaction Error: {writeError.message}
          </div>
        )}
        {sendError && (
          <div className="w-full max-w-md mb-1 rounded-lg p-3 text-center" style={{ backgroundColor: "rgba(239, 68, 68, 0.2)", border: "1px solid var(--color-error)", color: "var(--color-error)" }}>
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
          <div style={{ display: "flex", gap: "var(--spacing-sm)", alignItems: "flex-start" }}>
            <div className="bg-white rounded p-3 h-24 relative" style={{ flex: 1 }}>
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
                <div className="absolute bottom-1 right-1 text-xs px-1 rounded" style={{ color: "var(--color-error)", backgroundColor: "rgba(239, 68, 68, 0.2)" }}>
                  {currentQuestion.text.length}/{MAX_QUESTION_LENGTH}
                </div>
              )}
            </div>
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
                      ? "var(--color-success)"
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
                    className="quiz-input w-full bg-transparent focus:outline-none pr-12"
                    style={{ color: "var(--color-text)" }}
                    onClick={(e) => e.stopPropagation()}
                  />
                  {/* Character counter for answer - only show when limit reached */}
                  {option.text.length >= MAX_ANSWER_LENGTH && (
                    <div className="absolute bottom-0 right-12 text-xs px-1 rounded" style={{ color: "var(--color-error)", backgroundColor: "rgba(239, 68, 68, 0.3)" }}>
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
                className={`bg-black border ${currentQuestionIndex === index ? 'border-white' : 'border-white/30'} rounded px-4 py-2 text-sm cursor-pointer hover:border-white transition-colors flex-shrink-0 relative flex items-center`}
                style={{ minHeight: '40px' }}
                onClick={() => handleQuestionClick(index)}
              >
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteQuestion(index);
                  }}
                  className="absolute top-0 right-0 p-1 transition-colors"
                  style={{ color: "var(--color-text)" }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = "var(--color-text-secondary)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = "var(--color-text)";
                  }}
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
                className="bg-black border border-white rounded px-4 py-2 text-sm flex-shrink-0 flex items-center"
                style={{ minHeight: '40px' }}
              >
                Question {displayQuestionNumber}<br/>
                {currentQuestion.text ? getQuestionSummary(currentQuestion) : ""}
              </div>
            )}
            
            {/* Add question button - always visible on the right */}
            <div className="flex flex-col items-center relative flex-shrink-0">
              <div className="flex items-center gap-2">
              <button 
                ref={addButtonRef}
                className="bg-black border border-white/30 rounded px-4 py-2 text-2xl hover:border-white transition-colors flex items-center justify-center"
                style={{ minHeight: '40px', minWidth: '40px' }}
                onClick={handleAddQuestion}
              >
                +
              </button>
                <button
                  type="button"
                  onClick={() => {
                    // Save existing questions, current question (if has content), and title before navigating
                    if (typeof window !== "undefined") {
                      // Check if current question has content
                      const hasCurrentQuestionContent = currentQuestion.text.trim() !== "" || 
                        currentQuestion.options.some(opt => opt.text.trim() !== "");
                      
                      console.log('Saving before AI generation:', {
                        questionsCount: questions.length,
                        currentQuestionIndex,
                        hasCurrentQuestionContent,
                        currentQuestionText: currentQuestion.text,
                        questions: questions.map(q => q.text),
                      });
                      
                      // Always include ALL questions, including currentQuestion if it has content
                      let questionsToSave = [...questions];
                      
                      // If current question has content and is a new question (not yet in list), include it
                      if (hasCurrentQuestionContent && currentQuestionIndex === questions.length) {
                        // Current question is a new question being edited, add it to the list
                        questionsToSave.push(currentQuestion);
                        console.log('Including current question in saved questions, new count:', questionsToSave.length);
                      } else if (hasCurrentQuestionContent && currentQuestionIndex < questions.length) {
                        // Current question is editing an existing question - make sure it's updated in the list
                        questionsToSave[currentQuestionIndex] = currentQuestion;
                        console.log('Updating existing question at index', currentQuestionIndex);
                      }
                      
                      // Save empty current question for restoration
                      const currentQuestionToSave = {
                        text: "",
                        options: [
                          { text: "", color: "hover:opacity-80" },
                          { text: "", color: "hover:opacity-80" },
                          { text: "", color: "hover:opacity-80" },
                          { text: "", color: "hover:opacity-80" },
                        ],
                        correctAnswer: 0,
                      };
                      
                      localStorage.setItem("existingQuizData", JSON.stringify({
                        questions: questionsToSave,
                        currentQuestion: currentQuestionToSave,
                        currentQuestionIndex: questionsToSave.length, // Point to next new question
                        title: quizTitle,
                      }));
                      
                      console.log('Saved to localStorage:', {
                        questionsCount: questionsToSave.length,
                        questions: questionsToSave.map(q => q.text),
                      });
                    }
                    router.push("/quiz/admin/generate-ai-question");
                  }}
                  className="bg-black/50 border border-[var(--color-primary)] rounded px-4 py-2 text-sm hover:border-[var(--color-primary-hover)] transition-colors flex items-center justify-center"
                  style={{
                    whiteSpace: "nowrap",
                    minHeight: '40px',
                  }}
                  title="Generate question with AI"
                >
                  ✨ Generate with AI
                </button>
              </div>
              {addQuestionError && (
                <div className="mt-2 text-xs text-center max-w-48" style={{ color: "var(--color-error)" }}>
                  {addQuestionError}
                </div>
              )}
              {showTooltip && (
                <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 text-xs px-2 py-1 rounded shadow-lg z-50 whitespace-nowrap" style={{ backgroundColor: "var(--color-text)", color: "var(--color-background)" }}>
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
                // Save current quiz state before navigating
                if (typeof window !== "undefined") {
                  // Save current question if it has content
                  const hasCurrentQuestionContent = currentQuestion.text.trim() !== "" || 
                    currentQuestion.options.some(opt => opt.text.trim() !== "");
                  
                  let questionsToSave = [...questions];
                  
                  // If current question has content and is a new question (not yet in list), include it
                  if (hasCurrentQuestionContent && currentQuestionIndex === questions.length) {
                    questionsToSave.push(currentQuestion);
                  } else if (hasCurrentQuestionContent && currentQuestionIndex < questions.length) {
                    // Current question is editing an existing question - make sure it's updated in the list
                    questionsToSave[currentQuestionIndex] = currentQuestion;
                  }
                  
                  localStorage.setItem("quizDataBeforeCreation", JSON.stringify({
                    questions: questionsToSave,
                    currentQuestion: {
                      text: "",
                      options: [
                        { text: "", color: "hover:opacity-80" },
                        { text: "", color: "hover:opacity-80" },
                        { text: "", color: "hover:opacity-80" },
                        { text: "", color: "hover:opacity-80" },
                      ],
                      correctAnswer: 0,
                    },
                    currentQuestionIndex: questionsToSave.length,
                    title: quizTitle,
                  }));
                }
                router.push("/quiz/admin/create-quiz");
              }}
              disabled={isCreating}
              className="px-8 py-4 rounded text-white font-bold disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                backgroundColor: isCreating ? "var(--color-text-muted)" : "var(--color-primary)",
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
                backgroundColor: "var(--color-primary)",
              }}
            >
              Connect To Hoot to Create Quiz
            </button>
          )}

          

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

      {/* Wallet Modal */}
      {showWalletModal && (
        <WalletModal onClose={() => setShowWalletModal(false)} />
      )}

      {/* Quick Menu Bottom Sheet */}
      {showQuickMenu && (
        <div
          className="bottom-sheet"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowQuickMenu(false);
            }
          }}
        >
          <div className="bottom-sheet__content">
            <button
              onClick={() => setShowQuickMenu(false)}
              className="btn"
              style={{
                position: "absolute",
                top: "var(--spacing-md)",
                right: "var(--spacing-md)",
                padding: "var(--spacing-xs)",
                minWidth: "auto",
                background: "transparent",
                color: "var(--color-text)",
              }}
              aria-label="Close"
            >
              ×
            </button>

            <div style={{ textAlign: "center", marginBottom: "var(--spacing-lg)" }}>
              <h3 className="text-h2" style={{ marginBottom: "var(--spacing-xs)" }}>
                Quick Actions
              </h3>
              <p className="text-body" style={{ color: "var(--color-text-secondary)" }}>
                Jump to your quizzes or open your wallet
              </p>
            </div>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "var(--spacing-md)",
              }}
            >
              {/* Your Quizzes */}
              <button
                type="button"
                onClick={() => {
                  setShowQuickMenu(false);
                  router.push("/quiz/admin/my-quizzes");
                }}
                className="btn btn--primary btn--large"
                style={{
                  width: "100%",
                  textAlign: "left",
                  justifyContent: "flex-start",
                  flexDirection: "column",
                  alignItems: "flex-start",
                }}
              >
                <div
                className="text-h2"
                style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "var(--spacing-xs)",
                  marginBottom: "var(--spacing-xs)",
                }}
              >
                  <span>📚</span>
                  <span>Your quizzes</span>
                </div>
                <div
                className="text-body"
                style={{
                    color: "var(--color-primary-light)",
                }}
              >
                  View and manage the quizzes you have created
            </div>
              </button>

              {/* Wallet */}
              <button
                type="button"
                onClick={() => {
                  if (loggedUser?.isAuthenticated && loggedUser?.address) {
                    setShowQuickMenu(false);
                    setShowWalletModal(true);
                  }
                }}
                className="btn btn--secondary btn--large"
                style={{
                  width: "100%",
                  textAlign: "left",
                  justifyContent: "flex-start",
                  flexDirection: "column",
                  alignItems: "flex-start",
                  opacity:
                    loggedUser?.isAuthenticated && loggedUser?.address ? 1 : 0.7,
                }}
              >
                <div
                  className="text-h2"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "var(--spacing-xs)",
                    marginBottom: "var(--spacing-xs)",
                  }}
                >
                  <span>👛</span>
                  <span>Wallet</span>
              </div>
              <div
                  className="text-body"
                style={{
                    color: "var(--color-text-secondary)",
                }}
              >
                  {loggedUser?.isAuthenticated && loggedUser?.address
                    ? "Open your wallet to view balances and activity"
                    : "Connect and create your wallet first to open it here"}
                </div>
                </button>
              </div>
          </div>
        </div>
      )}

      <Footer />
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
          <div style={{ color: "var(--color-text-muted)" }}>Please wait</div>
        </div>
      </div>
    }>
      <AdminPageContent />
    </Suspense>
  );
}