"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { sdk } from "@farcaster/miniapp-sdk"

import { useAuth } from "@/lib/use-auth"
import type { GlobalLeaderboardRow } from "@/lib/leaderboard-client"

export default function LeaderboardPage() {
  const router = useRouter()
  const { loggedUser, isMiniapp, miniappClient } = useAuth()

  const [userRow, setUserRow] = useState<GlobalLeaderboardRow | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSharing, setIsSharing] = useState(false)
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "error">(
    "idle"
  )
  const [activeTab, setActiveTab] = useState<"me" | "global">("me")
  const [globalRows, setGlobalRows] = useState<GlobalLeaderboardRow[]>([])
  const [aroundMeRows, setAroundMeRows] = useState<GlobalLeaderboardRow[]>([])
  const [isGlobalLoading, setIsGlobalLoading] = useState(false)
  const [globalError, setGlobalError] = useState<string | null>(null)

  const handleViewProfile = async (fidValue?: string | number | null) => {
    if (fidValue == null) return

    const fidNumber =
      typeof fidValue === "string" ? Number.parseInt(fidValue, 10) : fidValue

    if (!Number.isFinite(fidNumber)) return

    try {
      if (isMiniapp && miniappClient === "farcaster") {
        await (sdk as any).actions.viewProfile({ fid: fidNumber })
      } else if (typeof window !== "undefined") {
        // Fallback: open Farcaster profile in Warpcast
        const url = `https://warpcast.com/~/profile/${fidNumber}`
        window.open(url, "_blank", "noopener,noreferrer")
      }
    } catch (error) {
      console.error("[Leaderboard] Error opening Farcaster profile:", error)
    }
  }

  useEffect(() => {
    if (!loggedUser?.isAuthenticated || !loggedUser.session?.access_token) {
      setIsLoading(false)
      return
    }

    let cancelled = false

    const load = async () => {
      setIsLoading(true)
      try {
        const res = await fetch("/api/leaderboard/me", {
          method: "GET",
          headers: {
            Authorization: `Bearer ${loggedUser?.session?.access_token ?? ""}`,
          },
        })

        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          console.error("[Leaderboard] API error:", res.status, body)
          if (!cancelled) {
            setUserRow(null)
          }
          return
        }

        const json = (await res.json()) as { data: GlobalLeaderboardRow | null }
        const selfRow = json.data ?? null

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
  }, [loggedUser?.isAuthenticated, loggedUser?.session?.access_token])


  // Load global leaderboard when needed
  useEffect(() => {
    if (
      activeTab !== "global" ||
      !loggedUser?.isAuthenticated ||
      !loggedUser.session?.access_token
    ) {
      return
    }

    // Avoid refetching if we already have data
    if (globalRows.length > 0) return

    let cancelled = false

    const loadGlobal = async () => {
      setIsGlobalLoading(true)
      setGlobalError(null)
      try {
        const res = await fetch("/api/leaderboard/global", {
          method: "GET",
          headers: {
            Authorization: `Bearer ${loggedUser?.session?.access_token ?? ""}`,
          },
        })

        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          console.error(
            "[Leaderboard] Global API error:",
            res.status,
            body
          )
          if (!cancelled) {
            setGlobalError("Failed to load global leaderboard.")
          }
          return
        }

        const json = (await res.json()) as {
          top: GlobalLeaderboardRow[]
          me: GlobalLeaderboardRow | null
          aroundMe: GlobalLeaderboardRow[]
        }

        if (cancelled) return

        setGlobalRows(json.top ?? [])
        setAroundMeRows(json.aroundMe ?? [])

        // Also update userRow if we got a fresher copy
        if (json.me) {
          setUserRow((prev) => prev ?? json.me)
        }
      } catch (error) {
        console.error("[Leaderboard] Error loading global leaderboard:", error)
        if (!cancelled) {
          setGlobalError("Failed to load global leaderboard.")
        }
      } finally {
        // Always clear loading flag, even if effect was cancelled,
        // so we don't get stuck showing "Loading..." in the UI.
        setIsGlobalLoading(false)
      }
    }

    loadGlobal()

    return () => {
      cancelled = true
    }
  }, [
    activeTab,
    loggedUser?.isAuthenticated,
    loggedUser?.session?.access_token,
    globalRows.length,
  ])

  const handleShare = async () => {
    const baseUrl =
      typeof window !== "undefined"
        ? `${window.location.origin}/leaderboard`
        : "https://hoot.quiz"

    const rank = userRow?.rank
    const text =
      rank && userRow
        ? (() => {
            const totalPoints = Math.round(
              userRow.total_points
            ).toLocaleString()
            const correct = userRow.correct_answers.toLocaleString()
            const avgTime = userRow.avg_correct_time.toFixed(1)
            const created = userRow.quizzes_created
            const createdLine =
              created > 0
                ? `• ${created} quiz${created === 1 ? "" : "zes"} created\n`
                : ""

            return `🏆 I'm ranked #${rank} on Hoot!
• ${totalPoints} points
• ${correct} correct answers (avg ${avgTime}s)
${createdLine}🔥 Come play the next Hoot! quiz and try to beat me!`
          })()
        : "I'm playing quizzes on Hoot! Come play the next quiz to try to beat me! https://hoot-quiz.com"

    const url = baseUrl

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
    return null
  }, [userRow])

  const globalDisplayRows = useMemo(() => {
    if (!globalRows.length) return []
    if (!userRow?.rank || userRow.rank <= 100 || !aroundMeRows.length)
      return globalRows

    const byKey = new Map<string, GlobalLeaderboardRow>()
    for (const row of globalRows) byKey.set(row.identity_key, row)
    for (const row of aroundMeRows) byKey.set(row.identity_key, row)

    const all = Array.from(byKey.values())
    all.sort((a, b) => a.rank - b.rank)
    return all
  }, [globalRows, aroundMeRows, userRow?.rank])

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
            <h1 className="text-3xl font-bold mb-1">Hoot! Leaderboard</h1>
            <p className="text-gray-300 text-sm">
              See your trivia stats and how you compare globally.
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

        {/* Tabs */}
        <div className="mt-2 mb-4 inline-flex rounded-full border border-purple-700/60 bg-purple-950/40 p-1">
          <button
            type="button"
            onClick={() => setActiveTab("me")}
            className={`px-4 py-1.5 text-sm rounded-full transition-colors ${
              activeTab === "me"
                ? "bg-purple-600 text-white"
                : "text-purple-200 hover:bg-purple-800/60"
            }`}
          >
            Your stats
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("global")}
            className={`px-4 py-1.5 text-sm rounded-full transition-colors ${
              activeTab === "global"
                ? "bg-purple-600 text-white"
                : "text-purple-200 hover:bg-purple-800/60"
            }`}
          >
            Global leaderboard
          </button>
        </div>

        {/* Tab content */}
        {activeTab === "me" ? (
          <div className="mt-2 max-w-xl">
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
                      quiz{userRow.quizzes_created === 1 ? "" : "zes"} you
                      created.
                    </p>
                  </div>
                </div>

                <p className="text-xs text-gray-400">
                  Points are aggregated across all games you play and quizzes
                  you create, keyed by your Farcaster ID or wallet.
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="mt-2">
            {isGlobalLoading ? (
              <p className="text-gray-300">Loading global leaderboard…</p>
            ) : globalError ? (
              <p className="text-red-300 text-sm">{globalError}</p>
            ) : !globalDisplayRows.length ? (
              <p className="text-gray-300">No players on the leaderboard yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm bg-purple-900/30 border border-purple-700/50 rounded-lg overflow-hidden">
                  <thead className="bg-purple-900/60 text-purple-100">
                    <tr>
                      <th className="px-4 py-2 text-left">Rank</th>
                      <th className="px-4 py-2 text-left">Player</th>
                      <th className="px-4 py-2 text-right">Games</th>
                      <th className="px-4 py-2 text-right">From play</th>
                      <th className="px-4 py-2 text-right">From creating</th>
                      <th className="px-4 py-2 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {globalDisplayRows.map((row) => {
                      const isCurrent =
                        currentIdentityKey &&
                        row.identity_key.toLowerCase() ===
                          currentIdentityKey.toLowerCase()

                      const name =
                        row.display_name ||
                        (row.identity_fid
                          ? `FID ${row.identity_fid}`
                          : row.identity_wallet
                          ? `${row.identity_wallet.slice(
                              0,
                              6
                            )}…${row.identity_wallet.slice(-4)}`
                          : "Anon player")

                      return (
                        <tr
                          key={row.identity_key}
                          className={
                            isCurrent
                              ? "bg-purple-700/40 border-t border-purple-400"
                              : "border-t border-purple-800/60"
                          }
                        >
                          <td className="px-4 py-2">
                            {row.rank <= 3 ? (
                              <span className="text-lg">
                                {row.rank === 1 && "👑"}
                                {row.rank === 2 && "🥈"}
                                {row.rank === 3 && "🥉"}
                              </span>
                            ) : (
                              <span>#{row.rank}</span>
                            )}
                          </td>
                          <td className="px-4 py-2">
                            <div className="flex flex-col">
                              <div className="flex items-center gap-2">
                                <span
                                  className={
                                    isCurrent ? "font-bold text-purple-50" : ""
                                  }
                                >
                                  {name}
                                  {isCurrent && " (you)"}
                                </span>
                                {row.identity_fid && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleViewProfile(row.identity_fid as any)
                                    }
                                    className="text-xs text-purple-300 hover:text-purple-100"
                                    aria-label="View Farcaster profile"
                                  >
                                    <span role="img" aria-hidden="true">
                                      👁️
                                    </span>
                                  </button>
                                )}
                              </div>
                              {row.identity_wallet && (
                                <span className="text-xs text-gray-400">
                                  {row.identity_wallet.slice(0, 6)}…
                                  {row.identity_wallet.slice(-4)}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-2 text-right">
                            {row.games_played}
                          </td>
                          <td className="px-4 py-2 text-right">
                            {Math.round(row.play_points).toLocaleString()}
                          </td>
                          <td className="px-4 py-2 text-right">
                            {Math.round(row.create_points).toLocaleString()}
                          </td>
                          <td className="px-4 py-2 text-right font-semibold">
                            {Math.round(row.total_points).toLocaleString()}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}


