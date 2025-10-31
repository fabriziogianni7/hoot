"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useSupabase } from "@/lib/supabase-context";
import { useAccount } from "wagmi";
import { useAuth } from "@/lib/use-auth";
import { sdk } from "@farcaster/miniapp-sdk";

type QuizRow = {
  id: string;
  title: string;
  created_at: string;
};

export default function MyQuizzesPage() {
  const router = useRouter();
  const { supabase } = useSupabase();
  const { address } = useAccount();
  const { loggedUser } = useAuth();
  const [quizzes, setQuizzes] = useState<QuizRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [confirmQuiz, setConfirmQuiz] = useState<{ id: string; title: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        if (!supabase) return;
        const inMini = await sdk.isInMiniApp();
        const baseQuery = supabase
          .from("quizzes")
          .select("id,title,created_at")
          .order("created_at", { ascending: false });

        if (inMini) {
          const ctx = await sdk.context;
          const fid = String((loggedUser?.fid ?? ctx?.user?.fid) ?? "");
          if (!fid) {
            if (!cancelled) setQuizzes([]);
            return;
          }
          const { data } = await baseQuery.eq("user_fid", fid);
          if (!cancelled) setQuizzes((data as QuizRow[]) || []);
        } else if (address) {
          const { data } = await baseQuery.eq("creator_address", address);
          if (!cancelled) setQuizzes((data as QuizRow[]) || []);
        } else {
          if (!cancelled) setQuizzes([]);
        }
      } catch (e) {
        console.error("Error loading quizzes:", e);
        if (!cancelled) setQuizzes([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [supabase, address, loggedUser?.fid]);

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
      setQuizzes((prev) => (prev ? prev.filter(q => q.id !== quizId) : prev));
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

  return (
    <div className="min-h-screen w-full bg-black text-white relative overflow-hidden">
      {/* Logo centered */}
      <div className="absolute left-1/2 transform -translate-x-1/2 z-20">
        <img
          src="/Logo.png"
          alt="Hoot Logo"
          className="h-28 w-auto cursor-pointer hover:opacity-80 transition-opacity"
          onClick={() => router.push('/')}
        />
      </div>

      <div className="relative z-10 flex flex-col items-center min-h-screen px-4 pt-28">
        <div className="w-full max-w-md flex justify-between items-center mb-4">
          <h1 className="text-xl font-semibold">My Quizzes</h1>
          <button
            onClick={() => router.push('/quiz/admin')}
            className="px-3 py-2 rounded border border-white/40 hover:border-white"
          >
            Back
          </button>
        </div>

        {loading ? (
          <div className="text-gray-300">Loading...</div>
        ) : (quizzes?.length ?? 0) === 0 ? (
          <div className="text-gray-300">No quizzes yet.</div>
        ) : (
          <div className="w-full max-w-md space-y-2">
            {deleteError && (
              <div className="text-red-300 text-sm mb-2">{deleteError}</div>
            )}
            {quizzes!.map((q) => (
              <div
                key={q.id}
                className="bg-gray-900/40 border border-white/20 rounded p-3 flex justify-between items-center"
              >
                <div>
                  <div className="font-medium">{q.title}</div>
                  <div className="text-xs text-gray-400">
                    {new Date(q.created_at).toLocaleString()}
                  </div>
                </div>
                <div className="flex items-center gap-2.5">
                  <button
                    onClick={() => router.push(`/quiz/admin?reuse=${q.id}`)}
                    className="px-3 py-2 rounded bg-purple-600 hover:bg-purple-500 text-white text-sm"
                  >
                    Reuse
                  </button>
                  <button
                    onClick={() => openConfirmDelete(q.id, q.title)}
                    disabled={deletingId === q.id}
                    className="px-3 py-2 rounded bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-sm"
                  >
                    {deletingId === q.id ? 'Deleting...' : 'Delete'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        {/* Confirm Delete Modal */}
        {confirmQuiz && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
            <div className="w-full max-w-sm mx-4 rounded-lg border border-white/20 bg-gray-900 text-white shadow-xl">
              <div className="px-4 py-3 border-b border-white/10 font-semibold">
                Delete quiz?
              </div>
              <div className="px-4 py-3 text-sm text-gray-200">
                <div className="mb-1">You are about to delete:</div>
                <div className="font-medium">{confirmQuiz.title}</div>
                <div className="mt-2 text-gray-400">This action cannot be undone.</div>
              </div>
              <div className="px-4 py-3 flex justify-end gap-2 border-t border-white/10">
                <button
                  onClick={() => setConfirmQuiz(null)}
                  className="px-3 py-2 rounded border border-white/30 hover:border-white text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmAndDelete}
                  className="px-3 py-2 rounded bg-red-600 hover:bg-red-500 text-white text-sm"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


