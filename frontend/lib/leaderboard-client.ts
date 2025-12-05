"use client"

import type { SupabaseClient } from "@supabase/supabase-js"

export interface GlobalLeaderboardRow {
  identity_key: string
  identity_fid: string | null
  identity_wallet: string | null
  play_points: number
  quizzes_created: number
  create_points: number
  correct_answers: number
  avg_correct_time: number
  total_points: number
  rank: number
}

interface FetchUserLeaderboardParams {
  fid?: number | null
  address?: string | null
}

export async function fetchUserLeaderboardRow(
  client: SupabaseClient,
  params: FetchUserLeaderboardParams
): Promise<GlobalLeaderboardRow | null> {
  const { fid, address } = params

  // Prefer FID when available
  if (fid != null) {
    const fidString = String(fid)

    const { data, error } = await client
      .from("global_leaderboard")
      .select(
        "identity_key,identity_fid,identity_wallet,play_points,quizzes_created,create_points,correct_answers,avg_correct_time,total_points,rank"
      )
      .eq("identity_fid", fidString)
      .maybeSingle()

    if (error && (error as any).code !== "PGRST116") {
      console.error("Error fetching leaderboard row by FID:", error)
      throw error
    }

    if (data) return data as GlobalLeaderboardRow
  }

  // Fallback to wallet address
  if (address) {
    const lowerAddress = address.toLowerCase()

    const { data, error } = await client
      .from("global_leaderboard")
      .select(
        "identity_key,identity_fid,identity_wallet,play_points,quizzes_created,create_points,correct_answers,avg_correct_time,total_points,rank"
      )
      .eq("identity_wallet", lowerAddress)
      .maybeSingle()

    if (error && (error as any).code !== "PGRST116") {
      console.error("Error fetching leaderboard row by wallet:", error)
      throw error
    }

    if (data) return data as GlobalLeaderboardRow
  }

  return null
}

export async function fetchTopLeaderboardRows(
  client: SupabaseClient,
  limit = 100
): Promise<GlobalLeaderboardRow[]> {
  const { data, error } = await client
    .from("global_leaderboard")
    .select(
      "identity_key,identity_fid,identity_wallet,play_points,quizzes_created,create_points,correct_answers,avg_correct_time,total_points,rank"
    )
    .order("rank", { ascending: true })
    .limit(limit)

  if (error) {
    console.error("Error fetching top leaderboard rows:", error)
    throw error
  }

  return (data ?? []) as GlobalLeaderboardRow[]
}


