import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { handleCorsPreFlight } from "../_shared/cors.ts"
import { successResponse, errorResponse } from "../_shared/response.ts"
import { validateRequired } from "../_shared/validation.ts"
import { initSupabaseClient } from "../_shared/supabase.ts"
import { sendTelegramMessage } from "../_shared/telegram.ts"

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
      .select("id, user_id, status, scheduled_start_time, title, description, prize_amount, prize_token, is_private, scheduled_start_time")
      .eq("id", payload.quiz_id)
      .single()

    if (quizError || !quiz) {
      return errorResponse("Quiz not found", 404)
    }

    if (quiz.user_id !== user.id) {
      return errorResponse("Forbidden", 403)
    }

    // Track if bounty is being added (prize_amount going from 0 or null to > 0)
    const oldPrizeAmount = quiz.prize_amount || 0
    const isBountyBeingAdded = 
      payload.hasOwnProperty("prize_amount") && 
      (typeof payload.prize_amount === "number") &&
      payload.prize_amount > 0 && 
      oldPrizeAmount === 0

    const updateData: Record<string, unknown> = {}

    if (typeof payload.title === "string") {
      updateData.title = payload.title
    }

    if (typeof payload.description === "string" || payload.description === null) {
      updateData.description = payload.description
    }

    if (payload.hasOwnProperty("prize_amount") && typeof payload.prize_amount === "number") {
      updateData.prize_amount = payload.prize_amount
    }

    if (payload.hasOwnProperty("prize_token")) {
      updateData.prize_token = payload.prize_token || null
    }

    if (payload.hasOwnProperty("contract_address")) {
      updateData.contract_address = payload.contract_address || null
    }

    if (payload.hasOwnProperty("contract_tx_hash")) {
      updateData.contract_tx_hash = payload.contract_tx_hash || null
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

    // Send Telegram notification if bounty is being added and quiz is not private
    if (isBountyBeingAdded && !quiz.is_private) {
      const frontendUrl = Deno.env.get("FRONTEND_URL") || Deno.env.get("FRONTEND_BASE_URL") || "http://localhost:3000"
      const finalPrizeAmount = (payload.prize_amount as number) || 0
      const finalPrizeToken = payload.prize_token || quiz.prize_token || null
      
      sendTelegramMessage({
        quiz_id: quiz.id,
        title: quiz.title || "Quiz",
        description: quiz.description || null,
        prize_amount: finalPrizeAmount,
        prize_token: finalPrizeToken,
        scheduled_start_time: quiz.scheduled_start_time || null,
        room_code: undefined,
        frontend_url: frontendUrl
      }).catch((error) => {
        // Log error but don't fail the update
        console.error("Failed to send Telegram notification:", error)
      })
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

