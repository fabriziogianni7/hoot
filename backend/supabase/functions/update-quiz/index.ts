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

    const updateData: Record<string, unknown> = {}

    if (typeof payload.title === "string") {
      updateData.title = payload.title
    }

    if (typeof payload.description === "string" || payload.description === null) {
      updateData.description = payload.description
    }

    let shouldSchedule = false
    let shouldCancel = false
    let scheduledDate: Date | null = null

    if (payload.hasOwnProperty("scheduled_start_time")) {
      if (payload.scheduled_start_time === null || payload.scheduled_start_time === "") {
        shouldCancel = !!quiz.scheduled_start_time
        updateData.scheduled_start_time = null
      } else {
        scheduledDate = new Date(payload.scheduled_start_time)
        if (isNaN(scheduledDate.getTime())) {
          return errorResponse("scheduled_start_time must be a valid date", 400)
        }
        if (scheduledDate.getTime() < Date.now() + 60_000) {
          return errorResponse("scheduled_start_time must be at least 1 minute in the future", 400)
        }
        if (quiz.status !== "pending") {
          return errorResponse("Only pending quizzes can be scheduled", 400)
        }
        shouldSchedule = true
        updateData.scheduled_start_time = scheduledDate.toISOString()
      }
    }

    if (Object.keys(updateData).length === 0) {
      return errorResponse("No updates provided", 400)
    }

    const { error: updateError } = await supabase
      .from("quizzes")
      .update(updateData)
      .eq("id", quiz.id)

    if (updateError) {
      console.error("Failed to update quiz:", updateError)
      return errorResponse("Failed to update quiz", 500)
    }

    const jobName = `start_quiz_${quiz.id}`

    if (shouldCancel) {
      const { error: cancelError } = await supabase.rpc("cancel_quiz_start_cron_job", {
        job_name: jobName
      })
      if (cancelError) {
        console.error("Failed to cancel cron job:", cancelError)
        return errorResponse("Failed to cancel scheduled start", 500)
      }
    }

    if (shouldSchedule && scheduledDate) {
      const cronExpression = buildCronExpression(scheduledDate)
      const { error: scheduleError } = await supabase.rpc("create_quiz_start_cron_job", {
        job_name: jobName,
        schedule: cronExpression,
        quiz_id: quiz.id
      })
      if (scheduleError) {
        console.error("Failed to schedule cron job:", scheduleError)
        return errorResponse("Failed to schedule quiz start", 500)
      }
    }

    return successResponse({
      success: true,
      quiz_id: quiz.id
    })
  } catch (error) {
    console.error("Error updating quiz:", error)
    return errorResponse(error.message || "Internal server error", 500)
  }
})

