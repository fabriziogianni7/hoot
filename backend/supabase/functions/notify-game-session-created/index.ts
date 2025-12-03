import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { handleCorsPreFlight } from "../_shared/cors.ts"
import { successResponse, errorResponse } from "../_shared/response.ts"
import { initSupabaseClient } from "../_shared/supabase.ts"
import { sendFrameNotification } from "../_shared/neynar.ts"

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

    type QuizWebhookRecord = {
      id: string
      title: string
      prize_amount: number | null
      prize_token: string | null
      network_id: string | null
      scheduled_start_time: string | null
      scheduled_notification_sent?: boolean | null
      is_private?: boolean | null
    }

    let quizRecord: QuizWebhookRecord | null = null

    try {
      const requestBody = await req.json() as unknown
      console.log(
        "notify-game-session-created: parsed JSON body",
        JSON.stringify(requestBody, null, 2),
      )

      const looksLikeWebhook =
        requestBody &&
        typeof requestBody === "object" &&
        "record" in requestBody &&
        "old_record" in requestBody &&
        "type" in requestBody &&
        "table" in requestBody

      if (!looksLikeWebhook) {
        console.warn(
          "notify-game-session-created: ignoring non-webhook payload",
        )
        return successResponse({
          success: true,
          skipped: true,
          reason: "Event ignored: not a DB webhook payload",
        })
      }

      const { type, table, record } = requestBody as {
        type: string
        table: string
        record: QuizWebhookRecord
        old_record: QuizWebhookRecord | null
      }

      console.log(
        "notify-game-session-created: detected DB webhook payload",
        { type, table },
      )

      // Only handle UPDATE events on quizzes
      if (type !== "UPDATE" || table !== "quizzes") {
        console.log(
          "notify-game-session-created: ignoring event (not a quizzes UPDATE)",
        )
        return successResponse({
          success: true,
          skipped: true,
          reason: "Event ignored: not a quizzes UPDATE",
        })
      }

      if (!record || !record.id) {
        console.error(
          "notify-game-session-created: invalid webhook payload - missing record.id",
        )
        return errorResponse(
          "Invalid webhook payload: record.id is required",
          400,
        )
      }

      quizRecord = record
    } catch (e) {
      console.error(
        "notify-game-session-created: failed to parse JSON webhook payload",
        e,
      )
      return errorResponse("Invalid webhook payload", 400)
    }

    const quiz = quizRecord

    const hasPrizeAmount = (quiz.prize_amount ?? 0) > 0
    const hasPrizeToken = !!quiz.prize_token
    const hasPrize = hasPrizeAmount && hasPrizeToken
    const alreadyNotified = !!quiz.scheduled_notification_sent
    const isPrivate = !!quiz.is_private

    if (!hasPrize || isPrivate) {
      console.log(
        "notify-game-session-created: skipping (not eligible based on prize / is_private)",
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
        "notify-game-session-created: skipping (already notified)",
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
    let targetUrl: string
    const { data: gameSessions, error: gsError } = await supabase
      .from("game_sessions")
      .select("room_code, created_at")
      .eq("quiz_id", quiz.id)
      .order("created_at", { ascending: false })
      .limit(1)

    if (gsError) {
      console.warn(
        "notify-game-session-created: failed to fetch game session, falling back to admin page",
        gsError,
      )
      targetUrl = `${FRONTEND_BASE_URL}`
    } else if (gameSessions && gameSessions.length > 0) {
      const roomCode = gameSessions[0].room_code as string
      targetUrl = `${FRONTEND_BASE_URL}/quiz/lobby/${roomCode}`
    } else {
      console.warn(
        "notify-game-session-created: no game sessions found for quiz, falling back to home page",
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


