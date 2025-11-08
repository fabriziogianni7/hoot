export type MiniappClient = "farcaster" | "base" | "telegram" | "unknown";

export function detectMiniappClient(context: any): MiniappClient {
  try {
    const client = context?.client;
    const identifiers = [
      client?.name,
      client?.clientType,
      client?.app,
      client?.platform,
      context?.platform?.name
    ]
      .filter(Boolean)
      .map((value: unknown) => String(value).toLowerCase());

    if (identifiers.some((value) => value.includes("telegram"))) return "telegram";

    if (identifiers.some((value) => value.includes("base") || value.includes("baseapp") || value.includes("onchainkit"))) {
      return "base";
    }

    if (client?.clientFid || identifiers.some((value) => value.includes("farcaster") || value.includes("warpcast"))) {
      return "farcaster";
    }
  } catch (error) {
    console.warn("Failed to detect miniapp client", error);
  }

  return "unknown";
}


