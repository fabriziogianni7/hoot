"use client";

import { sdk } from "@farcaster/miniapp-sdk";

type ImpactType = "light" | "medium" | "heavy" | "soft" | "rigid";
type NotificationType = "success" | "warning" | "error";

let capabilities: string[] | null = null;
let capabilitiesLoaded = false;

async function ensureCapabilities() {
  if (capabilitiesLoaded) return;
  capabilitiesLoaded = true;

  try {
    capabilities = await sdk.getCapabilities();
    console.log("[Haptics] Loaded capabilities:", capabilities);
  } catch (error) {
    console.warn("[Haptics] Failed to load capabilities", error);
    capabilities = [];
  }
}

function hasCapability(name: string): boolean {
  return Array.isArray(capabilities) && capabilities.includes(name);
}

export async function hapticImpact(type: ImpactType) {
  if (typeof window === "undefined") return;
  await ensureCapabilities();
  if (!hasCapability("haptics.impactOccurred")) return;

  try {
    await sdk.haptics.impactOccurred(type);
  } catch (error) {
    console.warn("[Haptics] impactOccurred failed", error);
  }
}

export async function hapticNotification(type: NotificationType) {
  if (typeof window === "undefined") return;
  await ensureCapabilities();
  if (!hasCapability("haptics.notificationOccurred")) return;

  try {
    await sdk.haptics.notificationOccurred(type);
  } catch (error) {
    console.warn("[Haptics] notificationOccurred failed", error);
  }
}

export async function hapticSelection() {
  if (typeof window === "undefined") return;
  await ensureCapabilities();
  if (!hasCapability("haptics.selectionChanged")) return;

  try {
    await sdk.haptics.selectionChanged();
  } catch (error) {
    console.warn("[Haptics] selectionChanged failed", error);
  }
}


