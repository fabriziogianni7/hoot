import { useState } from "react";

// Character limits for quiz content
const MAX_ANSWER_LENGTH = 200;

interface QuestionOption {
  text: string;
  color: string;
}

interface QuizAnswerOptionsProps {
  options: QuestionOption[];
  correctAnswer: number;
  onOptionChange: (index: number, text: string) => void;
  onCorrectAnswerChange: (index: number) => void;
}

export default function QuizAnswerOptions({
  options,
  correctAnswer,
  onOptionChange,
  onCorrectAnswerChange,
}: QuizAnswerOptionsProps) {
  const colors = ["#0DCEFB", "#53DB1E", "#FDCC0E", "#F70000"];

  return (
    <div className="w-full max-w-md flex flex-col gap-4 mb-8">
      {options.map((option, index) => {
        const isCorrect = correctAnswer === index;
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
            onClick={() => onCorrectAnswerChange(index)}
          >
            {/* Correct answer indicator - much larger and more visible */}
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
                onChange={(e) => onOptionChange(index, e.target.value)}
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
  );
}