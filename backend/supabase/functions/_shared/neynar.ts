const NEYNAR_BASE_URL = Deno.env.get("NEYNAR_BASE_URL") || "https://api.neynar.com"
const NEYNAR_API_KEY = Deno.env.get("NEYNAR_API_KEY")

export interface FrameNotificationPayload {
  target_fids?: number[]
  filters?: {
    exclude_fids?: number[]
    following_fid?: number
    minimum_user_score?: number
    near_location?: {
      latitude: number
      longitude: number
      address?: {
        city: string
        state?: string
        state_code?: string
        country: string
        country_code?: string
      }
      radius?: number
    }
  }
  notification: {
    title: string
    body: string
    target_url: string
    uuid?: string
  }
}

export interface FrameNotificationResult {
  ok: boolean
  status: number
  error?: string
  responseBody?: unknown
}

export async function sendFrameNotification(
  payload: FrameNotificationPayload
): Promise<FrameNotificationResult> {
  if (!NEYNAR_API_KEY) {
    console.warn("[neynar] NEYNAR_API_KEY is not set; skipping notification")
    return { ok: false, status: 0, error: "missing_api_key" }
  }

  try {
    const res = await fetch(`${NEYNAR_BASE_URL}/v2/farcaster/frame/notifications/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": NEYNAR_API_KEY
      },
      body: JSON.stringify(payload)
    })

    const text = await res.text()
    let json: unknown = undefined
    try {
      json = text ? JSON.parse(text) : undefined
    } catch {
      // non‑JSON response, keep raw text in logs
      console.warn("[neynar] Non‑JSON response body", text)
    }

    if (!res.ok) {
      console.error("[neynar] Failed to send notification", {
        status: res.status,
        body: text
      })
      return { ok: false, status: res.status, error: "http_error", responseBody: json ?? text }
    }

    console.log("[neynar] Notification sent", { status: res.status, body: json })
    return { ok: true, status: res.status, responseBody: json }
  } catch (e) {
    console.error("[neynar] Error sending notification", e)
    return { ok: false, status: 0, error: e instanceof Error ? e.message : String(e) }
  }
}


