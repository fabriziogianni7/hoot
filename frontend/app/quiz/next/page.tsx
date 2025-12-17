"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSupabase } from "@/lib/supabase-context";
import { getTokensForNetwork } from "@/lib/token-config";
import Footer from "@/components/Footer";

type UpcomingQuiz = {
  quizId: string;
  title: string;
  scheduled_start_time: string;
  prize_amount?: number | null;
  prize_token?: string | null;
  network_id?: number | null;
  roomCode?: string | null;
};

export default function UpcomingQuizzesPage() {
  const router = useRouter();
  const { supabase } = useSupabase();
  const [upcomingQuizzes, setUpcomingQuizzes] = useState<UpcomingQuiz[]>([]);
  const [timeRemaining, setTimeRemaining] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(true);

  // Fetch upcoming quizzes
  useEffect(() => {
    let cancelled = false;

    const fetchUpcomingQuizzes = async () => {
      if (!supabase) return;

      try {
        setIsLoading(true);
        const nowIso = new Date().toISOString();
        
        const { data: quizzes, error: quizError } = await supabase
          .from("quizzes")
          .select(
            "id,title,scheduled_start_time,is_private,status,prize_amount,prize_token,network_id,game_sessions(room_code)"
          )
          .eq("is_private", false)
          .not("scheduled_start_time", "is", null)
          .gt("scheduled_start_time", nowIso)
          .in("status", ["pending", "starting"])
          .order("scheduled_start_time", { ascending: true })
          .limit(50);

        if (quizError || !quizzes) {
          console.error("Error fetching upcoming quizzes:", quizError);
          if (!cancelled) setUpcomingQuizzes([]);
          return;
        }

        const quizRows = quizzes as {
          id: string;
          title: string;
          scheduled_start_time: string | null;
          prize_amount?: number | null;
          prize_token?: string | null;
          network_id?: number | null;
          game_sessions?: Array<{ room_code: string }> | null;
        }[];

        const filtered: UpcomingQuiz[] = [];
        for (const quiz of quizRows) {
          if (!quiz.scheduled_start_time) continue;
          const scheduledTime = new Date(quiz.scheduled_start_time).getTime();
          const diff = scheduledTime - Date.now();
          if (diff <= 0) continue;

          // Get the first game session's room_code if available
          const roomCode = quiz.game_sessions && quiz.game_sessions.length > 0 
            ? quiz.game_sessions[0].room_code 
            : null;

          filtered.push({
            quizId: quiz.id,
            title: quiz.title,
            scheduled_start_time: quiz.scheduled_start_time,
            prize_amount: quiz.prize_amount ?? null,
            prize_token: quiz.prize_token ?? null,
            network_id: quiz.network_id ?? null,
            roomCode: roomCode,
          });
        }

        if (!cancelled) {
          setUpcomingQuizzes(filtered);
        }
      } catch (err) {
        console.error("Error loading upcoming quizzes:", err);
        if (!cancelled) setUpcomingQuizzes([]);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    fetchUpcomingQuizzes();

    return () => {
      cancelled = true;
    };
  }, [supabase]);

  // Countdown timer for upcoming quizzes
  useEffect(() => {
    if (upcomingQuizzes.length === 0) return;

    const updateTimers = () => {
      const newTimeRemaining: Record<string, number> = {};
      upcomingQuizzes.forEach((quiz) => {
        const scheduledTime = new Date(quiz.scheduled_start_time).getTime();
        const diff = scheduledTime - Date.now();
        newTimeRemaining[quiz.quizId] = Math.max(0, diff);
      });
      setTimeRemaining(newTimeRemaining);
    };

    updateTimers();
    const interval = setInterval(updateTimers, 1000);

    return () => clearInterval(interval);
  }, [upcomingQuizzes]);

  // Format time remaining
  const formatTimeRemaining = (ms: number) => {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    
    if (days > 0) {
      return `${days}d ${hours}h`;
    } else if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    } else {
      return `${seconds}s`;
    }
  };

  // Get prize label
  const getPrizeLabel = (quiz: UpcomingQuiz) => {
    if (
      quiz.prize_amount == null ||
      !quiz.prize_token ||
      !quiz.network_id
    ) {
      return null;
    }

    const tokens = getTokensForNetwork(quiz.network_id);
    const token = tokens.find(
      (t) => t.address.toLowerCase() === quiz.prize_token!.toLowerCase()
    );

    if (!token) {
      return null;
    }

    // Show full prize amount with all decimals, remove only trailing zeros
    const prizeAmountStr = typeof quiz.prize_amount === 'number' 
      ? quiz.prize_amount.toString() 
      : String(quiz.prize_amount);
    
    // Remove trailing zeros but keep decimal point if there are significant decimals
    const formattedAmount = prizeAmountStr.includes('.') 
      ? prizeAmountStr.replace(/\.?0+$/, '')
      : prizeAmountStr;
    
    return `${formattedAmount} ${token.symbol}`;
  };

  // Format scheduled time
  const formatScheduledTime = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        width: "100%",
        backgroundColor: "var(--color-background)",
        color: "var(--color-text)",
        paddingBottom: "80px", // Space for footer
        position: "relative",
      }}
    >
      {/* Back button */}
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          try {
            router.back();
          } catch (err) {
            console.error("Error navigating back:", err);
            router.push("/");
          }
        }}
        className="btn btn--secondary"
        style={{
          position: "absolute",
          top: "var(--spacing-md)",
          left: "var(--spacing-md)",
          zIndex: 100,
          cursor: "pointer",
          pointerEvents: "auto",
        }}
      >
        Back
      </button>

      {/* Logo */}
      <div
        style={{
          position: "relative",
          zIndex: 10,
          display: "flex",
          justifyContent: "center",
          paddingTop: "var(--spacing-xl)",
          marginBottom: "var(--spacing-lg)",
        }}
      >
        <img
          src="/Logo.png"
          alt="Hoot Logo"
          style={{
            height: "140px",
            width: "auto",
          }}
        />
      </div>

      {/* Header */}
      <div
        style={{
          padding: "0 var(--spacing-md) var(--spacing-lg)",
          paddingTop: "0",
          borderBottom: "1px solid var(--color-border)",
        }}
      >
        <h1 className="text-h1">Upcoming Quizzes</h1>
        <p className="text-body" style={{ color: "var(--color-text-secondary)", marginTop: "var(--spacing-xs)" }}>
          Scheduled quizzes you can join
        </p>
      </div>

      {/* Content */}
      <div
        style={{
          padding: "var(--spacing-lg) var(--spacing-md)",
          maxWidth: "600px",
          margin: "0 auto",
        }}
      >
        {isLoading ? (
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              padding: "var(--spacing-2xl)",
            }}
          >
            <div
              style={{
                width: "3rem",
                height: "3rem",
                border: "4px solid var(--color-primary-medium)",
                borderTopColor: "var(--color-primary)",
                borderRadius: "50%",
                animation: "spin 1s linear infinite",
              }}
            />
            <style>{`
              @keyframes spin {
                to { transform: rotate(360deg); }
              }
            `}</style>
          </div>
        ) : upcomingQuizzes.length === 0 ? (
          <div
            className="card"
            style={{
              textAlign: "center",
              padding: "var(--spacing-2xl)",
              borderColor: "var(--color-primary)",
            }}
          >
            <p className="text-body" style={{ color: "var(--color-text-secondary)" }}>
              No upcoming quizzes scheduled at the moment.
            </p>
          </div>
        ) : (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "var(--spacing-md)",
            }}
          >
            {upcomingQuizzes.map((quiz) => (
              <div
                key={quiz.quizId}
                className="card"
                style={{
                  padding: "var(--spacing-lg)",
                  borderColor: "var(--color-primary)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "var(--spacing-sm)",
                  }}
                >
                  <h3 className="text-h2" style={{ marginBottom: "var(--spacing-xs)" }}>
                    {quiz.title}
                  </h3>
                  
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "var(--spacing-xs)",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "var(--spacing-xs)",
                      }}
                    >
                      <span style={{ fontSize: "0.875rem", color: "var(--color-text-secondary)" }}>
                        Starts in:
                      </span>
                      <span
                        className="text-body"
                        style={{
                          fontWeight: 600,
                          color: "var(--color-primary)",
                        }}
                      >
                        {formatTimeRemaining(timeRemaining[quiz.quizId] || 0)}
                      </span>
                    </div>
                    
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "var(--spacing-xs)",
                      }}
                    >
                      <span style={{ fontSize: "0.875rem", color: "var(--color-text-secondary)" }}>
                        Scheduled for:
                      </span>
                      <span className="text-body" style={{ fontSize: "0.875rem" }}>
                        {formatScheduledTime(quiz.scheduled_start_time)}
                      </span>
                    </div>

                    {getPrizeLabel(quiz) && (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "var(--spacing-xs)",
                          marginTop: "var(--spacing-xs)",
                        }}
                      >
                        <span style={{ fontSize: "0.875rem", color: "var(--color-text-secondary)" }}>
                          Prize:
                        </span>
                        <span
                          className="text-body"
                          style={{
                            fontWeight: 600,
                            color: "var(--color-success)",
                          }}
                        >
                          {getPrizeLabel(quiz)}
                        </span>
                      </div>
                    )}
                  </div>

                  <button
                    onClick={() => {
                      if (quiz.roomCode) {
                        router.push(`/quiz/lobby/${quiz.roomCode}`);
                      } else {
                        // If no room code yet, show a message or create a game session
                        // For now, we'll just show an error or disable the button
                        alert("Quiz lobby is not available yet. Please wait for the quiz to start.");
                      }
                    }}
                    className="btn btn--primary"
                    style={{
                      marginTop: "var(--spacing-md)",
                      width: "100%",
                    }}
                    disabled={!quiz.roomCode}
                  >
                    Jump in
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Footer />
    </div>
  );
}

