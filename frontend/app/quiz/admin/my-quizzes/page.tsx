"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useMemo, useCallback } from "react";
import { useSupabase } from "@/lib/supabase-context";
import { useAccount } from "wagmi";
import { useAuth } from "@/lib/use-auth";
import { sdk } from "@farcaster/miniapp-sdk";
import { callEdgeFunction } from "@/lib/supabase-client";
import StatusBadge from "@/components/StatusBadge";
import Footer from "@/components/Footer";

type QuizRow = {
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

type UserQuizzesResponse = {
  success: boolean;
  quizzes: QuizRow[];
  total: number;
  page: number;
  page_size: number;
};

export default function MyQuizzesPage() {
  const router = useRouter();
  const { supabase } = useSupabase();
  const { address } = useAccount();
  const { loggedUser, signatureModal } = useAuth();
  const [quizzes, setQuizzes] = useState<QuizRow[] | null>(null);
  const [loading, setLoading] = useState(true);
const [fetchError, setFetchError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [confirmQuiz, setConfirmQuiz] = useState<{ id: string; title: string } | null>(null);
const [cancellingId, setCancellingId] = useState<string | null>(null);
const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "active" | "completed" | "cancelled">("all");
const [searchTerm, setSearchTerm] = useState("");
const [refreshKey, setRefreshKey] = useState(0);
const [stats, setStats] = useState({
  total: 0,
  pending: 0,
  active: 0,
  completed: 0,
  cancelled: 0,
});
const [selectedIds, setSelectedIds] = useState<string[]>([])
const [isBulkDeleting, setIsBulkDeleting] = useState(false)
const [confirmBulkDelete, setConfirmBulkDelete] = useState(false)

const updateStats = useCallback((rows: QuizRow[]) => {
  const base = {
    total: rows.length,
    pending: 0,
    active: 0,
    completed: 0,
    cancelled: 0,
  };

  rows.forEach((quiz) => {
    if (quiz.status === "pending") base.pending += 1;
    if (quiz.status === "active") base.active += 1;
    if (quiz.status === "completed") base.completed += 1;
    if (quiz.status === "cancelled") base.cancelled += 1;
  });

  setStats(base);
}, []);

const loadViaSupabase = useCallback(async (): Promise<QuizRow[]> => {
  if (!supabase) return [];
  const baseQuery = supabase
    .from("quizzes")
    .select(
      "id,title,description,status,scheduled_start_time,created_at,started_at,ended_at,prize_amount,prize_token"
    )
    .order("created_at", { ascending: false });

  const inMini = await sdk.isInMiniApp();
  if (inMini) {
    const ctx = await sdk.context;
    const fid = String((loggedUser?.fid ?? ctx?.user?.fid) ?? "");
    if (!fid) return [];
    const { data, error } = await baseQuery.eq("user_fid", fid);
    if (error) throw error;
    return (data as QuizRow[]) || [];
  }

  if (address) {
    const { data, error } = await baseQuery.eq("creator_address", address);
    if (error) throw error;
    return (data as QuizRow[]) || [];
  }

  return [];
}, [supabase, address, loggedUser?.fid]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setFetchError(null);
      try {
        const response = await callEdgeFunction<
          Record<string, unknown>,
          UserQuizzesResponse
        >("get-user-quizzes", {
          status: "all",
          page: 1,
          page_size: 100,
        });

        if (!cancelled) {
          setQuizzes(response.quizzes || []);
          updateStats(response.quizzes || []);
        }
      } catch (edgeError) {
        console.warn("Edge function get-user-quizzes failed, falling back", edgeError);
        try {
          const fallbackData = await loadViaSupabase();
          if (!cancelled) {
            setQuizzes(fallbackData);
            updateStats(fallbackData);
          }
        } catch (fallbackError) {
          console.error("Fallback quiz load failed:", fallbackError);
          if (!cancelled) {
            setQuizzes([]);
            setFetchError("Failed to load quizzes. Please try again.");
          }
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
  }, [updateStats, loadViaSupabase, refreshKey]);

  const statusFilters = useMemo(
    () => [
      { label: "All", value: "all", count: stats.total },
      { label: "Pending", value: "pending", count: stats.pending },
      { label: "Active", value: "active", count: stats.active },
      { label: "Completed", value: "completed", count: stats.completed },
      { label: "Cancelled", value: "cancelled", count: stats.cancelled },
    ],
    [stats]
  );

  const filteredQuizzes = useMemo(() => {
    if (!quizzes) return [];
    return quizzes.filter((quiz) => {
      const matchesStatus =
        statusFilter === "all" ? true : quiz.status === statusFilter;
      const matchesSearch = quiz.title
        .toLowerCase()
        .includes(searchTerm.toLowerCase().trim());
      return matchesStatus && matchesSearch;
    });
  }, [quizzes, statusFilter, searchTerm]);

  useEffect(() => {
    setSelectedIds((prev) =>
      prev.filter((id) => filteredQuizzes.some((quiz) => quiz.id === id))
    );
  }, [filteredQuizzes]);

  const selectedCount = selectedIds.length;
  const hasSelection = selectedCount > 0;
  const allOnPageSelected =
    filteredQuizzes.length > 0 &&
    filteredQuizzes.every((quiz) => selectedIds.includes(quiz.id));

  const formatDate = useCallback((value: string | null, fallback = "-") => {
    if (!value) return fallback;
    return new Date(value).toLocaleString();
  }, []);

  const triggerReload = useCallback(() => {
    setRefreshKey((prev) => prev + 1);
  }, []);

const clearSelection = useCallback(() => setSelectedIds([]), []);

const toggleSelect = useCallback((quizId: string) => {
  setSelectedIds((prev) =>
    prev.includes(quizId)
      ? prev.filter((id) => id !== quizId)
      : [...prev, quizId]
  );
}, []);

const toggleSelectAll = useCallback(() => {
  if (allOnPageSelected) {
    setSelectedIds((prev) =>
      prev.filter((id) => !filteredQuizzes.some((quiz) => quiz.id === id))
    );
    return;
  }
  setSelectedIds((prev) => {
    const idsOnPage = filteredQuizzes.map((quiz) => quiz.id);
    const merged = new Set([...prev, ...idsOnPage]);
    return Array.from(merged);
  });
}, [allOnPageSelected, filteredQuizzes]);

  const handleCancelScheduledQuiz = useCallback(
    async (quizId: string) => {
      try {
        setDeleteError(null);
        setCancellingId(quizId);
        console.log("Cancelling quiz from dashboard", { quizId });
        await callEdgeFunction<{ quiz_id: string }, { success: boolean }>(
          "cancel-quiz",
          { quiz_id: quizId }
        );
        triggerReload();
      } catch (error) {
        console.error("Error cancelling quiz:", error);
        setDeleteError(
          error instanceof Error ? error.message : "Failed to cancel quiz"
        );
      } finally {
        setCancellingId(null);
      }
    },
    [triggerReload]
  );

  const handleDelete = async (quizId: string) => {
    if (!supabase) return;
    setDeleteError(null);
    try {
      setDeletingId(quizId);
      const { error } = await supabase
        .from('quizzes')
        .delete()
        .eq('id', quizId);
      if (error) throw error;
    setSelectedIds((prev) => prev.filter((id) => id !== quizId));
      triggerReload();
    } catch (e) {
      console.error('Error deleting quiz:', e);
      setDeleteError(e instanceof Error ? e.message : 'Failed to delete quiz');
    } finally {
      setDeletingId(null);
    }
  };

  const openConfirmDelete = (id: string, title: string) => {
    setConfirmQuiz({ id, title });
  };

  const confirmAndDelete = async () => {
    if (!confirmQuiz) return;
    await handleDelete(confirmQuiz.id);
    setConfirmQuiz(null);
  };

const handleBulkDelete = useCallback(async () => {
  if (!supabase || !hasSelection) return;
  setDeleteError(null);
  setIsBulkDeleting(true);
  try {
    const { error } = await supabase
      .from("quizzes")
      .delete()
      .in("id", selectedIds);
    if (error) throw error;
    clearSelection();
    triggerReload();
    setConfirmBulkDelete(false);
  } catch (error) {
    console.error("Error bulk deleting quizzes:", error);
    setDeleteError(
      error instanceof Error ? error.message : "Failed to delete selected quizzes"
    );
  } finally {
    setIsBulkDeleting(false);
  }
}, [supabase, hasSelection, selectedIds, clearSelection, triggerReload]);

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
                router.push("/quiz/profile");
              }
            } catch (err) {
              console.error("Error navigating back:", err);
              router.push("/quiz/profile");
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

      <div className="relative z-10 flex flex-col items-center min-h-screen px-4 pt-28 pb-16">
        <div className="w-full max-w-4xl flex flex-col gap-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold">My Quizzes</h1>
              <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
                Track pending, live, and completed quizzes from one place.
              </p>
            </div>
            <div className="flex gap-2">

              <button
                onClick={triggerReload}
                className="px-4 py-2 rounded text-sm font-medium transition-colors"
                style={{ backgroundColor: "var(--color-surface)" }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "var(--color-surface-elevated)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "var(--color-surface)";
                }}
              >
                Refresh
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 rounded-lg" style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border-light)" }}>
              <p className="text-xs uppercase" style={{ color: "var(--color-text-muted)" }}>Total</p>
              <p className="text-2xl font-semibold mt-1">{stats.total}</p>
            </div>
            <div className="p-4 rounded-lg" style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border-light)" }}>
              <p className="text-xs uppercase" style={{ color: "var(--color-text-muted)" }}>Scheduled</p>
              <p className="text-2xl font-semibold mt-1">{stats.pending}</p>
            </div>
            <div className="p-4 rounded-lg" style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border-light)" }}>
              <p className="text-xs uppercase" style={{ color: "var(--color-text-muted)" }}>Active</p>
              <p className="text-2xl font-semibold mt-1">{stats.active}</p>
            </div>
            <div className="p-4 rounded-lg" style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border-light)" }}>
              <p className="text-xs uppercase" style={{ color: "var(--color-text-muted)" }}>Completed</p>
              <p className="text-2xl font-semibold mt-1">{stats.completed}</p>
            </div>
          </div>

          <div className="flex flex-col md:flex-row gap-3 items-start">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search quizzes..."
              className="w-full rounded-md bg-transparent px-4 py-2 text-sm focus:outline-none"
              style={{
                border: "1px solid var(--color-border-light)",
                color: "var(--color-text)",
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = "var(--color-primary)";
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = "var(--color-border-light)";
              }}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {statusFilters.map((filter) => (
              <button
                key={filter.value}
                onClick={() => setStatusFilter(filter.value as typeof statusFilter)}
                className="px-3 py-1.5 rounded-full text-sm border transition-colors"
                style={{
                  borderColor: statusFilter === filter.value ? "var(--color-text)" : "var(--color-border-light)",
                  backgroundColor: statusFilter === filter.value ? "var(--color-surface)" : "transparent",
                  color: statusFilter === filter.value ? "var(--color-text)" : "var(--color-text-secondary)",
                }}
                onMouseEnter={(e) => {
                  if (statusFilter !== filter.value) {
                    e.currentTarget.style.borderColor = "var(--color-border-medium)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (statusFilter !== filter.value) {
                    e.currentTarget.style.borderColor = "var(--color-border-light)";
                  }
                }}
              >
                {filter.label} ({filter.count})
              </button>
            ))}
          </div>

        {filteredQuizzes.length > 0 && (
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <label className="flex items-center gap-2 text-sm" style={{ color: "var(--color-text-secondary)" }}>
              <input
                type="checkbox"
                className="h-4 w-4 rounded bg-transparent"
                style={{ border: "1px solid var(--color-border-medium)" }}
                checked={allOnPageSelected}
                onChange={toggleSelectAll}
              />
              <span>
                Select all ({selectedCount}/{filteredQuizzes.length}) on this page
              </span>
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmBulkDelete(true)}
                disabled={!hasSelection || isBulkDeleting}
                className="px-3 py-2 rounded border border-red-400/60 text-sm text-red-200 disabled:opacity-40 hover:border-red-200"
              >
                {isBulkDeleting ? "Deleting..." : `Delete Selected (${selectedCount})`}
              </button>
              <button
                onClick={clearSelection}
                disabled={!hasSelection}
                className="px-3 py-2 rounded border text-sm disabled:opacity-40 transition-colors"
                style={{
                  borderColor: "var(--color-border-medium)",
                  color: "var(--color-text-secondary)",
                }}
                onMouseEnter={(e) => {
                  if (hasSelection) {
                    e.currentTarget.style.borderColor = "var(--color-border)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (hasSelection) {
                    e.currentTarget.style.borderColor = "var(--color-border-medium)";
                  }
                }}
              >
                Clear Selection
              </button>
            </div>
          </div>
        )}

          {fetchError && (
            <div className="text-red-400 text-sm">{fetchError}</div>
          )}
          {deleteError && (
            <div className="text-red-400 text-sm">{deleteError}</div>
          )}

          {loading ? (
            <div style={{ color: "var(--color-text-secondary)" }}>Loading quizzes...</div>
          ) : filteredQuizzes.length === 0 ? (
            <div className="border border-dashed rounded-lg p-6 text-center" style={{ color: "var(--color-text-secondary)", borderColor: "var(--color-border-light)" }}>
              No quizzes found for this filter.
            </div>
          ) : (
            <div className="grid gap-4">
              {filteredQuizzes.map((q) => (
                <div
                  key={q.id}
                  className="border rounded-lg p-4"
                  style={{
                    backgroundColor: "var(--color-surface-elevated)",
                    borderColor: selectedIds.includes(q.id) ? "var(--color-primary-medium)" : "var(--color-border-light)",
                  }}
                >
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        className="mt-1 h-4 w-4 rounded bg-transparent"
                        style={{ border: "1px solid var(--color-border-medium)" }}
                        checked={selectedIds.includes(q.id)}
                        onChange={() => toggleSelect(q.id)}
                      />
                      <div>
                        <div className="font-semibold text-lg">{q.title}</div>
                        <div className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                          Created {formatDate(q.created_at)}
                        </div>
                      </div>
                    </div>
                    <StatusBadge status={q.status} />
                  </div>

                  <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2" style={{ color: "var(--color-text-secondary)" }}>
                    <div>
                      <p className="text-xs uppercase" style={{ color: "var(--color-text-muted)" }}>Scheduled</p>
                      {q.scheduled_start_time
                        ? formatDate(q.scheduled_start_time)
                        : "Not scheduled"}
                    </div>
                    <div>
                      <p className="text-xs uppercase" style={{ color: "var(--color-text-muted)" }}>Prize</p>
                      {q.prize_amount || 0} {q.prize_token ? "Token" : "ETH"}
                    </div>
                    <div>
                      <p className="text-xs uppercase" style={{ color: "var(--color-text-muted)" }}>Started</p>
                      {formatDate(q.started_at, "—")}
                    </div>
                    <div>
                      <p className="text-xs uppercase" style={{ color: "var(--color-text-muted)" }}>Completed</p>
                      {formatDate(q.ended_at, "—")}
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      onClick={() => router.push(`/quiz/admin/my-quizzes/${q.id}`)}
                      className="px-3 py-2 rounded text-sm transition-colors"
                      style={{ backgroundColor: "var(--color-border)" }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = "var(--color-surface-elevated)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = "var(--color-surface)";
                      }}
                    >
                      Details
                    </button>
                    <button
                      onClick={() => router.push(`/quiz/admin?reuse=${q.id}`)}
                      className="px-3 py-2 rounded text-sm transition-colors"
                      style={{ backgroundColor: "var(--color-primary)", color: "var(--color-text)" }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = "var(--color-primary-hover)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = "var(--color-primary)";
                      }}
                    >
                      Reuse
                    </button>
                    {q.status === "pending" && (
                      <button
                        onClick={() => handleCancelScheduledQuiz(q.id)}
                        disabled={cancellingId === q.id}
                        className="px-3 py-2 rounded bg-yellow-600/60 hover:bg-yellow-600 disabled:opacity-50 text-sm"
                      >
                        {cancellingId === q.id ? "Cancelling..." : "Cancel"}
                      </button>
                    )}
                    <button
                      onClick={() => openConfirmDelete(q.id, q.title)}
                      disabled={deletingId === q.id}
                      className="px-3 py-2 rounded bg-red-600/80 hover:bg-red-600 disabled:opacity-50 text-sm"
                    >
                      {deletingId === q.id ? "Deleting..." : "Delete"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Confirm Delete Modal */}
      {confirmQuiz && (
          <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: "rgba(0, 0, 0, 0.8)" }}>
            <div className="w-full max-w-sm mx-4 rounded-lg border-2 shadow-2xl" style={{ borderColor: "var(--color-primary)", backgroundColor: "var(--color-background)", color: "var(--color-text)", opacity: 1, boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.9)" }}>
              <div className="px-4 py-3 border-b font-semibold" style={{ borderBottomColor: "var(--color-border-light)" }}>
                Delete quiz?
              </div>
              <div className="px-4 py-3 text-sm" style={{ color: "var(--color-text-secondary)" }}>
                <div className="mb-1">You are about to delete:</div>
                <div className="font-medium">{confirmQuiz?.title}</div>
                <div className="mt-2" style={{ color: "var(--color-text-muted)" }}>This action cannot be undone.</div>
              </div>
              <div className="px-4 py-3 flex justify-end gap-2 border-t" style={{ borderTopColor: "var(--color-border-light)" }}>
                <button
                  onClick={() => setConfirmQuiz(null)}
                  className="px-3 py-2 rounded border text-sm transition-colors"
                  style={{ borderColor: "var(--color-border-medium)" }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = "var(--color-border)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = "var(--color-border-medium)";
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={confirmAndDelete}
                  className="px-3 py-2 rounded text-sm transition-colors"
                  style={{ backgroundColor: "var(--color-error)", color: "var(--color-text)" }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = "var(--color-error)";
                    e.currentTarget.style.opacity = "0.9";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "var(--color-error)";
                    e.currentTarget.style.opacity = "1";
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}
      {/* Bulk Delete Modal */}
      {confirmBulkDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: "rgba(0, 0, 0, 0.8)" }}>
          <div className="w-full max-w-sm mx-4 rounded-lg border shadow-xl" style={{ borderColor: "var(--color-border-light)", backgroundColor: "var(--color-background)", color: "var(--color-text)", opacity: 1 }}>
            <div className="px-4 py-3 border-b font-semibold" style={{ borderBottomColor: "var(--color-border-light)" }}>
              Delete selected quizzes?
            </div>
            <div className="px-4 py-3 text-sm space-y-2" style={{ color: "var(--color-text-secondary)" }}>
              <p>
                You are about to delete{" "}
                <span className="font-semibold">{selectedCount}</span>{" "}
                {selectedCount === 1 ? "quiz" : "quizzes"}.
              </p>
              <p style={{ color: "var(--color-text-muted)" }}>
                This action cannot be undone and will remove the selected quizzes
                permanently.
              </p>
            </div>
            <div className="px-4 py-3 flex justify-end gap-2 border-t" style={{ borderTopColor: "var(--color-border-light)" }}>
              <button
                onClick={() => setConfirmBulkDelete(false)}
                className="px-3 py-2 rounded border text-sm transition-colors"
                style={{ borderColor: "var(--color-border-medium)" }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = "var(--color-border)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "var(--color-border-medium)";
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleBulkDelete}
                disabled={isBulkDeleting}
                className="px-3 py-2 rounded text-sm disabled:opacity-50 transition-colors"
                style={{ backgroundColor: "var(--color-error)", color: "var(--color-text)" }}
                onMouseEnter={(e) => {
                  if (!isBulkDeleting) {
                    e.currentTarget.style.backgroundColor = "var(--color-error)";
                    e.currentTarget.style.opacity = "0.9";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isBulkDeleting) {
                    e.currentTarget.style.backgroundColor = "var(--color-error)";
                    e.currentTarget.style.opacity = "1";
                  }
                }}
              >
                {isBulkDeleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Signature confirmation modal */}
      {signatureModal}

      <Footer />
      </div>
  );
}


