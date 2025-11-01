import { useState } from "react";

// Character limits for quiz content
const MAX_QUESTION_LENGTH = 500;

interface QuizQuestionEditorProps {
  question: {
    text: string;
    options: Array<{ text: string; color: string }>;
  };
  onQuestionChange: (text: string) => void;
  addQuestionError?: string;
  filledOptionsCount: number;
  onTooltipVisibilityChange?: (visible: boolean) => void;
}

export default function QuizQuestionEditor({
  question,
  onQuestionChange,
  addQuestionError,
  filledOptionsCount,
  onTooltipVisibilityChange,
}: QuizQuestionEditorProps) {
  return (
    <div className="w-full max-w-md mb-6">
      <div className="bg-white rounded p-3 h-24 relative">
        <textarea
          value={question.text}
          onChange={(e) => {
            onQuestionChange(e.target.value);
            // Clear error when user modifies text
            if (addQuestionError) {
              // Note: Error clearing would be handled by parent component
            }
            // Hide tooltip if question is now complete
            const hasText = e.target.value.trim() !== "";
            const hasEnoughOptions = filledOptionsCount >= 2;
            if (hasText && hasEnoughOptions && onTooltipVisibilityChange) {
              onTooltipVisibilityChange(false);
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
        {question.text.length >= MAX_QUESTION_LENGTH && (
          <div className="absolute bottom-1 right-1 text-xs text-red-500 bg-red-100 px-1 rounded">
            {question.text.length}/{MAX_QUESTION_LENGTH}
          </div>
        )}
      </div>
    </div>
  );
}