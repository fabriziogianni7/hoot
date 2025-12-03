"use client";

import { useEffect, useRef } from "react";
import { useSound } from "@/lib/sound-context";

// Playlist of background tracks. One of these will be chosen at random
// as the starting track, then the rest will follow in order.
const BACKGROUND_TRACKS: string[] = [
  "/sounds/background2.wav",
  "/sounds/background3.mp3",
  "/sounds/background4.flac",
  "/sounds/background5.flac",
  "/sounds/background6.wav",
  "/sounds/background7.wav",
  "/sounds/background8.wav",
];

export default function BackgroundMusicPlayer() {
  const { soundEnabled, backgroundEnabled } = useSound();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const currentIndexRef = useRef<number>(0);
  const soundEnabledRef = useRef<boolean>(soundEnabled);
  const backgroundEnabledRef = useRef<boolean>(backgroundEnabled);

  // Keep a ref in sync with the latest soundEnabled value
  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
  }, [soundEnabled]);

  // Keep a ref in sync with the latest backgroundEnabled value
  useEffect(() => {
    backgroundEnabledRef.current = backgroundEnabled;
  }, [backgroundEnabled]);

  // Initialize audio element and playlist on the client
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!BACKGROUND_TRACKS.length) return;

    const audio = new Audio();
    audio.volume = 0.35;

    const pickRandomStartIndex = () => {
      return Math.floor(Math.random() * BACKGROUND_TRACKS.length);
    };

    const loadCurrentTrack = () => {
      const src = BACKGROUND_TRACKS[currentIndexRef.current];
      if (!src) return;
      audio.src = src;
      audio.load();
      // Log which background track is currently loaded
      console.log("[BackgroundMusic] Now playing:", src);
    };

    currentIndexRef.current = pickRandomStartIndex();
    console.log(
      "[BackgroundMusic] Initial track index:",
      currentIndexRef.current
    );
    loadCurrentTrack();

    const handleEnded = () => {
      if (!BACKGROUND_TRACKS.length) return;
      // Advance to next track (wrap around)
      currentIndexRef.current =
        (currentIndexRef.current + 1) % BACKGROUND_TRACKS.length;
      console.log(
        "[BackgroundMusic] Track ended, advancing to index:",
        currentIndexRef.current
      );
      loadCurrentTrack();
      if (soundEnabledRef.current && backgroundEnabledRef.current) {
        void audio.play().catch(() => {
          // ignore autoplay errors
        });
      }
    };

    audio.addEventListener("ended", handleEnded);
    audioRef.current = audio;

    return () => {
      audio.removeEventListener("ended", handleEnded);
      try {
        audio.pause();
      } catch {
        // ignore
      }
      audioRef.current = null;
    };
  }, []);

  // React to soundEnabled changes
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (soundEnabled && backgroundEnabled) {
      void audio.play().catch(() => {
        // Autoplay might be blocked; ignore
      });
    } else {
      try {
        audio.pause();
      } catch {
        // ignore
      }
    }
  }, [soundEnabled]);

  return null;
}



