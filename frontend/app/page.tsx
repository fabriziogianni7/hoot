"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useMiniKit } from "@coinbase/onchainkit/minikit";
import { useRouter } from "next/navigation";
import { useQuiz } from "@/lib/quiz-context";
import { sdk } from "@farcaster/miniapp-sdk";
import { useAuth } from "@/lib/use-auth";
import SignInPrompt from "@/components/SignInPrompt";

export default function Home() {
  const { isFrameReady, setFrameReady } = useMiniKit();
  const [gamePin, setGamePin] = useState("");
  const router = useRouter();
  const [error, setError] = useState("");
  const { findGameByRoomCode } = useQuiz();
  const [isJoining, setIsJoining] = useState(false);
  const [isPinFocused, setIsPinFocused] = useState(false);

  // Use the shared authentication hook
  const {
    loggedUser,
    isAuthLoading,
    authError,
    showSignInPrompt,
    triggerAuth,
    handleSignInAccept,
    handleSignInDecline
  } = useAuth();

  // Badge text state
  const [badgeText, setBadgeText] = useState<{
    primary: string | null;
    secondary: string | null;
    statusColor?: string;
  }>({
    primary: "Connecting...",
    secondary: null,
    statusColor: "#fbbf24",
  });

  // Initialize the miniapp
  useEffect(() => {
    if (!isFrameReady) {
      setFrameReady();
    }

    // Force the body to have a black background
    document.body.style.backgroundColor = "black";

    // Call sdk.actions.ready() to hide splash screen and display content
    // This is required for Farcaster Mini Apps
    const initializeFarcasterSDK = async () => {
      try {
        await sdk.actions.ready();
        console.log("✅ Farcaster SDK ready - splash screen hidden");
      } catch (error) {
        console.error("❌ Error initializing Farcaster SDK:", error);
      }
    };

    initializeFarcasterSDK();

    // Cleanup function to reset the background color when component unmounts
    return () => {
      document.body.style.backgroundColor = "";
    };
  }, [setFrameReady, isFrameReady]);

  // Effect 1: Handle loading state
  useEffect(() => {
    if (isAuthLoading) {
      setBadgeText({
        primary: "Connecting...",
        secondary: null,
        statusColor: "#fbbf24", // Yellow for loading
      });
    }
  }, [isAuthLoading]);

  // Effect 2: Handle error state
  useEffect(() => {
    if (authError && !isAuthLoading) {
      setBadgeText({
        primary: "Not Connected",
        secondary: null,
        statusColor: "#ef4444", // Red for error
      });
    }
  }, [authError, isAuthLoading]);

  // Effect 3: Handle authenticated user data
  useEffect(() => {
    if (loggedUser?.isAuthenticated) {
      // ← Add the isAuthenticated check
      let primary: string | null = null;
      let secondary: string | null = null;
      let statusColor = "#4ade80"; // Green for connected

      // Check if user is authenticated and has data
      if (loggedUser.session?.user?.user_metadata?.display_name) {
        primary = loggedUser.session.user.user_metadata.display_name;
      }

      // Add Farcaster badge if user has FID
      if (loggedUser.fid || loggedUser.session?.user?.user_metadata?.fid) {
        secondary = "Farcaster";
      }

      // Add wallet address as tertiary info
      if (loggedUser.address) {
        const walletInfo = `${loggedUser.address.slice(
          0,
          6
        )}...${loggedUser.address.slice(-4)}`;
        if (secondary) {
          secondary = `${secondary} • ${walletInfo}`;
        } else {
          secondary = walletInfo;
        }
      } else if (!secondary) {
        secondary = "No wallet connected";
        statusColor = "#ef4444"; // Red for not connected
      }

      setBadgeText({ primary:primary, secondary:secondary || null, statusColor:statusColor });
    }
  }, [loggedUser]);

  

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();

    if (gamePin.trim() && !isJoining) {
      setIsJoining(true);
      setError("");

      try {
        // Find game session by room code
        const gameSession = await findGameByRoomCode(
          gamePin.trim().toUpperCase()
        );

        if (gameSession) {
          // Navigate to lobby with room code
          router.push(`/quiz/lobby/${gamePin.trim().toUpperCase()}`);
        } else {
          // Game session not found
          setError(
            `Game with PIN "${gamePin}" not found. Check the PIN and try again.`
          );
          setTimeout(() => setError(""), 5000);
        }
      } catch (err) {
        console.error("Error joining game:", err);
        setError("Error joining game. Please try again.");
        setTimeout(() => setError(""), 5000);
      } finally {
        setIsJoining(false);
      }
    }
  };

  const handleAuthenticate = async () => {
    // Wallet already connected, just trigger auth
    await triggerAuth(8453);
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        width: "100%",
        backgroundColor: "black",
        color: "white",
        position: "relative",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      {/* Background network effect */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundImage: "url('/network-bg.svg')",
          backgroundSize: "cover",
          backgroundPosition: "center",
          opacity: 0.4,
          zIndex: 0,
        }}
      />

      {/* Farcaster Auth in top right corner */}
      <div
        style={{
          position: "absolute",
          top: "1rem",
          right: "1rem",
          zIndex: 10,
        }}
      >
        <div
          style={{
            backgroundColor: "#795AFF",
            color: "white",
            padding: "0.5rem 1rem",
            borderRadius: "0.5rem",
            fontSize: "0.875rem",
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
          }}
        >
          {/* Status dot */}
          <div
            style={{
              width: "8px",
              height: "8px",
              borderRadius: "50%",
              backgroundColor: badgeText.statusColor || "#4ade80",
            }}
          ></div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "0.125rem",
            }}
          >
            {badgeText.primary && <div>{badgeText.primary}</div>}
            {badgeText.secondary &&
              !badgeText.secondary.includes("Farcaster") && (
                <div style={{ fontSize: "0.75rem", opacity: 0.8 }}>
                  {badgeText.secondary}
                </div>
              )}
          </div>
        </div>
      </div>

      {/* Logo and description */}
      <div
        style={{
          position: "absolute",
          top: "2rem",
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 10,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        <img
          src="/Logo.png"
          alt="Hoot Logo"
          style={{
            height: "230px",
            width: "auto",
          }}
        />
        {/* Description text - hide when PIN input is focused */}
        {!isPinFocused && (
          <p
            style={{
              color: "white",
              fontSize: "0.8rem",
              textAlign: "center",
              lineHeight: "1.3",
              opacity: 0.9,
              marginTop: "0.05rem",
              width: "250px",
            }}
          >
            You can use Hoot to join an existing quiz or to create new ones
          </p>
        )}
      </div>

      {/* Main content */}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          width: "100%",
          maxWidth: "400px",
          padding: "0 1.5rem",
          marginTop: "200px", // Reduced margin to move content higher
        }}
      >
        {/* Section 1 - Game pin input form */}
        <div
          style={{
            width: "100%",
            background:
              "linear-gradient(135deg, rgba(121, 90, 255, 0.1) 0%, rgba(121, 90, 255, 0.05) 100%)",
            borderRadius: "0.75rem",
            padding: "1.5rem",
            marginBottom: "1.5rem",
            border: gamePin.trim().length === 6 
              ? "3px solid rgba(121, 90, 255, 0.8)" 
              : "3px solid rgba(121, 90, 255, 0.2)",
            boxShadow: gamePin.trim().length === 6
              ? "0 8px 32px rgba(121, 90, 255, 0.4)"
              : "0 8px 32px rgba(121, 90, 255, 0.1)",
            transition: "border 0.2s ease, boxShadow 0.2s ease",
          }}
        >
          {/* Section label */}
          <div
            style={{
              color: "#795AFF",
              fontSize: "0.75rem",
              fontWeight: "500",
              marginBottom: "1rem",
              textAlign: "center",
            }}
          ></div>

          <form onSubmit={handleJoin} style={{ width: "100%" }}>
            <input
              type="text"
              value={gamePin}
              onChange={(e) => {
                const value = e.target.value
                  .toUpperCase()
                  .replace(/[^A-Z0-9]/g, "");
                if (value.length <= 6) {
                  setGamePin(value);
                }
              }}
              onFocus={() => setIsPinFocused(true)}
              onBlur={() => setIsPinFocused(false)}
              placeholder="Insert PIN"
              maxLength={6}
              style={{
                width: "100%",
                padding: "0.75rem",
                background:
                  "linear-gradient(135deg, rgba(121, 90, 255, 0.3) 0%, rgba(121, 90, 255, 0.2) 100%)",
                color: "white",
                border: `1px solid ${
                  gamePin.length === 6
                    ? "rgba(34, 197, 94, 0.5)"
                    : "rgba(121, 90, 255, 0.3)"
                }`,
                borderRadius: "0.5rem",
                marginBottom: "0.75rem",
                textAlign: "center",
                fontSize: "1rem",
                backdropFilter: "blur(5px)",
              }}
            />

            <button
              type="submit"
              disabled={isJoining || gamePin.trim().length !== 6}
              style={{
                width: "100%",
                padding: "0.75rem",
                backgroundColor:
                  isJoining || gamePin.trim().length !== 6
                    ? "rgba(121, 90, 255, 0.3)"
                    : "#795AFF",
                color: "white",
                border: "none",
                borderRadius: "0.5rem",
                cursor:
                  isJoining || gamePin.trim().length !== 6
                    ? "not-allowed"
                    : "pointer",
                fontSize: "1rem",
                fontWeight: "500",
                opacity: isJoining || gamePin.trim().length !== 6 ? 0.7 : 1,
              }}
            >
              {isJoining ? "Joining..." : "Join"}
            </button>
          </form>
        </div>

        {/* Error message */}
        {error && (
          <div
            style={{
              backgroundColor: "rgba(239, 68, 68, 0.2)",
              border: "1px solid #ef4444",
              borderRadius: "0.5rem",
              padding: "0.75rem",
              marginBottom: "2rem",
              width: "100%",
              textAlign: "center",
              color: "#fca5a5",
            }}
          >
            {error}
          </div>
        )}

        {/* Create quiz button */}
        {isAuthLoading ? (
          // Show loading state while checking authentication
          <div
            style={{
              width: "100%",
              padding: "0.75rem",
              backgroundColor: "rgba(121, 90, 255, 0.3)",
              color: "white",
              border: "none",
              borderRadius: "0.5rem",
              fontSize: "1rem",
              fontWeight: "500",
              textAlign: "center",
              opacity: 0.7,
            }}
          >
            Loading...
          </div>
        ) : loggedUser?.isAuthenticated && loggedUser?.session ? (
          // User is authenticated - show clickable link
          <Link
            href="/quiz/admin"
            style={{
              width: "100%",
              padding: "0.75rem",
              backgroundColor:
                gamePin.trim().length === 6
                  ? "rgba(121, 90, 255, 0.3)"
                  : "#795AFF",
              color: "white",
              border: "none",
              borderRadius: "0.5rem",
              cursor: "pointer",
              fontSize: "1rem",
              fontWeight: "500",
              marginBottom: "0",
              textAlign: "center",
              textDecoration: "none",
              opacity: gamePin.trim().length === 6 ? 0.7 : 1,
              pointerEvents: gamePin.trim().length === 6 ? "none" : "auto",
            }}
          >
            Create Quiz
          </Link>
        ) : (
          // User is not authenticated - show disabled button or prompt to connect
          <button
            onClick={() => handleAuthenticate()}
            style={{
              width: "100%",
              padding: "0.75rem",
              backgroundColor: "#795AFF",
              color: "white",
              border: "none",
              borderRadius: "0.5rem",
              fontSize: "1rem",
              fontWeight: "500",
              textAlign: "center",
              cursor: "pointer",
              transition: "opacity 0.2s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.8")}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
          >
            Connect Wallet to Create Quiz
          </button>
        )}

        {/* Help text */}
        <div
          style={{
            textAlign: "center",
            color: "#6b7280",
            fontSize: "0.875rem",
            lineHeight: "1.5",
            position: "fixed",
            bottom: "30px",
            left: 0,
            right: 0,
            width: "100%",
          }}
        >
          <p>
            Need help?
            <a
              href="https://t.me/hoot_quiz"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                color: "#6b7280",
                textDecoration: "underline",
                cursor: "pointer",
                marginLeft: "0.25rem",
              }}
            >
              Contact us
            </a>
          </p>
        </div>
      </div>

      {/* Sign In Prompt Modal */}
      {showSignInPrompt && (
        <>
          {console.log("🎯 Rendering SignInPrompt component")}
          <SignInPrompt
            onAccept={handleSignInAccept}
            onDecline={handleSignInDecline}
          />
        </>
      )}
    </div>
  );
}
