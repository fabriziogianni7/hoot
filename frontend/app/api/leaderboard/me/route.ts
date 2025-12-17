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

    // Resolve the user from the access token
    const {
      data: userResult,
      error: userError,
    } = await supabaseAdmin.auth.getUser(token)

    if (userError || !userResult?.user) {
      console.error("[Leaderboard API] getUser error:", userError)
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

    let data = null
    let lastError: any = null

    // Prefer matching by FID
    if (fid) {
      const { data: fidRow, error: fidError } = await supabaseAdmin
        .from("global_leaderboard")
        .select(
          "identity_key,identity_fid,identity_wallet,display_name,games_played,play_points,quizzes_created,create_points,correct_answers,avg_correct_time,total_points,rank"
        )
        .eq("identity_fid", String(fid))
        .maybeSingle()

      if (fidError && fidError.code !== "PGRST116") {
        lastError = fidError
      } else if (fidRow) {
        data = fidRow
      }
    }

    // Fallback: match by primary wallet if no FID match
    if (!data && primaryWallet) {
      const { data: walletRow, error: walletError } = await supabaseAdmin
        .from("global_leaderboard")
        .select(
          "identity_key,identity_fid,identity_wallet,display_name,games_played,play_points,quizzes_created,create_points,correct_answers,avg_correct_time,total_points,rank"
        )
        .eq("identity_wallet", primaryWallet.toLowerCase())
        .maybeSingle()

      if (walletError && walletError.code !== "PGRST116") {
        lastError = walletError
      } else if (walletRow) {
        data = walletRow
      }
    }

    if (!data && lastError) {
      console.error("[Leaderboard API] Error fetching leaderboard row:", lastError)
      return NextResponse.json(
        { error: "Failed to load leaderboard data" },
        { status: 500 }
      )
    }

    return NextResponse.json({ data })
  } catch (error: any) {
    console.error("[Leaderboard API] Unexpected error:", error)
    return NextResponse.json(
      { error: error?.message || "Internal server error" },
      { status: 500 }
    )
  }
}


