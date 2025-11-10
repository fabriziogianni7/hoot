export type MiniappClient = "farcaster" | "base" | "telegram" | "unknown";

const FARCASTER_CLIENT_FIDS = new Set([9152]);
const BASE_IDENTIFIERS = ["base", "baseapp", "onchainkit"];

export function detectMiniappClient(context: any): MiniappClient {
  try {
    const client = context?.client;
    const identifiers = [
      client?.name,
      client?.clientType,
      client?.app,
      client?.platform,
      client?.platformType,
      client?.hostApp,
      context?.platform?.name
    ]
      .filter(Boolean)
      .map((value: unknown) => String(value).toLowerCase());

    if (identifiers.some((value) => value.includes("telegram"))) return "telegram";

    if (identifiers.some((value) => BASE_IDENTIFIERS.some((needle) => value.includes(needle)))) {
      return "base";
    }

    if (
      (typeof client?.clientFid === "number" && FARCASTER_CLIENT_FIDS.has(client.clientFid)) ||
      identifiers.some((value) => value.includes("farcaster") || value.includes("warpcast"))
    ) {
      return "farcaster";
    }
    if (
      typeof client?.clientFid === "number" &&
      !Number.isNaN(client.clientFid) &&
      client.clientFid > 0
    ) {
      // Unknown client FIDs should not default to Farcaster; treat as base if running inside Base Mini app by default.
      return "base";
    }
  } catch (error) {
    console.warn("Failed to detect miniapp client", error);
  }

  return "unknown";
}


