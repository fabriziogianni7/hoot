"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { sdk } from "@farcaster/miniapp-sdk"

import { useSupabase } from "@/lib/supabase-context"
import { useAuth } from "@/lib/use-auth"
import {
  fetchUserLeaderboardRow,
  type GlobalLeaderboardRow,
} from "@/lib/leaderboard-client"

export default function LeaderboardPage() {
  const router = useRouter()
  const { supabase } = useSupabase()
  const { loggedUser, isMiniapp, miniappClient } = useAuth()

  const [userRow, setUserRow] = useState<GlobalLeaderboardRow | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSharing, setIsSharing] = useState(false)
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "error">(
    "idle"
  )

  const currentFid = loggedUser?.fid ?? null
  const currentAddress = loggedUser?.address ?? null

  useEffect(() => {
    if (!supabase) return

    let cancelled = false

    const load = async () => {
      setIsLoading(true)
      try {
        const selfRow = await fetchUserLeaderboardRow(supabase, {
          fid: currentFid,
          address: currentAddress,
        })

        if (cancelled) return
        setUserRow(selfRow)
      } catch (error) {
        if (!cancelled) {
          console.error("[Leaderboard] Error loading leaderboard:", error)
          setUserRow(null)
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    load()

    return () => {
      cancelled = true
    }
  }, [supabase, currentFid, currentAddress])

  const shareTextAndUrl = useMemo(() => {
    const baseUrl =
      typeof window !== "undefined"
        ? `${window.location.origin}/leaderboard`
        : "https://hoot.quiz"

    if (!userRow) {
      const text =
        "I'm playing quizzes on Hoot! come play the next quiz to try to beat me!"
      return { text, url: baseUrl }
    }

    const rank = userRow.rank
    const totalPoints = Math.round(userRow.total_points).toLocaleString()
    const correct = userRow.correct_answers.toLocaleString()
    const avgTime = userRow.avg_correct_time.toFixed(1)
    const created = userRow.quizzes_created
    const createdPart =
      created > 0
        ? ` and created ${created} quiz${created === 1 ? "" : "zes"}`
        : ""

    const text = `I'm ranked #${rank} on Hoot! I have ${totalPoints} points, ${correct} correct answers with an average of ${avgTime}s${createdPart}. Come play the next quiz to do better than me!`

    return { text, url: baseUrl }
  }, [userRow])

  const handleShare = async () => {
    if (!shareTextAndUrl) return

    const { text, url } = shareTextAndUrl

    setIsSharing(true)
    setCopyStatus("idle")

    try {
      if (isMiniapp && (miniappClient === "farcaster" || miniappClient === "base")) {
        const embeds =
          typeof window !== "undefined"
            ? ([`${window.location.origin}/leaderboard`] as [string])
            : undefined

        await (sdk as any).actions.composeCast({
          text,
          embeds,
        })
        return
      }

      if (typeof window !== "undefined" && (navigator as any).share) {
        await (navigator as any).share({
          title: "Hoot Leaderboard",
          text,
          url,
        })
        return
      }

      if (typeof window !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(`${text} ${url}`)
        setCopyStatus("copied")
        setTimeout(() => setCopyStatus("idle"), 3000)
        return
      }

      // Fallback: open a prefilled tweet
      const tweetUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(
        `${text} ${url}`
      )}`
      if (typeof window !== "undefined") {
        window.open(tweetUrl, "_blank", "noopener,noreferrer")
      }
    } catch (error) {
      console.error("[Leaderboard] Error sharing rank:", error)
      setCopyStatus("error")
      setTimeout(() => setCopyStatus("idle"), 3000)
    } finally {
      setIsSharing(false)
    }
  }

  const currentIdentityKey = useMemo(() => {
    if (userRow?.identity_key) return userRow.identity_key
    if (currentFid != null) return String(currentFid)
    if (currentAddress) return currentAddress.toLowerCase()
    return null
  }, [userRow, currentFid, currentAddress])

  return (
    <div className="min-h-screen w-full bg-black text-white relative overflow-hidden">
      {/* Background */}
      <div
        className="absolute inset-0 z-0 opacity-40"
        style={{
          backgroundImage: "url('/network-bg.svg')",
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      />

      <div className="relative z-10 container mx-auto py-8 px-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <img
            src="/Logo.png"
            alt="Hoot Logo"
            className="h-16 w-auto cursor-pointer hover:opacity-80 transition-opacity"
            onClick={() => router.push("/")}
          />
          <button
            onClick={() => router.back()}
            className="text-sm text-purple-200 hover:text-purple-100"
          >
            ← Back
          </button>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
          <div>
            <h1 className="text-3xl font-bold mb-1">Your Hoot! Rank</h1>
            <p className="text-gray-300 text-sm">
              Your overall rank and trivia stats across all Hoot quizzes.
            </p>
          </div>

          <div className="flex flex-col items-stretch sm:items-end gap-2">
            <button
              type="button"
              onClick={handleShare}
              disabled={isSharing}
              className="px-4 py-2 rounded-full bg-purple-600 hover:bg-purple-500 disabled:bg-purple-800 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
            >
              {isSharing ? "Sharing..." : "Share my rank"}
            </button>
            {copyStatus === "copied" && (
              <span className="text-xs text-green-300">
                Copied to clipboard. Paste anywhere to share.
              </span>
            )}
            {copyStatus === "error" && (
              <span className="text-xs text-red-300">
                Failed to share. Try again or copy manually.
              </span>
            )}
          </div>
        </div>

        {/* Personal stats dashboard */}
        <div className="mt-4 max-w-xl">
          {isLoading ? (
            <p className="text-gray-300">Loading your stats…</p>
          ) : !userRow ? (
            <div className="bg-purple-900/40 border border-purple-700/60 rounded-lg p-5">
              <p className="text-purple-100 font-semibold mb-1">
                No rank yet
              </p>
              <p className="text-gray-300 text-sm">
                Play a quiz or create one to appear on the global leaderboard.
              </p>
            </div>
          ) : (
            <div className="bg-purple-900/40 border border-purple-700/60 rounded-lg p-5 space-y-4">
              <div className="flex items-baseline justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-wide text-purple-200">
                    Your rank
                  </p>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-bold text-white">
                      #{userRow.rank}
                    </span>
                    <span className="text-sm text-purple-200">
                      overall on Hoot!
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs uppercase tracking-wide text-purple-200">
                    Total points
                  </p>
                  <p className="text-xl font-semibold text-purple-100">
                    {Math.round(userRow.total_points).toLocaleString()}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-purple-950/40 border border-purple-700/60 rounded-lg p-3">
                  <p className="text-xs uppercase tracking-wide text-purple-200 mb-1">
                    From playing
                  </p>
                  <p className="text-lg font-semibold text-purple-50">
                    {Math.round(userRow.play_points).toLocaleString()}
                  </p>
                  <p className="text-xs text-gray-300 mt-1">
                    Earned by answering questions correctly and quickly.
                  </p>
                </div>
                <div className="bg-purple-950/40 border border-purple-700/60 rounded-lg p-3">
                  <p className="text-xs uppercase tracking-wide text-purple-200 mb-1">
                    Correct answers
                  </p>
                  <p className="text-lg font-semibold text-purple-50">
                    {userRow.correct_answers.toLocaleString()}
                  </p>
                  <p className="text-xs text-gray-300 mt-1">
                    Total questions you&apos;ve answered correctly.
                  </p>
                </div>
                <div className="bg-purple-950/40 border border-purple-700/60 rounded-lg p-3">
                  <p className="text-xs uppercase tracking-wide text-purple-200 mb-1">
                    Avg. time (correct)
                  </p>
                  <p className="text-lg font-semibold text-purple-50">
                    {userRow.avg_correct_time.toFixed(1)}s
                  </p>
                  <p className="text-xs text-gray-300 mt-1">
                    Average time you take to answer correctly.
                  </p>
                </div>
                <div className="bg-purple-950/40 border border-purple-700/60 rounded-lg p-3">
                  <p className="text-xs uppercase tracking-wide text-purple-200 mb-1">
                    From creating
                  </p>
                  <p className="text-lg font-semibold text-purple-50">
                    {Math.round(userRow.create_points).toLocaleString()}
                  </p>
                  <p className="text-xs text-gray-300 mt-1">
                    Bonus for{" "}
                    <span className="font-semibold">
                      {userRow.quizzes_created}
                    </span>{" "}
                    quiz{userRow.quizzes_created === 1 ? "" : "zes"} you created.
                  </p>
                </div>
              </div>

              <p className="text-xs text-gray-400">
                Points are aggregated across all games you play and quizzes you
                create, keyed by your Farcaster ID or wallet.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}


