import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { handleCorsPreFlight } from "../_shared/cors.ts"
import { successResponse, errorResponse } from "../_shared/response.ts"
import { initSupabaseClient } from "../_shared/supabase.ts"
import { sendFrameNotification } from "../_shared/neynar.ts"
import { sendTelegramMessage } from "../_shared/telegram.ts"

const NOTIFICATION_TARGET_FIDS = []
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
          description,
          prize_amount,
          prize_token,
          network_id,
          scheduled_start_time,
          scheduled_notification_sent,
          is_private
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
          description: string | null
          prize_amount: number | null
          prize_token: string | null
          network_id: string | null
          scheduled_start_time: string | null
          scheduled_notification_sent?: boolean | null
          is_private: boolean | null
        }
      | null

    if (!quiz) {
      console.error(
        "notify-game-session-created: quiz not found for game session",
        gameSessionId,
      )
      return errorResponse("Quiz not found", 404)
    }

    const hasPrizeAmount = (quiz.prize_amount ?? 0) > 0
    const hasPrizeToken = !!quiz.prize_token
    const hasPrize = hasPrizeAmount && hasPrizeToken
    const alreadyNotified = !!quiz.scheduled_notification_sent
    const isPrivate = !!quiz.is_private
    const hasScheduledTime = !!quiz.scheduled_start_time
    const scheduledInFuture = quiz.scheduled_start_time
      ? new Date(quiz.scheduled_start_time).getTime() > Date.now()
      : false

    // Send Telegram notification for any quiz with prize when game session is created
    // (regardless of whether it's scheduled or not)
    if (hasPrizeAmount && !quiz.is_private) {
      const frontendUrl = Deno.env.get("FRONTEND_URL") || Deno.env.get("FRONTEND_BASE_URL") || "http://localhost:3000"
      const roomCode = gameSession.room_code
      
      sendTelegramMessage({
        quiz_id: quiz.id,
        title: quiz.title,
        description: quiz.description || null,
        prize_amount: quiz.prize_amount || 0,
        prize_token: quiz.prize_token || null,
        scheduled_start_time: quiz.scheduled_start_time || null,
        room_code: roomCode,
        frontend_url: frontendUrl
      }).catch((error) => {
        // Log error but don't fail the notification
        console.error("Failed to send Telegram notification:", error)
      })
    }

    // Continue with Neynar notification logic for scheduled quizzes only
    if (
      !hasPrizeToken ||
      !hasPrizeAmount ||
      !hasScheduledTime ||
      !scheduledInFuture
    ) {
      console.log(
        "notify-game-session-created: skipping Neynar notification (not eligible)",
        {
          quizId: quiz.id,
          hasPrizeAmount,
          hasPrizeToken,
          isPrivate,
        },
      )
      return successResponse({
        success: true,
        skipped: true,
        reason: "Quiz has no prize or is private",
      })
    }

    if (alreadyNotified) {
      console.log(
        "notify-game-session-created: skipping Neynar notification (already notified)",
        { quizId: quiz.id },
      )
      return successResponse({
        success: true,
        skipped: true,
        reason: "Notification already sent",
      })
    }

    const scheduledTime = quiz.scheduled_start_time
      ? new Date(quiz.scheduled_start_time as string)
      : null

    const formattedTime = scheduledTime
      ? new Intl.DateTimeFormat("en-GB", {
        timeZone: "UTC",
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(scheduledTime) + " UTC"
      : "soon"

    // Resolve token symbol from tokens table (based on network_id + prize_token)
    let tokenSymbol = "tokens"
    if (quiz.prize_token && quiz.network_id) {
      const { data: token, error: tokenError } = await supabase
        .from("tokens")
        .select("symbol")
        .eq("network_id", quiz.network_id)
        .eq("address", quiz.prize_token)
        .single()

      if (tokenError) {
        console.warn(
          "notify-game-session-created: failed to fetch token symbol, using default",
          tokenError,
        )
      } else if (token?.symbol) {
        tokenSymbol = token.symbol
      }
    }

    const title = "New Quiz Scheduled"
    const bodyBase = `${quiz.title} starts at ${formattedTime} with ${quiz.prize_amount} ${tokenSymbol} in prizes. Open To Get Notified before it starts.`
    const body = bodyBase.length > 128 ? bodyBase.slice(0, 125) + "..." : bodyBase

    // Find the most recent game session for this quiz to get the lobby room code
    // Use the gameSession we already have instead of querying again
    let targetUrl: string
    if (gameSession.room_code) {
      const roomCode = gameSession.room_code as string
      targetUrl = `${FRONTEND_BASE_URL}/quiz/lobby/${roomCode}`
    } else {
      console.warn(
        "notify-game-session-created: no room code in game session, falling back to home page",
        { quizId: quiz.id },
      )
      targetUrl = `${FRONTEND_BASE_URL}`
    }

    console.log("notify-game-session-created: sending Neynar notification", {
      quizId: quiz.id,
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
      targetUrl,
    })

    return successResponse({
      success: true,
      quiz_id: quiz.id,
    })
  } catch (error) {
    console.error("Error in notify-game-session-created:", error)
    return errorResponse(
      (error as Error).message || "Internal server error",
      500,
    )
  }
})


