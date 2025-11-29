import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { handleCorsPreFlight } from "../_shared/cors.ts"
import { successResponse, errorResponse } from "../_shared/response.ts"
import { validateRequired } from "../_shared/validation.ts"
import { initSupabaseClient } from "../_shared/supabase.ts"

function buildCronExpression(date: Date): string {
  const minutes = date.getUTCMinutes()
  const hours = date.getUTCHours()
  const dayOfMonth = date.getUTCDate()
  const month = date.getUTCMonth() + 1
  return `${minutes} ${hours} ${dayOfMonth} ${month} *`
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return handleCorsPreFlight()
  }

  try {
    const supabase = initSupabaseClient(req)
    const payload = await req.json()

    const missing = validateRequired({
      quiz_id: payload.quiz_id,
      scheduled_start_time: payload.scheduled_start_time
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
      .select("id, user_id, status")
      .eq("id", payload.quiz_id)
      .single()

    if (quizError || !quiz) {
      return errorResponse("Quiz not found", 404)
    }

    if (quiz.user_id !== user.id) {
      return errorResponse("Forbidden", 403)
    }

    if (quiz.status !== "pending") {
      return errorResponse("Only pending quizzes can be scheduled", 400)
    }

    const scheduledDate = new Date(payload.scheduled_start_time)
    if (isNaN(scheduledDate.getTime())) {
      return errorResponse("scheduled_start_time must be a valid date", 400)
    }

    if (scheduledDate.getTime() < Date.now() + 60_000) {
      return errorResponse("scheduled_start_time must be at least 1 minute in the future", 400)
    }

    const jobName = `start_quiz_${quiz.id}`
    const cronExpression = buildCronExpression(scheduledDate)

    console.log("Scheduling quiz start", {
      quiz_id: quiz.id,
      job_name: jobName,
      cronExpression,
      scheduled_start_time: scheduledDate.toISOString()
    })

    const { error: rpcError } = await supabase.rpc("create_quiz_start_cron_job", {
      job_name: jobName,
      schedule: cronExpression,
      quiz_id: quiz.id
    })

    if (rpcError) {
      console.error("Failed to schedule cron job:", rpcError)
      return errorResponse("Failed to schedule quiz start", 500)
    }

    const { error: updateError } = await supabase
      .from("quizzes")
      .update({
        scheduled_start_time: scheduledDate.toISOString()
      })
      .eq("id", quiz.id)

    if (updateError) {
      console.error("Failed to update quiz schedule:", updateError)
      return errorResponse("Failed to update quiz schedule", 500)
    }

    console.log("Scheduled quiz start successfully", {
      quiz_id: quiz.id,
      scheduled_start_time: scheduledDate.toISOString()
    })

    return successResponse({
      success: true,
      quiz_id: quiz.id,
      scheduled_start_time: scheduledDate.toISOString()
    })
  } catch (error) {
    console.error("Error scheduling quiz start:", error)
    return errorResponse(error.message || "Internal server error", 500)
  }
})

