"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuiz } from "@/lib/quiz-context";
import { useSupabase } from "@/lib/supabase-context";
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
  HOOT_BONUS_QUIZ_MANAGER_ABI,
  ZERO_ADDRESS,
  USDC_ADDRESSES,
  ERC20_ABI,
} from "@/lib/contracts";
import { parseEther, parseUnits } from "viem";
import ShareBox from "@/components/ShareBox";
import { sdk } from "@farcaster/miniapp-sdk";
import { useAuth } from "@/lib/use-auth";

// Import reusable components
import QuizQuestionEditor from "@/components/QuizQuestionEditor";
import QuizAnswerOptions from "@/components/QuizAnswerOptions";
import QuizNavigationBar from "@/components/QuizNavigationBar";
import BountyOptionsModal from "@/components/BountyOptionsModal";

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
  isGoldenQuestion: boolean;
}

enum CreationStep {
  NONE = "",
  SAVING_QUIZ = "Saving quiz...",
  CREATING_ROOM = "Creating room...",
  PREPARING_BOUNTY = "Preparing bounty...",
  CHECKING_ALLOWANCE = "Checking token allowance...",
  REQUESTING_APPROVAL = "Requesting token approval...",
  WAITING_APPROVAL = "Waiting for approval confirmation...",
  DEPLOYING_EXTRA_BOUNTY = "Deploying extra bounty...",
}

export default function BonusQuizAdmin() {
  const { isFrameReady, setFrameReady } = useMiniKit();
  const [quizTitle, setQuizTitle] = useState("");
  const [questions, setQuestions] = useState<QuizQuestion[]>([
    {
      text: "",
      options: [
        { text: "", color: "#0DCEFB" },
        { text: "", color: "#53DB1E" },
        { text: "", color: "#FDCC0E" },
        { text: "", color: "#F70000" },
      ],
      correctAnswer: 0,
      isGoldenQuestion: false,
    },
  ]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [creationStep, setCreationStep] = useState<CreationStep>(CreationStep.NONE);
  const [showQuizOptions, setShowQuizOptions] = useState(false);
  const [selectedCurrency, setSelectedCurrency] = useState<"usdc" | "eth">("usdc");
  const [bountyAmount, setBountyAmount] = useState("");
  const [extraBountyAmount, setExtraBountyAmount] = useState("");
  const [isFreeQuiz, setIsFreeQuiz] = useState(false);
  const [roomCode, setRoomCode] = useState("");
  const [error, setError] = useState("");
  const [addQuestionError, setAddQuestionError] = useState("");
  const [showTooltip, setShowTooltip] = useState(false);
  const [isAuthLoading, setIsAuthLoading] = useState(true);

  const router = useRouter();
  const searchParams = useSearchParams();
  const { createGameSession } = useQuiz();
  const { loggedUser, isAuthLoading: authLoading, authError } = useAuth();

  const { address, chain } = useAccount();
  const { switchChain } = useSwitchChain();
  const publicClient = usePublicClient();

  // Get balance for selected currency
  const { data: balance } = useBalance({
    address: address,
    token: selectedCurrency === "usdc"
      ? (USDC_ADDRESSES[chain?.id === 8453 ? 8453 : 84532] as `0x${string}`)
      : undefined,
  });

  const displayBalance = balance ? balance.formatted : "0";

  // Contract addresses - need to be updated with actual deployed addresses
  const HOOT_BONUS_QUIZ_MANAGER_ADDRESSES = {
    84532: "0x0000000000000000000000000000000000000000", // Base Sepolia - placeholder
    8453: "0x0000000000000000000000000000000000000000", // Base Mainnet - placeholder
  };

  const contractAddress = HOOT_BONUS_QUIZ_MANAGER_ADDRESSES[chain?.id === 8453 ? 8453 : 84532];

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const addButtonRef = useRef<HTMLButtonElement>(null);

  const currentQuestion = questions[currentQuestionIndex];
  const displayQuestionNumber = currentQuestionIndex + 1;

  // Authentication check
  useEffect(() => {
    if (!authLoading) {
      setIsAuthLoading(false);
      if (!loggedUser?.isAuthenticated) {
        setError("Please authenticate to create a quiz");
      }
    }
  }, [loggedUser, authLoading]);

  // Frame ready check
  useEffect(() => {
    const checkFrameReady = async () => {
      const context = await sdk.context;
      if (context) {
        setFrameReady(true);
      }
    };

    if (isFrameReady) return;
    checkFrameReady();
  }, [isFrameReady, setFrameReady]);

  const handleFreeQuiz = () => {
    setIsFreeQuiz(true);
    setShowQuizOptions(false);
    handleSaveQuiz();
  };

  const handleBountyQuiz = () => {
    setIsFreeQuiz(false);
    setShowQuizOptions(false);
    // Modal will remain open for bounty configuration
  };

  const validateCurrentQuestion = () => {
    const question = currentQuestion;
    const filledOptions = question.options.filter((opt) => opt.text.trim() !== "");

    if (question.text.trim() === "") {
      return "Question text is required";
    }

    if (filledOptions.length < 2) {
      return "At least 2 answer options are required";
    }

    // Check if correct answer is among filled options
    const correctOption = question.options[question.correctAnswer];
    if (!correctOption || correctOption.text.trim() === "") {
      return "Correct answer must be selected from filled options";
    }

    return null;
  };

  const handleAddQuestion = () => {
    const validationError = validateCurrentQuestion();
    if (validationError) {
      setAddQuestionError(validationError);
      setShowTooltip(true);
      return;
    }

    const newQuestion: QuizQuestion = {
      text: "",
      options: [
        { text: "", color: "#0DCEFB" },
        { text: "", color: "#53DB1E" },
        { text: "", color: "#FDCC0E" },
        { text: "", color: "#F70000" },
      ],
      correctAnswer: 0,
      isGoldenQuestion: false,
    };

    setQuestions([...questions, newQuestion]);
    setCurrentQuestionIndex(questions.length);
    setAddQuestionError("");
    setShowTooltip(false);
  };

  const handleQuestionClick = (index: number) => {
    const validationError = validateCurrentQuestion();
    if (validationError) {
      setAddQuestionError(validationError);
      setShowTooltip(true);
      return;
    }

    setCurrentQuestionIndex(index);
    setAddQuestionError("");
    setShowTooltip(false);
  };

  const handleDeleteQuestion = (index: number) => {
    if (questions.length <= 1) return; // Keep at least one question

    const newQuestions = questions.filter((_, i) => i !== index);
    setQuestions(newQuestions);

    if (currentQuestionIndex >= newQuestions.length) {
      setCurrentQuestionIndex(newQuestions.length - 1);
    }
  };

  const handleOptionChange = (index: number, text: string) => {
    const newQuestions = [...questions];
    newQuestions[currentQuestionIndex].options[index].text = text;
    setQuestions(newQuestions);

    // Clear error when user modifies options
    setAddQuestionError("");
    setShowTooltip(false);
  };

  const handleCorrectAnswerChange = (index: number) => {
    const newQuestions = [...questions];
    newQuestions[currentQuestionIndex].correctAnswer = index;
    setQuestions(newQuestions);
  };

  const handleGoldenQuestionToggle = (isGolden: boolean) => {
    const newQuestions = [...questions];
    newQuestions[currentQuestionIndex].isGoldenQuestion = isGolden;
    setQuestions(newQuestions);
  };

  const generateRoomCode = () => {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  };

  const handleSaveQuiz = async () => {
    try {
      setCreationStep(CreationStep.SAVING_QUIZ);

      // Validate quiz
      if (!quizTitle.trim()) {
        throw new Error("Quiz title is required");
      }

      // Validate all questions
      for (let i = 0; i < questions.length; i++) {
        const question = questions[i];
        const filledOptions = question.options.filter((opt) => opt.text.trim() !== "");

        if (question.text.trim() === "") {
          throw new Error(`Question ${i + 1}: Question text is required`);
        }

        if (filledOptions.length < 2) {
          throw new Error(`Question ${i + 1}: At least 2 answer options are required`);
        }

        const correctOption = question.options[question.correctAnswer];
        if (!correctOption || correctOption.text.trim() === "") {
          throw new Error(`Question ${i + 1}: Correct answer must be selected from filled options`);
        }
      }

      // Check for golden questions
      const goldenQuestionIds = questions
        .map((q, index) => q.isGoldenQuestion ? index : -1)
        .filter(id => id !== -1);

      if (goldenQuestionIds.length === 0 && !isFreeQuiz) {
        throw new Error("At least one golden question is required for bonus quizzes");
      }

      // Generate room code
      const newRoomCode = generateRoomCode();
      setRoomCode(newRoomCode);

      // Prepare quiz data
      const quizData = {
        title: quizTitle,
        description: `Bonus quiz with ${questions.length} questions`,
        questions: questions.map(q => ({
          question_text: q.text,
          options: q.options.map(opt => opt.text),
          correct_answer_index: q.correctAnswer,
          time_limit: 15,
        })),
        mode: 'bonus',
        golden_question_ids: goldenQuestionIds,
        extra_bounty_amount: isFreeQuiz ? 0 : parseFloat(extraBountyAmount || '0'),
      };

      console.log('Saving quiz:', quizData);

      // Here you would integrate with your backend to save the quiz
      // For now, we'll just create the game session

      setCreationStep(CreationStep.CREATING_ROOM);

      // Create game session (this would need to be updated to handle bonus mode)
      const gameSession = await createGameSession(newRoomCode, 0); // quizId would come from backend

      if (!isFreeQuiz) {
        await handleDeployBounty(gameSession.quiz_id);
      }

      // Navigate to lobby
      router.push(`/quiz/lobby?room=${newRoomCode}`);

    } catch (error) {
      console.error('Error saving quiz:', error);
      setError(error instanceof Error ? error.message : 'Failed to save quiz');
      setCreationStep(CreationStep.NONE);
    }
  };

  const handleDeployBounty = async (quizId: string) => {
    if (!contractAddress || !address) {
      throw new Error("Contract address or wallet address not available");
    }

    setCreationStep(CreationStep.PREPARING_BOUNTY);

    const bountyValue = parseFloat(bountyAmount);
    const extraBountyValue = parseFloat(extraBountyAmount || '0');

    if (bountyValue <= 0) {
      throw new Error("Bounty amount must be greater than 0");
    }

    if (extraBountyValue <= 0) {
      throw new Error("Extra bounty amount must be greater than 0 for bonus quizzes");
    }

    // Parse amounts based on token
    let bountyAmountWei: bigint;
    let extraBountyAmountWei: bigint;
    let tokenAddress: `0x${string}`;

    if (selectedCurrency === "eth") {
      bountyAmountWei = parseEther(bountyAmount);
      extraBountyAmountWei = parseEther(extraBountyAmount);
      tokenAddress = ZERO_ADDRESS;
    } else {
      const decimals = 6; // USDC decimals
      bountyAmountWei = parseUnits(bountyAmount, decimals);
      extraBountyAmountWei = parseUnits(extraBountyAmount, decimals);
      tokenAddress = USDC_ADDRESSES[chain?.id === 8453 ? 8453 : 84532] as `0x${string}`;
    }

    // Check balance
    if (selectedCurrency === "eth") {
      if (!balance || parseFloat(balance.formatted) < bountyValue + extraBountyValue) {
        throw new Error("Insufficient ETH balance");
      }
    } else {
      // Check ERC20 balance
      if (!balance || parseFloat(balance.formatted) < bountyValue + extraBountyValue) {
        throw new Error("Insufficient token balance");
      }
    }

    // Deploy base bounty first
    setCreationStep(CreationStep.CHECKING_ALLOWANCE);

    if (selectedCurrency === "usdc") {
      // Check and request allowance for USDC
      const allowance = await publicClient?.readContract({
        address: tokenAddress,
        abi: ERC20_ABI,
        functionName: 'allowance',
        args: [address, contractAddress],
      });

      if (allowance < bountyAmountWei + extraBountyAmountWei) {
        setCreationStep(CreationStep.REQUESTING_APPROVAL);

        // Request approval
        const { request } = await publicClient?.simulateContract({
          address: tokenAddress,
          abi: ERC20_ABI,
          functionName: 'approve',
          args: [contractAddress, bountyAmountWei + extraBountyAmountWei],
        });

        const hash = await writeContractAsync?.(request);
        setCreationStep(CreationStep.WAITING_APPROVAL);

        // Wait for confirmation
        await publicClient?.waitForTransactionReceipt({ hash });
      }
    }

    // Create quiz with base bounty
    const { request: createRequest } = await publicClient?.simulateContract({
      address: contractAddress,
      abi: HOOT_BONUS_QUIZ_MANAGER_ABI,
      functionName: 'createQuiz',
      args: [quizId, tokenAddress, bountyAmountWei],
      value: selectedCurrency === "eth" ? bountyAmountWei : 0n,
    });

    const createHash = await writeContractAsync?.(createRequest);
    await publicClient?.waitForTransactionReceipt({ hash: createHash });

    // Deploy extra bounty
    setCreationStep(CreationStep.DEPLOYING_EXTRA_BOUNTY);

    const { request: extraRequest } = await publicClient?.simulateContract({
      address: contractAddress,
      abi: HOOT_BONUS_QUIZ_MANAGER_ABI,
      functionName: 'depositExtraBounty',
      args: [quizId, extraBountyAmountWei],
      value: selectedCurrency === "eth" ? extraBountyAmountWei : 0n,
    });

    const extraHash = await writeContractAsync?.(extraRequest);
    await publicClient?.waitForTransactionReceipt({ hash: extraHash });

    setCreationStep(CreationStep.NONE);
  };

  // Mock writeContractAsync - replace with actual wagmi hook
  const { writeContractAsync } = useWriteContract();

  const filledOptionsCount = currentQuestion.options.filter(opt => opt.text.trim() !== "").length;

  return (
    <div className="min-h-screen bg-black text-white p-4">
      <div className="max-w-md mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold mb-2">Create Bonus Quiz</h1>
          <p className="text-gray-400">
            Create a quiz with golden questions and extra bounty rewards
          </p>
        </div>

        {/* Quiz Title */}
        <div className="mb-6">
          <input
            type="text"
            value={quizTitle}
            onChange={(e) => setQuizTitle(e.target.value)}
            placeholder="Quiz Title"
            maxLength={MAX_QUIZ_TITLE_LENGTH}
            className="w-full px-4 py-3 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-purple-500"
          />
        </div>

        {/* Current Question Header */}
        <div className="text-center mb-4">
          <h2 className="text-xl font-semibold">
            Question {displayQuestionNumber}
          </h2>
        </div>

        {/* Golden Question Toggle */}
        <div className="mb-4 flex items-center justify-center gap-2">
          <input
            type="checkbox"
            id="golden-question"
            checked={currentQuestion.isGoldenQuestion}
            onChange={(e) => handleGoldenQuestionToggle(e.target.checked)}
            className="w-4 h-4 text-purple-600 bg-gray-800 border-gray-600 rounded focus:ring-purple-500"
          />
          <label htmlFor="golden-question" className="text-sm text-gray-300">
            Mark as Golden Question
          </label>
        </div>

        {/* Question Editor */}
        <QuizQuestionEditor
          question={currentQuestion}
          onQuestionChange={(text) => {
            const newQuestions = [...questions];
            newQuestions[currentQuestionIndex].text = text;
            setQuestions(newQuestions);
            setAddQuestionError("");
            if (text.trim() !== "" && filledOptionsCount >= 2) {
              setShowTooltip(false);
            }
          }}
          addQuestionError={addQuestionError}
          filledOptionsCount={filledOptionsCount}
          onTooltipVisibilityChange={setShowTooltip}
        />

        {/* Answer Options */}
        <QuizAnswerOptions
          options={currentQuestion.options}
          correctAnswer={currentQuestion.correctAnswer}
          onOptionChange={handleOptionChange}
          onCorrectAnswerChange={handleCorrectAnswerChange}
        />

        {/* Question Navigation */}
        <QuizNavigationBar
          questions={questions}
          currentQuestionIndex={currentQuestionIndex}
          displayQuestionNumber={displayQuestionNumber}
          currentQuestion={currentQuestion}
          onQuestionClick={handleQuestionClick}
          onAddQuestion={handleAddQuestion}
          onDeleteQuestion={handleDeleteQuestion}
          addQuestionError={addQuestionError}
          showTooltip={showTooltip}
        />

        {/* Action Buttons */}
        <div className="mt-6 flex flex-col gap-4 w-full max-w-md">
          {!showQuizOptions ? (
            <button
              onClick={() => setShowQuizOptions(true)}
              className="w-full py-3 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg transition-colors"
            >
              Continue
            </button>
          ) : (
            <BountyOptionsModal
              isOpen={showQuizOptions}
              onClose={() => setShowQuizOptions(false)}
              onFreeQuiz={handleFreeQuiz}
              onBountyQuiz={handleBountyQuiz}
              selectedCurrency={selectedCurrency}
              setSelectedCurrency={setSelectedCurrency}
              bountyAmount={bountyAmount}
              setBountyAmount={setBountyAmount}
            />
          )}

          {/* Extra Bounty Input for Bonus Mode */}
          {!isFreeQuiz && showQuizOptions && (
            <div className="p-3 bg-purple-600/20 rounded-lg">
              <label className="block text-white text-sm font-medium mb-2">
                Extra Bounty for Golden Questions (
                {selectedCurrency === "usdc"
                  ? "USDC"
                  : selectedCurrency === "eth"
                  ? "ETH"
                  : "Tokens"}
                )
              </label>
              <input
                type="number"
                step="1"
                min="0"
                value={extraBountyAmount}
                onChange={(e) => setExtraBountyAmount(e.target.value)}
                className="w-full px-3 py-2 bg-gray-600 border border-gray-500 rounded text-white focus:outline-none focus:border-purple-500"
                placeholder={
                  selectedCurrency === "usdc"
                    ? "50"
                    : selectedCurrency === "eth"
                    ? "0.01"
                    : "100"
                }
              />
              <div className="text-xs text-gray-400 mt-1">
                Extra bounty distributed equally if all players answer golden questions correctly
              </div>
            </div>
          )}

          {/* Creation Step Indicator */}
          {creationStep !== CreationStep.NONE && (
            <div className="text-center text-purple-400">
              {creationStep}
            </div>
          )}

          {/* Error Display */}
          {error && (
            <div className="text-center text-red-400 text-sm">
              {error}
            </div>
          )}
        </div>

        {/* Share Box - shown after creation */}
        {roomCode && (
          <div className="mt-8">
            <ShareBox roomCode={roomCode} />
          </div>
        )}
      </div>
    </div>
  );
}