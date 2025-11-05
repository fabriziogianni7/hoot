"use client";

import { useEffect, useState, useRef } from "react";
import { useSupabase } from "./supabase-context";
import type { RealtimeChannel } from "@supabase/supabase-js";

// Player session type
export type PlayerSession = {
  id: string;
  player_name: string;
  wallet_address?: string | null;
  total_score: number;
  joined_at: string;
};

// Player response type for answers tracking
export type PlayerResponse = {
  answered: boolean;
  isCorrect?: boolean;
};

// Options for player sessions hook
type PlayerSessionsOptions = {
  initialFetch?: boolean;
  sortBy?: "joined_at" | "total_score";
};

/**
 * Custom hook for real-time player sessions tracking
 * Subscribes to INSERT, UPDATE, DELETE events on player_sessions table
 */
export function usePlayerSessionsRealtime(
  gameSessionId: string | null,
  options: PlayerSessionsOptions = {}
) {
  const { initialFetch = true, sortBy = "joined_at" } = options;
  const { supabase } = useSupabase();
  
  const [players, setPlayers] = useState<PlayerSession[]>([]);
  const [isConnected, setIsConnected] = useState(true);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const [isReconnecting, setIsReconnecting] = useState(false);
  
  const reconnectAttemptsRef = useRef(0);
  const isReconnectingRef = useRef(false);
  const reconnectTimerRef = useRef<NodeJS.Timeout | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    if (!gameSessionId || !supabase) return;

    let isSubscribed = true;

    // Fetch initial players
    const fetchPlayers = async () => {
      if (!initialFetch) return;
      
      const { data, error } = await supabase
        .from("player_sessions")
        .select("id, player_name, wallet_address, total_score, joined_at")
        .eq("game_session_id", gameSessionId)
        .order(sortBy, { ascending: sortBy === "joined_at" });

      if (error) {
        console.error("Error fetching players:", error);
        return;
      }

      if (isSubscribed && data) {
        console.log("Initial players loaded:", data);
        setPlayers(data);
      }
    };

    fetchPlayers();

    const setupChannel = () => {
      // Prevent duplicate subscriptions
      if (!isSubscribed) {
        console.log("Already unsubscribed, skipping channel setup");
        return;
      }

      // Clean up existing channel if any
      if (channelRef.current) {
        console.log("Removing existing channel before reconnecting");
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }

      const attemptNumber = reconnectAttemptsRef.current + 1;
      console.log(`Setting up player sessions channel (attempt ${attemptNumber})`);

      channelRef.current = supabase
        .channel(`player_sessions:${gameSessionId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "player_sessions",
            filter: `game_session_id=eq.${gameSessionId}`,
          },
          (payload) => {
            console.log("🎮 New player joined:", payload.new);
            if (isSubscribed) {
              const newPlayer = payload.new as PlayerSession;
              setPlayers((prev) => {
                // Check if player already exists (avoid duplicates)
                if (prev.some((p) => p.id === newPlayer.id)) {
                  return prev;
                }
                const updated = [...prev, newPlayer];
                return sortBy === "joined_at"
                  ? updated.sort(
                      (a, b) =>
                        new Date(a.joined_at).getTime() -
                        new Date(b.joined_at).getTime()
                    )
                  : updated.sort((a, b) => b.total_score - a.total_score);
              });
            }
          }
        )
        .on(
          "postgres_changes",
          {
            event: "DELETE",
            schema: "public",
            table: "player_sessions",
            filter: `game_session_id=eq.${gameSessionId}`,
          },
          (payload) => {
            console.log("👋 Player left:", payload.old);
            if (isSubscribed) {
              setPlayers((prev) => prev.filter((p) => p.id !== payload.old.id));
            }
          }
        )
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "player_sessions",
            filter: `game_session_id=eq.${gameSessionId}`,
          },
          (payload) => {
            console.log("🔄 Player updated:", payload.new);
            if (isSubscribed) {
              const updatedPlayer = payload.new as PlayerSession;
              setPlayers((prev) => {
                const updated = prev.map((p) =>
                  p.id === updatedPlayer.id ? updatedPlayer : p
                );
                return sortBy === "total_score"
                  ? updated.sort((a, b) => b.total_score - a.total_score)
                  : updated;
              });
            }
          }
        )
        .subscribe((status, err) => {
          console.log("Player sessions channel status:", status);
          if (err) {
            console.error("Player sessions channel error:", err);
          }

          if (status === "SUBSCRIBED") {
            console.log("✅ Player sessions channel connected successfully");
            reconnectAttemptsRef.current = 0;
            isReconnectingRef.current = false;
            setIsConnected(true);
            setIsReconnecting(false);
            setReconnectAttempts(0);
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            console.error("❌ Player sessions connection error:", status, err);

            // Only handle reconnection if not already reconnecting
            if (!isReconnectingRef.current && isSubscribed) {
              setIsConnected(false);

              // Auto-reconnect with exponential backoff
              const maxAttempts = 10;
              const currentAttempt = reconnectAttemptsRef.current + 1;

              if (currentAttempt <= maxAttempts) {
                isReconnectingRef.current = true;
                reconnectAttemptsRef.current = currentAttempt;
                setIsReconnecting(true);
                setReconnectAttempts(currentAttempt);

                // Exponential backoff: 1s, 2s, 4s, 8s, up to max 30s
                const delay = Math.min(
                  1000 * Math.pow(2, currentAttempt - 1),
                  30000
                );

                console.log(
                  `Will retry player sessions connection in ${delay}ms (attempt ${currentAttempt}/${maxAttempts})`
                );

                reconnectTimerRef.current = setTimeout(() => {
                  isReconnectingRef.current = false;
                  setupChannel(); // Recursive call to retry
                }, delay);
              } else {
                console.error("Max reconnection attempts reached");
                isReconnectingRef.current = false;
                setIsReconnecting(false);
              }
            }
          } else if (status === "CLOSED") {
            console.log("Player sessions channel closed");
          }
        });
    };

    setupChannel();

    return () => {
      console.log("Cleaning up player sessions channel");
      isSubscribed = false;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [gameSessionId, supabase, initialFetch, sortBy]);

  return {
    players,
    isConnected,
    reconnectAttempts,
    isReconnecting,
  };
}

/**
 * Custom hook for real-time answers tracking
 * Subscribes to INSERT events on answers table
 * Used by quiz creators to see player responses in real-time
 */
export function useAnswersRealtime(
  gameSessionId: string | null,
  playerIds: string[],
  enabled: boolean = true
) {
  const { supabase } = useSupabase();
  const [playerResponses, setPlayerResponses] = useState<
    Record<string, PlayerResponse>
  >({});

  useEffect(() => {
    if (!enabled || !gameSessionId || !supabase || playerIds.length === 0) {
      return;
    }

    console.log("Setting up answers realtime channel");

    // Subscribe to real-time answer updates
    const answersChannel = supabase
      .channel(`answers:${gameSessionId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "answers",
          filter: `player_session_id=in.(${playerIds.join(",")})`,
        },
        (payload) => {
          const answer = payload.new as any;
          console.log("📝 New answer received:", answer);
          setPlayerResponses((prev) => ({
            ...prev,
            [answer.player_session_id]: {
              answered: true,
              isCorrect: answer.is_correct,
            },
          }));
        }
      )
      .subscribe((status, err) => {
        console.log("Answers channel status:", status);
        if (err) {
          console.error("Answers channel error:", err);
        }
      });

    return () => {
      console.log("Cleaning up answers channel");
      supabase.removeChannel(answersChannel);
    };
  }, [enabled, gameSessionId, supabase, playerIds]);

  return {
    playerResponses,
  };
}

