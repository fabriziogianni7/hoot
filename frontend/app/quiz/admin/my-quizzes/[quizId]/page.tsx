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

  return (
    <div className="min-h-screen w-full bg-black text-white relative overflow-hidden px-4 py-12">
      <div className="max-w-5xl mx-auto space-y-6">
        <button
          onClick={() => router.back()}
          className="text-sm text-gray-300 hover:text-white flex items-center gap-2"
        >
          ← Back
        </button>

        {loading ? (
          <div className="text-gray-300">Loading quiz details...</div>
        ) : error ? (
          <div className="text-red-400">{error}</div>
        ) : quiz ? (
          <>
            <div className="bg-gray-900/40 border border-white/10 rounded-lg p-6 space-y-4">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-semibold">{quiz.title}</h1>
                  <p className="text-gray-300 text-sm mt-1">
                    {quiz.description || "No description provided."}
                  </p>
                </div>
                <StatusBadge status={quiz.status} />
              </div>
              <div className="grid md:grid-cols-3 gap-4 text-sm text-gray-200">
                <div>
                  <p className="text-gray-400 text-xs uppercase">Created</p>
                  {formatDate(quiz.created_at)}
                </div>
                <div>
                  <p className="text-gray-400 text-xs uppercase">Started</p>
                  {formatDate(quiz.started_at)}
                </div>
                <div>
                  <p className="text-gray-400 text-xs uppercase">Completed</p>
                  {formatDate(quiz.ended_at)}
                </div>
                <div>
                  <p className="text-gray-400 text-xs uppercase">Scheduled</p>
                  {quiz.scheduled_start_time
                    ? formatDate(quiz.scheduled_start_time)
                    : "Not scheduled"}
                </div>
                <div>
                  <p className="text-gray-400 text-xs uppercase">Prize</p>
                  {quiz.prize_amount || 0} {quiz.prize_token ? "Token" : "ETH"}
                </div>
              </div>
            </div>

            {quiz.status === "pending" && (
              <div className="bg-gray-900/40 border border-purple-500/30 rounded-lg p-6 space-y-3">
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
                    className="px-4 py-2 rounded bg-purple-600/80 hover:bg-purple-600 disabled:opacity-50 text-sm"
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
                  <p className="text-sm text-gray-200">{scheduleMessage}</p>
                )}
              </div>
            )}

            <div className="bg-gray-900/40 border border-white/10 rounded-lg p-6 space-y-4">
              <h2 className="text-lg font-semibold">Questions</h2>
              {questions.length === 0 ? (
                <p className="text-gray-300 text-sm">No questions found.</p>
              ) : (
                <div className="space-y-4">
                  {questions.map((question, idx) => (
                    <div
                      key={question.id}
                      className="border border-white/10 rounded-lg p-4 space-y-2"
                    >
                      <div className="text-sm uppercase text-gray-400">
                        Question {idx + 1}
                      </div>
                      <div className="font-medium">{question.question_text}</div>
                      <ul className="list-decimal list-inside text-sm text-gray-300 space-y-1">
                        {question.options?.map((option, optionIdx) => (
                          <li
                            key={`${question.id}-${optionIdx}`}
                            className={
                              optionIdx === question.correct_answer_index
                                ? "text-emerald-300"
                                : ""
                            }
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

            <div className="bg-gray-900/40 border border-white/10 rounded-lg p-6 space-y-4">
              <h2 className="text-lg font-semibold">Game Sessions</h2>
              {sessions.length === 0 ? (
                <p className="text-gray-300 text-sm">No game sessions yet.</p>
              ) : (
                <div className="space-y-3">
                  {sessions.map((session) => (
                    <div
                      key={session.id}
                      className="border border-white/10 rounded-lg p-4 grid md:grid-cols-4 gap-3 text-sm"
                    >
                      <div>
                        <p className="text-gray-400 text-xs uppercase">
                          Room Code
                        </p>
                        {session.room_code}
                      </div>
                      <div>
                        <p className="text-gray-400 text-xs uppercase">
                          Status
                        </p>
                        {session.status}
                      </div>
                      <div>
                        <p className="text-gray-400 text-xs uppercase">
                          Started
                        </p>
                        {formatDate(session.started_at)}
                      </div>
                      <div>
                        <p className="text-gray-400 text-xs uppercase">
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
      </div>
    </div>
  );
}

