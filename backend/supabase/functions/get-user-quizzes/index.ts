import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { handleCorsPreFlight } from "../_shared/cors.ts"
import { successResponse, errorResponse } from "../_shared/response.ts"
import { initSupabaseClient } from "../_shared/supabase.ts"

const VALID_STATUSES = new Set(["pending", "active", "completed", "cancelled"])

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return handleCorsPreFlight()
  }

  try {
    const supabase = initSupabaseClient(req)
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return errorResponse("Unauthorized", 401)
    }

    let payload: Record<string, unknown> = {}
    if (req.method === "GET") {
      const url = new URL(req.url)
      payload = Object.fromEntries(url.searchParams.entries())
    } else {
      try {
        payload = await req.json()
      } catch {
        payload = {}
      }
    }

    const statusParam = (payload.status as string | undefined)?.toLowerCase() || "all"
    const pageParam = parseInt(String(payload.page ?? "1"), 10)
    const pageSizeParam = parseInt(String(payload.page_size ?? "20"), 10)

    const page = Number.isNaN(pageParam) || pageParam < 1 ? 1 : pageParam
    const pageSize = Math.min(Math.max(pageSizeParam, 1), 50)
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    let query = supabase
      .from("quizzes")
      .select(
        "id,title,description,status,scheduled_start_time,created_at,started_at,ended_at,prize_amount,prize_token",
        { count: "exact" }
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .range(from, to)

    if (statusParam !== "all") {
      if (!VALID_STATUSES.has(statusParam)) {
        return errorResponse("Invalid status filter", 400)
      }
      query = query.eq("status", statusParam)
    }

    const { data, count, error: queryError } = await query

    if (queryError) {
      console.error("Failed to load quizzes:", queryError)
      return errorResponse("Failed to load quizzes", 500)
    }

    return successResponse({
      success: true,
      quizzes: data ?? [],
      total: count ?? 0,
      page,
      page_size: pageSize
    })
  } catch (error) {
    console.error("Error fetching user quizzes:", error)
    return errorResponse(error.message || "Internal server error", 500)
  }
})

