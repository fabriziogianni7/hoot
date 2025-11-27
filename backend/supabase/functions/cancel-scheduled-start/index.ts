import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { handleCorsPreFlight } from "../_shared/cors.ts"
import { successResponse, errorResponse } from "../_shared/response.ts"
import { validateRequired } from "../_shared/validation.ts"
import { initSupabaseClient } from "../_shared/supabase.ts"

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return handleCorsPreFlight()
  }

  try {
    const supabase = initSupabaseClient(req)
    const payload = await req.json()

    const missing = validateRequired({
      quiz_id: payload.quiz_id
    })
    if (missing) {
      return errorResponse(missing, 400)
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return errorResponse("Unauthorized", 401)
    }

    const { data: quiz, error: quizError } = await supabase
      .from("quizzes")
      .select("id, user_id, status, scheduled_start_time")
      .eq("id", payload.quiz_id)
      .single()

    if (quizError || !quiz) {
      return errorResponse("Quiz not found", 404)
    }

    if (quiz.user_id !== user.id) {
      return errorResponse("Forbidden", 403)
    }

    if (!quiz.scheduled_start_time) {
      return errorResponse("Quiz does not have a scheduled start time", 400)
    }

    const jobName = `start_quiz_${quiz.id}`
    const { error: rpcError } = await supabase.rpc("cancel_quiz_start_cron_job", {
      job_name: jobName
    })

    if (rpcError) {
      console.error("Failed to cancel cron job:", rpcError)
      return errorResponse("Failed to cancel scheduled start", 500)
    }

    const { error: updateError } = await supabase
      .from("quizzes")
      .update({
        scheduled_start_time: null
      })
      .eq("id", quiz.id)

    if (updateError) {
      console.error("Failed to clear scheduled start time:", updateError)
      return errorResponse("Failed to clear scheduled start time", 500)
    }

    return successResponse({
      success: true,
      quiz_id: quiz.id
    })
  } catch (error) {
    console.error("Error cancelling scheduled start:", error)
    return errorResponse(error.message || "Internal server error", 500)
  }
})

