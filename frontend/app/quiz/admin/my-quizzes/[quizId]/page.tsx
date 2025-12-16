"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { useSupabase } from "@/lib/supabase-context";
import StatusBadge from "@/components/StatusBadge";
import { callEdgeFunction } from "@/lib/supabase-client";

type QuizDetail = {
  id: string;
  title: string;
  description: string | null;
  status: "pending" | "active" | "completed" | "cancelled";
  scheduled_start_time: string | null;
  created_at: string;
  started_at: string | null;
  ended_at: string | null;
  prize_amount: number;
  prize_token: string | null;
};

type QuestionRow = {
  id: string;
  question_text: string;
  options: string[];
  correct_answer_index: number;
  order_index: number;
  time_limit: number;
};

type GameSessionRow = {
  id: string;
  room_code: string;
  status: string;
  created_at: string;
  started_at: string | null;
  ended_at: string | null;
};

export default function QuizDetailPage() {
  const router = useRouter();
  const params = useParams<{ quizId: string }>();
  const { supabase } = useSupabase();

  const [quiz, setQuiz] = useState<QuizDetail | null>(null);
  const [questions, setQuestions] = useState<QuestionRow[]>([]);
  const [sessions, setSessions] = useState<GameSessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scheduleInput, setScheduleInput] = useState<string>("");
  const [scheduleMessage, setScheduleMessage] = useState<string | null>(null);
  const [scheduling, setScheduling] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const quizId = params?.quizId;

  const localIsoValue = (value: string) => {
    const date = new Date(value);
    const offset = date.getTimezoneOffset();
    const local = new Date(date.getTime() - offset * 60_000);
    return local.toISOString().slice(0, 16);
  };

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!quizId) return;
      setLoading(true);
      setError(null);
      try {
        const { data: quizRow, error: quizError } = await supabase
          .from("quizzes")
          .select(
            "id,title,description,status,scheduled_start_time,created_at,started_at,ended_at,prize_amount,prize_token"
          )
          .eq("id", quizId)
          .single();

        if (quizError || !quizRow) {
          throw quizError || new Error("Quiz not found");
        }

        const { data: questionRows, error: questionsError } = await supabase
          .from("questions")
          .select("*")
          .eq("quiz_id", quizId)
          .order("order_index", { ascending: true });

        if (questionsError) {
          throw questionsError;
        }

        const { data: sessionRows, error: sessionsError } = await supabase
          .from("game_sessions")
          .select("id,room_code,status,created_at,started_at,ended_at")
          .eq("quiz_id", quizId)
          .order("created_at", { ascending: false });

        if (sessionsError) {
          throw sessionsError;
        }

        if (!cancelled) {
          setQuiz(quizRow as QuizDetail);
          setQuestions((questionRows as QuestionRow[]) || []);
          setSessions((sessionRows as GameSessionRow[]) || []);
          if (quizRow.scheduled_start_time) {
            setScheduleInput(localIsoValue(quizRow.scheduled_start_time));
          } else {
            setScheduleInput("");
          }
        }
      } catch (err) {
        console.error("Failed to load quiz detail:", err);
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load quiz details"
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [quizId, supabase]);

  const formatDate = useMemo(
    () => (value: string | null, fallback = "—") => {
      if (!value) return fallback;
      return new Date(value).toLocaleString();
    },
    []
  );

  const handleSchedule = async () => {
    if (!quiz || !scheduleInput) {
      setScheduleMessage("Please choose a schedule time");
      return;
    }

    try {
      setScheduling(true);
      setScheduleMessage(null);
      console.log("Scheduling quiz from detail page", {
        quizId: quiz.id,
        scheduleInput,
      });
      await callEdgeFunction("schedule-quiz-start", {
        quiz_id: quiz.id,
        scheduled_start_time: new Date(scheduleInput).toISOString(),
      });

      setScheduleMessage("Quiz scheduled successfully");
      setQuiz({ ...quiz, scheduled_start_time: new Date(scheduleInput).toISOString() });
    } catch (err) {
      console.error("Failed to schedule quiz:", err);
      setScheduleMessage(
        err instanceof Error ? err.message : "Failed to schedule quiz"
      );
    } finally {
      setScheduling(false);
    }
  };

  const handleCancelSchedule = async () => {
    if (!quiz) return;

    try {
      setScheduling(true);
      setScheduleMessage(null);
      console.log("Cancelling scheduled start from detail page", {
        quizId: quiz.id,
      });
      await callEdgeFunction("cancel-scheduled-start", { quiz_id: quiz.id });
      setScheduleMessage("Scheduled start cancelled");
      setQuiz({ ...quiz, scheduled_start_time: null });
      setScheduleInput("");
    } catch (err) {
      console.error("Failed to cancel schedule:", err);
      setScheduleMessage(
        err instanceof Error ? err.message : "Failed to cancel schedule"
      );
    } finally {
      setScheduling(false);
    }
  };

  const handleDelete = async () => {
    if (!quiz || !supabase) return;

    try {
      setIsDeleting(true);
      const { error } = await supabase
        .from("quizzes")
        .delete()
        .eq("id", quiz.id);

      if (error) throw error;

      // Redirect to profile page after successful deletion
      router.push("/quiz/profile");
    } catch (err) {
      console.error("Failed to delete quiz:", err);
      setError(
        err instanceof Error ? err.message : "Failed to delete quiz"
      );
      setShowDeleteConfirm(false);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="min-h-screen w-full relative overflow-hidden" style={{ backgroundColor: "var(--color-background)", color: "var(--color-text)" }}>
      {/* Back button - top left */}
      <div
        style={{
          position: "absolute",
          top: "var(--spacing-md)",
          left: "var(--spacing-md)",
          zIndex: 100,
          pointerEvents: "auto",
        }}
      >
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log("Back button clicked");
            try {
              if (window.history.length > 1) {
                window.history.back();
              } else {
                router.push("/quiz/admin/my-quizzes");
              }
            } catch (err) {
              console.error("Error navigating back:", err);
              router.push("/quiz/admin/my-quizzes");
            }
          }}
          className="btn btn--secondary"
          style={{
            padding: "var(--spacing-sm) var(--spacing-md)",
            minWidth: "auto",
            fontSize: "var(--font-size-body)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
          }}
          aria-label="Back"
          type="button"
        >
          Back
        </button>
      </div>

      {/* Logo centered */}
      <div className="absolute left-1/2 transform -translate-x-1/2 z-20">
        <img
          src="/Logo.png"
          alt="Hoot Logo"
          className="h-28 w-auto cursor-pointer hover:opacity-80 transition-opacity"
          onClick={() => router.push('/')}
        />
      </div>

      <div className="max-w-3xl mx-auto space-y-6 px-4" style={{ paddingTop: "calc(var(--spacing-xl) + 7rem)" }}>

        {loading ? (
          <div style={{ color: "var(--color-text-secondary)" }}>Loading quiz details...</div>
        ) : error ? (
          <div className="text-red-400">{error}</div>
        ) : quiz ? (
          <>
            <div className="rounded-lg p-6 space-y-4" style={{ backgroundColor: "var(--color-surface-elevated)", border: "1px solid var(--color-border-light)" }}>
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-semibold">{quiz.title}</h1>
                  <p className="text-sm mt-1" style={{ color: "var(--color-text-secondary)" }}>
                    {quiz.description || "No description provided."}
                  </p>
                </div>
                <StatusBadge status={quiz.status} />
              </div>
              <div className="grid md:grid-cols-3 gap-4 text-sm" style={{ color: "var(--color-text-secondary)" }}>
                <div>
                  <p className="text-xs uppercase" style={{ color: "var(--color-text-muted)" }}>Created</p>
                  {formatDate(quiz.created_at)}
                </div>
                <div>
                  <p className="text-xs uppercase" style={{ color: "var(--color-text-muted)" }}>Started</p>
                  {formatDate(quiz.started_at)}
                </div>
                <div>
                  <p className="text-xs uppercase" style={{ color: "var(--color-text-muted)" }}>Completed</p>
                  {formatDate(quiz.ended_at)}
                </div>
                <div>
                  <p className="text-xs uppercase" style={{ color: "var(--color-text-muted)" }}>Scheduled</p>
                  {quiz.scheduled_start_time
                    ? formatDate(quiz.scheduled_start_time)
                    : "Not scheduled"}
                </div>
                <div>
                  <p className="text-xs uppercase" style={{ color: "var(--color-text-muted)" }}>Prize</p>
                  {quiz.prize_amount || 0} {quiz.prize_token ? "Token" : "ETH"}
                </div>
              </div>
              <div className="pt-2">
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  disabled={isDeleting}
                  className="px-4 py-2 rounded text-sm font-medium bg-red-600/80 hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  aria-label="Delete quiz"
                >
                  {isDeleting ? "Deleting..." : "Delete Quiz"}
                </button>
              </div>
            </div>

            {quiz.status === "pending" && (
              <div className="rounded-lg p-6 space-y-3" style={{ backgroundColor: "var(--color-surface-elevated)", border: "1px solid var(--color-primary-medium)" }}>
                <h2 className="text-lg font-semibold">Schedule Start</h2>
                <input
                  type="datetime-local"
                  value={scheduleInput}
                  onChange={(e) => setScheduleInput(e.target.value)}
                  className="w-full rounded-md border border-white/20 bg-transparent px-3 py-2 text-sm focus:border-white/60 focus:outline-none"
                  min={localIsoValue(new Date(Date.now() + 60_000).toISOString())}
                />
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={handleSchedule}
                    disabled={!scheduleInput || scheduling}
                    className="px-4 py-2 rounded disabled:opacity-50 text-sm transition-colors"
                    style={{ backgroundColor: "var(--color-primary)", color: "var(--color-text)" }}
                    onMouseEnter={(e) => {
                      if (!scheduling && scheduleInput) {
                        e.currentTarget.style.backgroundColor = "var(--color-primary-hover)";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!scheduling && scheduleInput) {
                        e.currentTarget.style.backgroundColor = "var(--color-primary)";
                      }
                    }}
                  >
                    {scheduling ? "Scheduling..." : "Schedule Start"}
                  </button>
                  {quiz.scheduled_start_time && (
                    <button
                      onClick={handleCancelSchedule}
                      disabled={scheduling}
                      className="px-4 py-2 rounded border border-white/30 hover:border-white text-sm"
                    >
                      {scheduling ? "Cancelling..." : "Cancel Schedule"}
                    </button>
                  )}
                </div>
                {scheduleMessage && (
                  <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>{scheduleMessage}</p>
                )}
              </div>
            )}

            <div className="rounded-lg p-6 space-y-4" style={{ backgroundColor: "var(--color-surface-elevated)", border: "1px solid var(--color-border-light)" }}>
              <h2 className="text-lg font-semibold">Questions</h2>
              {questions.length === 0 ? (
                <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>No questions found.</p>
              ) : (
                <div className="space-y-4">
                  {questions.map((question, idx) => (
                    <div
                      key={question.id}
                      className="border border-white/10 rounded-lg p-4 space-y-2"
                    >
                      <div className="text-sm uppercase" style={{ color: "var(--color-text-muted)" }}>
                        Question {idx + 1}
                      </div>
                      <div className="font-medium">{question.question_text}</div>
                      <ul className="list-decimal list-inside text-sm space-y-1" style={{ color: "var(--color-text-secondary)" }}>
                        {question.options?.map((option, optionIdx) => (
                          <li
                            key={`${question.id}-${optionIdx}`}
                            style={{
                              color: optionIdx === question.correct_answer_index ? "var(--color-success)" : "var(--color-text-secondary)",
                            }}
                          >
                            {option || "—"}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-lg p-6 space-y-4" style={{ backgroundColor: "var(--color-surface-elevated)", border: "1px solid var(--color-border-light)" }}>
              <h2 className="text-lg font-semibold">Game Sessions</h2>
              {sessions.length === 0 ? (
                <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>No game sessions yet.</p>
              ) : (
                <div className="space-y-3">
                  {sessions.map((session) => (
                    <div
                      key={session.id}
                      className="border border-white/10 rounded-lg p-4 grid md:grid-cols-4 gap-3 text-sm"
                    >
                      <div>
                        <p className="text-xs uppercase" style={{ color: "var(--color-text-muted)" }}>
                          Room Code
                        </p>
                        {session.room_code}
                      </div>
                      <div>
                        <p className="text-xs uppercase" style={{ color: "var(--color-text-muted)" }}>
                          Status
                        </p>
                        {session.status}
                      </div>
                      <div>
                        <p className="text-xs uppercase" style={{ color: "var(--color-text-muted)" }}>
                          Started
                        </p>
                        {formatDate(session.started_at)}
                      </div>
                      <div>
                        <p className="text-xs uppercase" style={{ color: "var(--color-text-muted)" }}>
                          Ended
                        </p>
                        {formatDate(session.ended_at)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : null}

        {/* Delete confirmation modal */}
        {showDeleteConfirm && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              backgroundColor: "rgba(0, 0, 0, 0.75)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 1000,
              padding: "var(--spacing-md)",
            }}
            onClick={() => !isDeleting && setShowDeleteConfirm(false)}
          >
            <div
              className="rounded-lg p-6 max-w-md w-full"
              style={{ backgroundColor: "var(--color-surface-elevated)", border: "1px solid var(--color-border)", zIndex: 1001 }}
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-xl font-semibold mb-4">Delete Quiz?</h2>
              <p className="mb-6" style={{ color: "var(--color-text-secondary)" }}>
                Are you sure you want to delete &quot;{quiz?.title}&quot;? This action cannot be undone and will permanently remove the quiz and all its questions.
              </p>
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={isDeleting}
                  className="px-4 py-2 rounded border border-white/30 hover:border-white text-sm disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="px-4 py-2 rounded bg-red-600/80 hover:bg-red-600 text-sm disabled:opacity-50"
                >
                  {isDeleting ? "Deleting..." : "Delete"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

