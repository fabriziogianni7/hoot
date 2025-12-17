"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { generateQuizViaAI } from "@/lib/supabase-client";
import type { GenerateQuizResponse } from "@/lib/backend-types";
import Footer from "@/components/Footer";

export default function GenerateAIQuestionPage() {
  const router = useRouter();
  const [topic, setTopic] = useState("");
  const [questionCount, setQuestionCount] = useState(3);
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard">("medium");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState("");

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const fileArray = Array.from(files);
    
    // Validate file count
    if (fileArray.length + selectedFiles.length > 3) {
      setError("Maximum 3 files allowed");
      return;
    }

    // Validate file size (5MB each)
    const invalidFiles = fileArray.filter(file => file.size > 5 * 1024 * 1024);
    if (invalidFiles.length > 0) {
      setError("Each file must be 5MB or less");
      return;
    }

    // Validate file types
    const validTypes = ["application/pdf", "text/plain"];
    const invalidTypes = fileArray.filter(file => !validTypes.includes(file.type));
    if (invalidTypes.length > 0) {
      setError("Only PDF or text files are allowed");
      return;
    }

    setError("");
    setSelectedFiles([...selectedFiles, ...fileArray]);
  };

  const removeFile = (index: number) => {
    setSelectedFiles(selectedFiles.filter((_, i) => i !== index));
  };

  const handleGenerate = async () => {
    if (!topic.trim()) {
      setError("Please enter a topic");
      return;
    }

    try {
      setIsGenerating(true);
      setError("");

      // Convert files to base64 if any
      const documents = await Promise.all(
        selectedFiles.map(async (file) => {
          const content = await file.text();
          return {
            name: file.name,
            content: content,
          };
        })
      );

      const response: GenerateQuizResponse = await generateQuizViaAI(
        topic.trim(),
        questionCount,
        difficulty,
        undefined,
        documents.length > 0 ? documents : undefined
      );

      if (response.success && response.quiz) {
        // Encode the quiz data in the URL to pass to admin page
        const quizData = encodeURIComponent(
          JSON.stringify({
            title: response.quiz.title || topic,
            description: response.quiz.description,
            questions: response.quiz.questions,
          })
        );

        // Navigate to admin page with quiz data
        router.push(`/quiz/admin?aiQuiz=${quizData}`);
      } else {
        setError("Failed to generate quiz. Please try again.");
      }
    } catch (err) {
      console.error("Error generating quiz:", err);
      setError(
        err instanceof Error ? err.message : "Failed to generate quiz. Please try again."
      );
    } finally {
      setIsGenerating(false);
    }
  };

  const difficultyOptions = [
    { value: "easy" as const, label: "Easy", emoji: "😊" },
    { value: "medium" as const, label: "Medium", emoji: "😐" },
    { value: "hard" as const, label: "Hard", emoji: "😤" },
  ];

  return (
    <div className="min-h-screen bg-[var(--color-background)] text-[var(--color-text)]">
      <div className="container mx-auto px-4 py-6 pb-24">
        {/* Back button */}
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            try {
              router.back();
            } catch {
              router.push("/quiz/admin");
            }
          }}
          className="btn btn--secondary mb-6"
          style={{
            position: "relative",
            zIndex: 100,
            pointerEvents: "auto",
          }}
        >
          <svg
            className="w-4 h-4 mr-2"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
          Back
        </button>

        {/* Title */}
        <h1 className="text-3xl font-bold mb-2">Generate Quiz with AI</h1>
        <p className="text-[var(--color-text-secondary)] mb-8">
          Let AI create your quiz questions
        </p>

        {/* Form */}
        <div className="space-y-6">
          {/* Topic Input */}
          <div>
            <label className="block text-[var(--color-text)] mb-2">
              Topic <span className="text-[var(--color-error)]">*</span>
            </label>
            <input
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="Enter quiz topic"
              className="w-full px-4 py-3 rounded-lg bg-[var(--color-surface)] border border-[var(--color-primary)] text-[var(--color-text)] placeholder-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
            />
          </div>

          {/* Number of Questions Slider */}
          <div>
            <label className="block text-[var(--color-text)] mb-2">
              Number of Questions: {questionCount}
            </label>
            <div className="flex items-center gap-4">
              <span className="text-[var(--color-text-secondary)] text-sm">1</span>
              <input
                type="range"
                min="1"
                max="10"
                value={questionCount}
                onChange={(e) => setQuestionCount(Number(e.target.value))}
                className="flex-1 h-2 bg-[var(--color-surface)] rounded-lg appearance-none cursor-pointer"
                style={{
                  background: `linear-gradient(to right, var(--color-primary) 0%, var(--color-primary) ${((questionCount - 1) / 9) * 100}%, var(--color-surface) ${((questionCount - 1) / 9) * 100}%, var(--color-surface) 100%)`,
                }}
              />
              <span className="text-[var(--color-text-secondary)] text-sm">10</span>
            </div>
          </div>

          {/* Difficulty Level Dropdown */}
          <div>
            <label className="block text-[var(--color-text)] mb-2">
              Difficulty Level
            </label>
            <select
              value={difficulty}
              onChange={(e) =>
                setDifficulty(e.target.value as "easy" | "medium" | "hard")
              }
              className="w-full px-4 py-3 rounded-lg bg-[var(--color-surface)] border border-[var(--color-primary)] text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] appearance-none cursor-pointer"
            >
              {difficultyOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.emoji} {option.label}
                </option>
              ))}
            </select>
          </div>

          {/* Upload Documents */}
          <div>
            <label className="block text-[var(--color-text)] mb-2">
              Upload Documents (Optional)
            </label>
            <p className="text-[var(--color-text-secondary)] text-sm mb-3">
              PDF or text files, max 3 files, 5MB each.
            </p>
            <div className="border border-[var(--color-border)] rounded-lg p-4 bg-[var(--color-surface)]">
              <div className="flex items-center gap-4">
                <label className="btn btn--secondary cursor-pointer">
                  Browse...
                  <input
                    type="file"
                    multiple
                    accept=".pdf,.txt"
                    onChange={handleFileChange}
                    className="hidden"
                    disabled={selectedFiles.length >= 3}
                  />
                </label>
                <span className="text-[var(--color-text-secondary)]">
                  {selectedFiles.length === 0
                    ? "No files selected."
                    : `${selectedFiles.length} file${selectedFiles.length > 1 ? "s" : ""} selected.`}
                </span>
              </div>
              {selectedFiles.length > 0 && (
                <div className="mt-4 space-y-2">
                  {selectedFiles.map((file, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-2 bg-[var(--color-background)] rounded border border-[var(--color-border)]"
                    >
                      <span className="text-[var(--color-text-secondary)] text-sm">
                        {file.name}
                      </span>
                      <button
                        onClick={() => removeFile(index)}
                        className="text-[var(--color-error)] hover:text-[var(--color-error)] opacity-80 hover:opacity-100"
                      >
                        <svg
                          className="w-4 h-4"
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
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-[var(--color-error)]/20 border border-[var(--color-error)] rounded-lg p-3">
              <p className="text-[var(--color-error)] text-sm">{error}</p>
            </div>
          )}

          {/* Generate Button */}
          <button
            onClick={handleGenerate}
            disabled={isGenerating || !topic.trim()}
            className="w-full btn btn--primary py-4 text-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isGenerating ? "Generating Questions..." : "Generate Questions"}
          </button>
        </div>
      </div>

      <Footer />
    </div>
  );
}

