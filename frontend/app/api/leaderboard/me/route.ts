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

    const userId = userResult.user.id

    // Fetch this user's aggregated stats from the view
    const { data, error } = await supabaseAdmin
      .from("global_leaderboard")
      .select(
        "identity_key,identity_fid,identity_wallet,display_name,games_played,play_points,quizzes_created,create_points,correct_answers,avg_correct_time,total_points,rank"
      )
      .eq("user_id", userId)
      .maybeSingle()

    if (error) {
      console.error("[Leaderboard API] Error fetching leaderboard row:", error)
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


