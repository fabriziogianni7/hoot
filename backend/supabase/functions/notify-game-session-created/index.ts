import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { handleCorsPreFlight } from "../_shared/cors.ts"
import { successResponse, errorResponse } from "../_shared/response.ts"
import { initSupabaseClient } from "../_shared/supabase.ts"
import { sendFrameNotification } from "../_shared/neynar.ts"

const NOTIFICATION_TARGET_FIDS = [372626]
const FRONTEND_BASE_URL =
  Deno.env.get("FRONTEND_BASE_URL") || "https://hoot-quiz.com"

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return handleCorsPreFlight()
  }

  try {
    console.log("notify-game-session-created: incoming request", {
      method: req.method,
      url: req.url,
    })

    const supabase = initSupabaseClient(req, true)

    const rawBody = await req.text()
    console.log("notify-game-session-created: raw body", rawBody)

    let payload: any = null
    try {
      payload = rawBody ? JSON.parse(rawBody) : null
    } catch (e) {
      console.warn(
        "notify-game-session-created: failed to parse JSON body",
        e,
      )
    }

    const url = new URL(req.url)
    const gameSessionId =
      payload?.game_session_id ||
      payload?.record?.id ||
      url.searchParams.get("game_session_id") ||
      undefined

    console.log(
      "notify-game-session-created: parsed payload",
      payload,
      "gameSessionId",
      gameSessionId,
    )

    if (!gameSessionId) {
      console.warn(
        "notify-game-session-created: missing game_session_id in payload",
      )
      return errorResponse("game_session_id is required", 400)
    }

    const { data: gameSession, error: gsError } = await supabase
      .from("game_sessions")
      .select(
        `
        id,
        room_code,
        quiz_id,
        quizzes (
          id,
          title,
          prize_amount,
          prize_token,
          network_id,
          scheduled_start_time,
          scheduled_notification_sent
        )
      `
      )
      .eq("id", gameSessionId)
      .single()

    if (gsError || !gameSession) {
      console.error(
        "notify-game-session-created: game session not found",
        gameSessionId,
        gsError,
      )
      return errorResponse("Game session not found", 404)
    }

    const quiz = gameSession.quizzes as
      | {
          id: string
          title: string
          prize_amount: number | null
          prize_token: string | null
          network_id: string | null
          scheduled_start_time: string | null
          scheduled_notification_sent?: boolean | null
        }
      | null

    if (!quiz) {
      console.error(
        "notify-game-session-created: quiz not found for game session",
        gameSessionId,
      )
      return errorResponse("Quiz not found for game session", 404)
    }

    const hasPrizeToken = !!quiz.prize_token
    const hasPrizeAmount = (quiz.prize_amount ?? 0) > 0
    const hasScheduledTime = !!quiz.scheduled_start_time
    const scheduledInFuture =
      hasScheduledTime &&
      new Date(quiz.scheduled_start_time as string).getTime() > Date.now()
    const alreadyNotified = !!quiz.scheduled_notification_sent

    if (
      !hasPrizeToken ||
      !hasPrizeAmount ||
      !hasScheduledTime ||
      !scheduledInFuture
    ) {
      console.log(
        "notify-game-session-created: skipping (not eligible)",
        {
          quizId: quiz.id,
          hasPrizeToken,
          hasPrizeAmount,
          hasScheduledTime,
          scheduledInFuture,
          scheduledStartTime: quiz.scheduled_start_time,
        },
      )
      return successResponse({
        success: true,
        skipped: true,
        reason: "Not a future scheduled prize quiz",
      })
    }

    if (alreadyNotified) {
      console.log(
        "notify-game-session-created: skipping (already notified)",
        { quizId: quiz.id },
      )
      return successResponse({
        success: true,
        skipped: true,
        reason: "Notification already sent",
      })
    }

    const scheduledTime = new Date(quiz.scheduled_start_time as string)
    const formattedTime =
      new Intl.DateTimeFormat("en-GB", {
        timeZone: "UTC",
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(scheduledTime) + " UTC"

    let tokenSymbol = "tokens"
    if (quiz.prize_token && quiz.network_id) {
      const { data: token, error: tokenError } = await supabase
        .from("tokens")
        .select("symbol")
        .eq("network_id", quiz.network_id)
        .eq("address", quiz.prize_token)
        .single()

      if (!tokenError && token?.symbol) {
        tokenSymbol = token.symbol
      }
    }

    const title = "New Quiz Scheduled"
    const bodyBase = `${quiz.title} starts at ${formattedTime} with ${quiz.prize_amount} ${tokenSymbol} in prizes`
    const body = bodyBase.length > 128 ? bodyBase.slice(0, 125) + "..." : bodyBase

    const roomCode = gameSession.room_code
    const targetUrl = `${FRONTEND_BASE_URL}/quiz/lobby/${roomCode}`

    console.log("notify-game-session-created: sending Neynar notification", {
      quizId: quiz.id,
      gameSessionId,
      roomCode,
      title,
      body,
      targetUrl,
    })

    const result = await sendFrameNotification({
      target_fids: NOTIFICATION_TARGET_FIDS,
      notification: {
        title,
        body,
        target_url: targetUrl,
        // Use the quiz.id itself as a valid UUID for idempotency
        uuid: quiz.id,
      },
    })

    if (!result.ok) {
      console.error(
        "notify-game-session-created: Neynar notification failed",
        result,
      )
      return errorResponse("Failed to send notification", 500)
    }

    await supabase
      .from("quizzes")
      .update({ scheduled_notification_sent: true })
      .eq("id", quiz.id)

    console.log("notify-game-session-created: notification sent and quiz updated", {
      quizId: quiz.id,
      gameSessionId,
      roomCode,
    })

    return successResponse({
      success: true,
      game_session_id: gameSessionId,
      room_code: roomCode,
    })
  } catch (error) {
    console.error("Error in notify-game-session-created:", error)
    return errorResponse(
      (error as Error).message || "Internal server error",
      500,
    )
  }
})


