"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/use-auth";
import { useSupabase } from "@/lib/supabase-context";
import Footer from "@/components/Footer";
import { callEdgeFunction } from "@/lib/supabase-client";
import { getTokensForNetwork } from "@/lib/token-config";

type QuizRow = {
  id: string;
  title: string;
  status: "pending" | "active" | "completed" | "cancelled";
  created_at: string;
  prize_amount: number;
  prize_token: string | null;
  network_id?: number | null;
};

type UserQuizzesResponse = {
  success: boolean;
  quizzes: QuizRow[];
  total: number;
};

export default function ProfilePage() {
  const router = useRouter();
  const { loggedUser } = useAuth();
  const { supabase } = useSupabase();
  const [activeTab, setActiveTab] = useState<"created" | "played">("created");
  const [createdQuizzes, setCreatedQuizzes] = useState<QuizRow[]>([]);
  const [playedQuizzes, setPlayedQuizzes] = useState<QuizRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [createdCount, setCreatedCount] = useState(0);
  const [playedCount, setPlayedCount] = useState(0);

  // Fetch created quizzes
  useEffect(() => {
    if (!loggedUser?.isAuthenticated || !supabase) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    const fetchQuizzes = async () => {
      try {
        setIsLoading(true);

        // Fetch created quizzes
        const createdResponse = await callEdgeFunction<
          Record<string, unknown>,
          UserQuizzesResponse
        >("get-user-quizzes", {
          status: "all",
          page: 1,
          page_size: 100,
        });

        if (!cancelled) {
          setCreatedQuizzes(createdResponse.quizzes || []);
          setCreatedCount(createdResponse.total || 0);
        }

        // Fetch played quizzes (game sessions where user participated)
        if (loggedUser.address) {
          const { data: playerSessions } = await supabase
            .from("player_sessions")
            .select("game_session_id, quizzes(id, title, status, created_at, prize_amount, prize_token, network_id)")
            .eq("player_address", loggedUser.address.toLowerCase())
            .order("created_at", { ascending: false })
            .limit(100);

          if (playerSessions) {
            // Get unique quizzes
            const uniqueQuizzes = new Map<string, QuizRow>();
            for (const session of playerSessions) {
              if (session.quizzes && typeof session.quizzes === 'object' && 'id' in session.quizzes) {
                const quizData = session.quizzes as unknown as QuizRow;
                if (quizData && quizData.id && !uniqueQuizzes.has(quizData.id)) {
                  uniqueQuizzes.set(quizData.id, quizData);
                }
              }
            }
            if (!cancelled) {
              setPlayedQuizzes(Array.from(uniqueQuizzes.values()));
              setPlayedCount(uniqueQuizzes.size);
            }
          }
        }
      } catch (err) {
        console.error("Error loading profile quizzes:", err);
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    fetchQuizzes();

    return () => {
      cancelled = true;
    };
  }, [loggedUser?.isAuthenticated, loggedUser?.address, supabase]);

  // Format prize with all decimals and token symbol - no abbreviations
  const formatPrize = (quiz: QuizRow) => {
    if (quiz.prize_amount == null || !quiz.prize_token || !quiz.network_id) {
      return "Free";
    }

    const tokens = getTokensForNetwork(quiz.network_id);
    const token = tokens.find(
      (t) => t.address.toLowerCase() === quiz.prize_token!.toLowerCase()
    );

    if (!token) {
      // If token not found, show amount as-is with all decimals
      const prizeAmountStr = typeof quiz.prize_amount === 'number' 
        ? quiz.prize_amount.toString() 
        : String(quiz.prize_amount);
      // Remove trailing zeros but keep decimal point if there are significant decimals
      const formattedAmount = prizeAmountStr.includes('.') 
        ? prizeAmountStr.replace(/\.?0+$/, '')
        : prizeAmountStr;
      return formattedAmount;
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

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "2-digit",
      day: "2-digit",
      year: "numeric",
    });
  };

  const currentQuizzes = activeTab === "created" ? createdQuizzes : playedQuizzes;

  if (!loggedUser?.isAuthenticated) {
    return (
      <div
        style={{
          minHeight: "100vh",
          width: "100%",
          backgroundColor: "var(--color-background)",
          color: "var(--color-text)",
          paddingBottom: "80px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "var(--spacing-xl)",
        }}
      >
        <div className="card" style={{ textAlign: "center", maxWidth: "400px" }}>
          <h2 className="text-h2" style={{ marginBottom: "var(--spacing-md)" }}>
            Not Authenticated
          </h2>
          <p className="text-body" style={{ color: "var(--color-text-secondary)", marginBottom: "var(--spacing-lg)" }}>
            Please connect your wallet to view your profile.
          </p>
          <button
            onClick={() => router.push("/")}
            className="btn btn--primary btn--large"
            style={{ width: "100%" }}
          >
            Go to Home
          </button>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        width: "100%",
        backgroundColor: "var(--color-background)",
        color: "var(--color-text)",
        paddingBottom: "80px",
        position: "relative",
      }}
    >
      {/* Background network effect */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundImage: "url('/network-bg.svg')",
          backgroundSize: "cover",
          backgroundPosition: "center",
          opacity: 0.4,
          zIndex: 0,
        }}
      />

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

      {/* Content */}
      <div
        style={{
          position: "relative",
          zIndex: 10,
          padding: "0 var(--spacing-md)",
          maxWidth: "600px",
          margin: "0 auto",
        }}
      >
        {/* Header */}
        <div style={{ marginBottom: "var(--spacing-lg)" }}>
          <h1 className="text-h1" style={{ marginBottom: "var(--spacing-xs)" }}>
            Profile
          </h1>
          <p className="text-body" style={{ color: "var(--color-text-secondary)" }}>
            Your quizzes and game history
          </p>
        </div>

        {/* Tabs */}
        <div
          style={{
            display: "flex",
            gap: "var(--spacing-sm)",
            marginBottom: "var(--spacing-lg)",
            borderBottom: "1px solid var(--color-border)",
          }}
        >
          <button
            onClick={() => setActiveTab("created")}
            style={{
              padding: "var(--spacing-sm) var(--spacing-md)",
              border: "none",
              background: "transparent",
              color: activeTab === "created" ? "var(--color-primary)" : "var(--color-text-secondary)",
              borderBottom: activeTab === "created" ? `2px solid var(--color-primary)` : "2px solid transparent",
              cursor: "pointer",
              fontWeight: activeTab === "created" ? 600 : 400,
              transition: "all 0.2s ease",
            }}
          >
            Created ({createdCount})
          </button>
          <button
            onClick={() => setActiveTab("played")}
            style={{
              padding: "var(--spacing-sm) var(--spacing-md)",
              border: "none",
              background: "transparent",
              color: activeTab === "played" ? "var(--color-primary)" : "var(--color-text-secondary)",
              borderBottom: activeTab === "played" ? `2px solid var(--color-primary)` : "2px solid transparent",
              cursor: "pointer",
              fontWeight: activeTab === "played" ? 600 : 400,
              transition: "all 0.2s ease",
            }}
          >
            Played ({playedCount})
          </button>
        </div>

        {/* Quiz List */}
        {isLoading ? (
          <div
            style={{
              display: "flex",
              justifyContent: "center",
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
        ) : currentQuizzes.length === 0 ? (
          <div className="card" style={{ textAlign: "center", padding: "var(--spacing-2xl)", borderColor: "var(--color-primary)" }}>
            <p className="text-body" style={{ color: "var(--color-text-secondary)" }}>
              No {activeTab === "created" ? "created" : "played"} quizzes yet.
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
            {currentQuizzes.map((quiz) => (
              <div
                key={quiz.id}
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
                      <span className="text-caption" style={{ color: "var(--color-text-secondary)" }}>
                        Status:
                      </span>
                      <span className="text-body" style={{ color: "var(--color-text-secondary)" }}>
                        {quiz.status}
                      </span>
                    </div>
                    
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "var(--spacing-xs)",
                      }}
                    >
                      <span className="text-caption" style={{ color: "var(--color-text-secondary)" }}>
                        Created:
                      </span>
                      <span className="text-body" style={{ color: "var(--color-text-secondary)" }}>
                        {formatDate(quiz.created_at)}
                      </span>
                    </div>

                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "var(--spacing-xs)",
                      }}
                    >
                      <span className="text-caption" style={{ color: "var(--color-text-secondary)" }}>
                        Prize:
                      </span>
                      <span className="text-body" style={{ color: "var(--color-text-secondary)" }}>
                        {formatPrize(quiz)}
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={() => router.push(`/quiz/admin/my-quizzes/${quiz.id}`)}
                    className="btn btn--primary"
                    style={{
                      marginTop: "var(--spacing-md)",
                      width: "100%",
                    }}
                  >
                    View Details
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* View All Button - Only show for Created tab */}
        {activeTab === "created" && createdQuizzes.length > 0 && (
          <div style={{ marginTop: "var(--spacing-xl)", marginBottom: "80px" }}>
            <button
              onClick={() => router.push("/quiz/admin/my-quizzes")}
              className="btn btn--primary btn--large"
              style={{ width: "100%" }}
            >
              View all created quizzes
            </button>
          </div>
        )}
      </div>

      <Footer />
    </div>
  );
}
