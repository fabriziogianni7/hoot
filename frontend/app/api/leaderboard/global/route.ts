import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
)

const fields =
  "identity_key,identity_fid,identity_wallet,display_name,games_played,play_points,quizzes_created,create_points,correct_answers,avg_correct_time,total_points,rank"

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get("authorization") || ""
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length)
      : null

    if (!token) {
      return NextResponse.json(
        { error: "Missing access token" },
        { status: 401 }
      )
    }

    const {
      data: userResult,
      error: userError,
    } = await supabaseAdmin.auth.getUser(token)

    if (userError || !userResult?.user) {
      console.error("[Leaderboard Global API] getUser error:", userError)
      return NextResponse.json(
        { error: "Invalid or expired access token" },
        { status: 401 }
      )
    }

    const user = userResult.user
    const fid = (user.user_metadata as any)?.fid as string | null
    const primaryWallet =
      ((user.user_metadata as any)?.wallet_address as string | undefined) ??
      ((user.user_metadata as any)?.wallet_addresses?.[0] as string | undefined) ??
      null

    // Top 100 users by total score
    const { data: topRows, error: topError } = await supabaseAdmin
      .from("global_leaderboard")
      .select(fields)
      .order("rank", { ascending: true })
      .limit(100)

    if (topError) {
      console.error("[Leaderboard Global API] Error fetching top rows:", topError)
      return NextResponse.json(
        { error: "Failed to load global leaderboard" },
        { status: 500 }
      )
    }

    // Current user's row - match by FID first, then wallet
    let meRow: any = null
    let lastError: any = null

    if (fid) {
      const { data: fidRow, error: fidError } = await supabaseAdmin
        .from("global_leaderboard")
        .select(fields)
        .eq("identity_fid", String(fid))
        .maybeSingle()

      if (fidError && fidError.code !== "PGRST116") {
        lastError = fidError
      } else if (fidRow) {
        meRow = fidRow
      }
    }

    if (!meRow && primaryWallet) {
      const { data: walletRow, error: walletError } = await supabaseAdmin
        .from("global_leaderboard")
        .select(fields)
        .eq("identity_wallet", primaryWallet.toLowerCase())
        .maybeSingle()

      if (walletError && walletError.code !== "PGRST116") {
        lastError = walletError
      } else if (walletRow) {
        meRow = walletRow
      }
    }

    if (!meRow && lastError) {
      console.error(
        "[Leaderboard Global API] Error fetching user row:",
        lastError
      )
    }

    let aroundMe: any[] = []

    if (meRow && meRow.rank && meRow.rank > 100) {
      const fromRank = Math.max(meRow.rank - 2, 1)
      const toRank = meRow.rank + 2

      const { data: windowRows, error: windowError } = await supabaseAdmin
        .from("global_leaderboard")
        .select(fields)
        .gte("rank", fromRank)
        .lte("rank", toRank)
        .order("rank", { ascending: true })

      if (windowError) {
        console.error(
          "[Leaderboard Global API] Error fetching around-me window:",
          windowError
        )
      } else {
        aroundMe = windowRows ?? []
      }
    }

    return NextResponse.json({
      top: topRows ?? [],
      me: meRow ?? null,
      aroundMe,
    })
  } catch (error: any) {
    console.error("[Leaderboard Global API] Unexpected error:", error)
    return NextResponse.json(
      { error: error?.message || "Internal server error" },
      { status: 500 }
    )
  }
}


