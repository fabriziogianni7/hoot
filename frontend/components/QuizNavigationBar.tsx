import { useRef } from "react";

interface Question {
  text: string;
  options: Array<{ text: string; color: string }>;
  correctAnswer: number;
}

interface QuizNavigationBarProps {
  questions: Question[];
  currentQuestionIndex: number;
  displayQuestionNumber: number;
  currentQuestion: Question;
  onQuestionClick: (index: number) => void;
  onAddQuestion: () => void;
  onDeleteQuestion: (index: number) => void;
  addQuestionError?: string;
  showTooltip?: boolean;
}

function getQuestionSummary(question: Question): string {
  if (!question.text) return "";
  // Return first 20 characters of the question text
  return question.text.length > 20
    ? question.text.substring(0, 20) + "..."
    : question.text;
}

export default function QuizNavigationBar({
  questions,
  currentQuestionIndex,
  displayQuestionNumber,
  currentQuestion,
  onQuestionClick,
  onAddQuestion,
  onDeleteQuestion,
  addQuestionError,
  showTooltip,
}: QuizNavigationBarProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const addButtonRef = useRef<HTMLButtonElement>(null);

  return (
    <div className="w-full max-w-md relative">
      {/* Container with horizontal scroll */}
      <div
        ref={scrollContainerRef}
        className="flex items-center space-x-4 pb-2 overflow-x-auto px-2 scrollbar-hide"
        style={{
          scrollBehavior: 'smooth',
          scrollPaddingLeft: '50%',
          scrollPaddingRight: '50%'
        }}
      >
        {questions.map((question, index) => (
          <div
            key={index}
            className={`bg-black border ${currentQuestionIndex === index ? 'border-white' : 'border-white/30'} rounded px-4 py-2 text-sm cursor-pointer hover:border-white transition-colors flex-shrink-0 relative`}
            onClick={() => onQuestionClick(index)}
          >
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDeleteQuestion(index);
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
            onClick={onAddQuestion}
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
  );
}