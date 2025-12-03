 "use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

type SfxType = "correct" | "wrong" | "tick";

interface SoundContextValue {
  soundEnabled: boolean;
  toggleSound: () => void;
  setSoundEnabled: (enabled: boolean) => void;
  backgroundEnabled: boolean;
  setBackgroundEnabled: (enabled: boolean) => void;
  playSfx: (type: SfxType) => void;
}

const SoundContext = createContext<SoundContextValue | undefined>(undefined);

const STORAGE_KEY = "hoot_sound_enabled";

const SFX_SOURCES: Record<SfxType, string> = {
  correct: "/sounds/correct-answer.wav",
  wrong: "/sounds/wrong-answer.wav",
  tick: "/sounds/timer.ogg",
};

export function SoundProvider({ children }: { children: ReactNode }) {
  const [soundEnabled, setSoundEnabledState] = useState<boolean>(true);
  const [backgroundEnabled, setBackgroundEnabledState] = useState<boolean>(true);
  const sfxRefs = useRef<Partial<Record<SfxType, HTMLAudioElement>>>({});

  // Load initial preference from localStorage
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored !== null) {
        setSoundEnabledState(stored === "true");
      }
    } catch {
      // ignore storage errors
    }
  }, []);

  // Persist preference
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(STORAGE_KEY, soundEnabled ? "true" : "false");
    } catch {
      // ignore storage errors
    }
  }, [soundEnabled]);

  const setSoundEnabled = useCallback((enabled: boolean) => {
    setSoundEnabledState(enabled);
  }, []);

  const setBackgroundEnabled = useCallback((enabled: boolean) => {
    setBackgroundEnabledState(enabled);
  }, []);

  const toggleSound = useCallback(() => {
    setSoundEnabledState((prev) => !prev);
  }, []);

  const playSfx = useCallback(
    (type: SfxType) => {
      if (!soundEnabled) return;
      if (typeof window === "undefined") return;

      let audio = sfxRefs.current[type];
      if (!audio) {
        const src = SFX_SOURCES[type];
        audio = new Audio(src);
        audio.volume = type === "tick" ? 0.4 : 0.8;
        sfxRefs.current[type] = audio;
      }

      try {
        // Restart from beginning for quick repeated sounds
        audio.currentTime = 0;
        // Play may be blocked by autoplay policies; ignore errors
        void audio.play();
      } catch {
        // ignore
      }
    },
    [soundEnabled]
  );

  const value = useMemo(
    () => ({
      soundEnabled,
      toggleSound,
      setSoundEnabled,
      backgroundEnabled,
      setBackgroundEnabled,
      playSfx,
    }),
    [soundEnabled, toggleSound, setSoundEnabled, backgroundEnabled, setBackgroundEnabled, playSfx]
  );

  return <SoundContext.Provider value={value}>{children}</SoundContext.Provider>;
}

export function useSound() {
  const ctx = useContext(SoundContext);
  if (!ctx) {
    throw new Error("useSound must be used within a SoundProvider");
  }
  return ctx;
}


