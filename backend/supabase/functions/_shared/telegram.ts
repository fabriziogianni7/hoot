const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN")
// Support both TELEGRAM_CHAT_ID and TELEGRAM_CHANNEL_ID for flexibility
const TELEGRAM_CHAT_ID = Deno.env.get("TELEGRAM_CHAT_ID") || Deno.env.get("TELEGRAM_CHANNEL_ID") // Can be chat ID (number) or username (string like @channelname)

export interface TelegramMessagePayload {
  quiz_id: string
  title: string
  description?: string | null
  prize_amount: number
  prize_token?: string | null
  scheduled_start_time?: string | null
  room_code?: string | undefined
  frontend_url?: string
}

export interface TelegramMessageResult {
  ok: boolean
  status: number
  error?: string
  responseBody?: unknown
}

/**
 * Formats the prize amount with token symbol
 */
function formatPrize(prizeAmount: number, prizeToken: string | null): string {
  const amount = prizeAmount.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4
  })
  
  if (!prizeToken) {
    return `${amount} ETH`
  }
  
  // For now, just show token address. Could be enhanced to fetch token symbol
  return `${amount} tokens`
}

/**
 * Formats the scheduled start time if available
 */
function formatScheduledTime(scheduledTime: string | null): string {
  if (!scheduledTime) return ""
  
  try {
    const date = new Date(scheduledTime)
    const now = new Date()
    const diffMs = date.getTime() - now.getTime()
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60))
    
    if (diffHours > 0) {
      return `in ${diffHours}h ${diffMinutes}m`
    } else if (diffMinutes > 0) {
      return `in ${diffMinutes} minutes`
    } else {
      return "soon"
    }
  } catch {
    return ""
  }
}

/**
 * Builds the message text for Telegram
 */
export function buildTelegramMessage(payload: TelegramMessagePayload): string {
  const { title, description, prize_amount, prize_token, scheduled_start_time, room_code, frontend_url } = payload
  
  let message = `🎯 *New Quiz with Prize!*\n\n`
  message += `📝 *${title}*\n\n`
  
  if (description) {
    message += `${description}\n\n`
  }
  
  const prize = formatPrize(prize_amount, prize_token)
  message += `💰 Prize: *${prize}*\n\n`
  
  if (scheduled_start_time) {
    const timeInfo = formatScheduledTime(scheduled_start_time)
    if (timeInfo) {
      message += `⏰ Starts ${timeInfo}\n\n`
    }
  }
  
  if (room_code) {
    message += `🔑 Room Code: \`${room_code}\`\n\n`
  }
  
  // Add link to quiz if frontend URL is available
  if (frontend_url) {
    // If room_code is available, link to lobby, otherwise link to quiz admin page
    const quizUrl = room_code 
      ? `${frontend_url}/quiz/lobby/${room_code}`
      : `${frontend_url}/quiz/admin?quizId=${payload.quiz_id}`
    message += `🔗 [Join Quiz](${quizUrl})`
  }
  
  return message
}

/**
 * Sends a message to a Telegram channel via bot
 */
export async function sendTelegramMessage(
  payload: TelegramMessagePayload
): Promise<TelegramMessageResult> {
  if (!TELEGRAM_BOT_TOKEN) {
    console.warn("[telegram] TELEGRAM_BOT_TOKEN is not set; skipping notification")
    return { ok: false, status: 0, error: "missing_bot_token" }
  }

  if (!TELEGRAM_CHAT_ID) {
    console.warn("[telegram] TELEGRAM_CHAT_ID is not set; skipping notification")
    return { ok: false, status: 0, error: "missing_chat_id" }
  }

  try {
    const messageText = buildTelegramMessage(payload)
    
    // Telegram Bot API endpoint
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`
    
    const requestBody = {
      chat_id: TELEGRAM_CHAT_ID,
      text: messageText,
      parse_mode: "Markdown",
      disable_web_page_preview: false
    }

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(requestBody)
    })

    const text = await res.text()
    let json: unknown = undefined
    try {
      json = text ? JSON.parse(text) : undefined
    } catch {
      console.warn("[telegram] Non-JSON response body", text)
    }

    if (!res.ok) {
      console.error("[telegram] Failed to send message", {
        status: res.status,
        body: text
      })
      return { ok: false, status: res.status, error: "http_error", responseBody: json ?? text }
    }

    console.log("[telegram] Message sent successfully", { status: res.status, body: json })
    return { ok: true, status: res.status, responseBody: json }
  } catch (e) {
    console.error("[telegram] Error sending message", e)
    return { ok: false, status: 0, error: e instanceof Error ? e.message : String(e) }
  }
}

