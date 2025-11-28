"use client";

import { useEffect, useRef, useState } from "react";
import type {
  RealtimeChannel,
  RealtimePresenceState,
} from "@supabase/supabase-js";
import { useSupabase } from "./supabase-context";

type PresencePayload = {
  sessionId: string;
  joinedAt: number;
};

type DriverPresenceState = {
  isDriver: boolean;
  driverId: string | null;
  participants: string[];
};

const defaultState: DriverPresenceState = {
  isDriver: false,
  driverId: null,
  participants: [],
};

export function useDriverPresence(
  gameSessionId: string | null,
  playerSessionId: string | null,
  preferredDriverId?: string | null
) {
  const { supabase } = useSupabase();
  const channelRef = useRef<RealtimeChannel | null>(null);
  const [state, setState] = useState<DriverPresenceState>(defaultState);

  useEffect(() => {
    if (!gameSessionId || !playerSessionId) {
      setState(defaultState);
      return;
    }

    const channel = supabase.channel(`game_driver:${gameSessionId}`, {
      config: {
        presence: {
          key: playerSessionId,
        },
      },
    });

    const handleSync = () => {
      const presenceState = channel.presenceState<PresencePayload>();
      const participants = extractParticipants(presenceState);
      const driverId = electDriver(participants, preferredDriverId);

      setState({
        participants: participants.map((p) => p.sessionId),
        driverId,
        isDriver: driverId === playerSessionId,
      });
    };

    channel
      .on("presence", { event: "sync" }, handleSync)
      .on("presence", { event: "join" }, handleSync)
      .on("presence", { event: "leave" }, handleSync)
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          channel.track({
            sessionId: playerSessionId,
            joinedAt: Date.now(),
          });
        }
      });

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [gameSessionId, playerSessionId, preferredDriverId, supabase]);

  return state;
}

function extractParticipants(
  presenceState: RealtimePresenceState<PresencePayload>
): PresencePayload[] {
  const payloads: PresencePayload[] = [];
  Object.values(presenceState).forEach((entries) => {
    entries.forEach((entry) => {
      payloads.push(entry);
    });
  });
  return payloads;
}

function electDriver(
  participants: PresencePayload[],
  preferredDriverId?: string | null
): string | null {
  if (!participants.length) return null;

  if (preferredDriverId) {
    const preferredPresent = participants.find(
      (p) => p.sessionId === preferredDriverId
    );
    if (preferredPresent) {
      return preferredDriverId;
    }
  }

  const sorted = [...participants].sort((a, b) => {
    if (a.joinedAt === b.joinedAt) {
      return a.sessionId.localeCompare(b.sessionId);
    }
    return a.joinedAt - b.joinedAt;
  });

  return sorted[0]?.sessionId ?? null;
}

