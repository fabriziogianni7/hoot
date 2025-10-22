"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useMiniKit, useQuickAuth } from "@coinbase/onchainkit/minikit";
import { useRouter } from "next/navigation";
import { useQuiz } from "@/lib/quiz-context";
import { useAccount } from "wagmi";
import { useSIWE } from "@/lib/use-siwe";

interface AuthResponse {
  success: boolean;
  user?: {
    fid: number;
    issuedAt?: number;
    expiresAt?: number;
  };
  message?: string;
}

export default function Home() {
  const { isFrameReady, setFrameReady, context } = useMiniKit();
  const { address } = useAccount();
  const [gamePin, setGamePin] = useState("");
  const router = useRouter();
  const [error, setError] = useState("");
  const { findGameByRoomCode } = useQuiz();
  const [isJoining, setIsJoining] = useState(false);
  
  // Supabase wallet authentication
  const { 
    data: siweData, 
    error: siweError, 
    isLoading: isSiweLoading, 
    isAuthenticated: isSiweAuthenticated 
  } = useSIWE();
  

  // Initialize the miniapp
  useEffect(() => {
    if (!isFrameReady) {
      setFrameReady();
    }
    
    // Force the body to have a black background
    document.body.style.backgroundColor = "black";
    
    // Cleanup function to reset the background color when component unmounts
    return () => {
      document.body.style.backgroundColor = "";
    };
  }, [setFrameReady, isFrameReady]);

  const { data: authData, isLoading: isAuthLoading, error: authError } = useQuickAuth<AuthResponse>(
    "/api/auth",
    { method: "GET" }
  );


  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (gamePin.trim() && !isJoining) {
      setIsJoining(true);
      setError("");
      
      try {
        // Find game session by room code
        const gameSession = await findGameByRoomCode(gamePin.trim().toUpperCase());
        
        if (gameSession) {
          // Navigate to lobby with room code
          router.push(`/quiz/lobby?room=${gamePin.trim().toUpperCase()}`);
        } else {
          // Game session not found
          setError(`Game with PIN "${gamePin}" not found. Check the PIN and try again.`);
          setTimeout(() => setError(""), 5000);
        }
      } catch (err) {
        console.error('Error joining game:', err);
        setError('Error joining game. Please try again.');
        setTimeout(() => setError(""), 5000);
      } finally {
        setIsJoining(false);
      }
    }
  };

  // Determina il testo da mostrare nel badge dell'utente
  const getUserBadgeText = () => {
    // Check loading states
    if (isAuthLoading || isSiweLoading) return { primary: "Connecting...", secondary: null };
    
    // Check for errors
    if (authError && siweError) return { primary: "Not Connected", secondary: null };
    
    let primary = "Connected";
    let secondary = null;
    let statusColor = "#4ade80"; // Green for connected
    
    // Priority: Farcaster auth first, then Supabase auth
    debugger
    if (authData?.success && context?.user?.displayName) {
      console.log('🔐 Farcaster auth data:', authData);
      primary = context.user.displayName;
      secondary = "Farcaster";
    } else if (authData?.success && authData?.user?.fid) {
      primary = `FID: ${authData.user.fid}`;
      secondary = "Farcaster";
    } else if (isSiweAuthenticated && siweData?.user) {
      primary = siweData.user.email || "Wallet User";
      secondary = "Supabase";
    }
    
    // Add wallet address as tertiary info
    if (address) {
      const walletInfo = `${address.slice(0, 6)}...${address.slice(-4)}`;
      if (secondary) {
        secondary = `${secondary} • ${walletInfo}`;
      } else {
        secondary = walletInfo;
      }
    } else if (!secondary) {
      secondary = "No wallet connected";
      statusColor = "#ef4444"; // Red for not connected
    }
    
    return { primary, secondary, statusColor };
  };

  return (
    <div style={{ 
      minHeight: "100vh", 
      width: "100%",
      backgroundColor: "black", 
      color: "white",
      position: "relative",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden"
    }}>
      {/* Background network effect */}
      <div style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundImage: "url('/network-bg.svg')",
        backgroundSize: "cover",
        backgroundPosition: "center",
        opacity: 0.4,
        zIndex: 0
      }} />
      
      {/* User badge in top right corner */}
      <div style={{
        position: "absolute",
        top: "1rem",
        right: "1rem",
        zIndex: 10
      }}>
        <div style={{
          backgroundColor: (authData?.success || isSiweAuthenticated) ? "#1e40af" : "#222",
          color: "white",
          padding: "0.5rem 1rem",
          borderRadius: "0.5rem",
          fontSize: "0.875rem",
          display: "flex",
          alignItems: "center",
          gap: "0.5rem"
        }}>
          {/* Status dot */}
          <div style={{
            width: "8px",
            height: "8px",
            borderRadius: "50%",
            backgroundColor: getUserBadgeText().statusColor || ((authData?.success || isSiweAuthenticated) ? "#4ade80" : "#ef4444")
          }}></div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.125rem" }}>
            <div>{getUserBadgeText().primary}</div>
            {getUserBadgeText().secondary && (
              <div style={{ fontSize: "0.75rem", opacity: 0.8 }}>
                {getUserBadgeText().secondary}
              </div>
            )}
          </div>
        </div>
      </div>
      
      {/* Logo */}
      <div style={{
        position: "absolute",
        top: "2rem",
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 10
      }}>
        <img 
          src="/Logo.png" 
          alt="Hoot Logo" 
          style={{
            height: "250px",
            width: "auto"
          }}
        />
      </div>

      {/* Main content */}
      <div style={{
        position: "relative",
        zIndex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        width: "100%",
        maxWidth: "400px",
        padding: "0 1.5rem"
      }}>
        
        {/* Game pin input form */}
        <form onSubmit={handleJoin} style={{ width: "100%" }}>
          <input
            type="text"
            value={gamePin}
            onChange={(e) => setGamePin(e.target.value)}
            placeholder="Pin for Game"
            style={{
              width: "100%",
              padding: "0.75rem",
              backgroundColor: "white",
              color: "black",
              border: "none",
              borderRadius: "0.5rem",
              marginBottom: "0.75rem",
            textAlign: "center",
            fontSize: "1rem"
          }}
        />
        
        <button
            type="submit"
            disabled={isJoining}
            style={{
              width: "100%",
              padding: "0.75rem",
              backgroundColor: isJoining ? "#444" : "#222",
              color: "white",
              border: "none",
              borderRadius: "0.5rem",
              cursor: isJoining ? "not-allowed" : "pointer",
              fontSize: "1rem",
              fontWeight: "500",
              marginBottom: "1rem",
              opacity: isJoining ? 0.7 : 1
            }}
          >
            {isJoining ? "Joining..." : "Jump"}
          </button>
        </form>
        
        {/* Error message */}
        {error && (
          <div style={{
            backgroundColor: "rgba(239, 68, 68, 0.2)",
            border: "1px solid #ef4444",
            borderRadius: "0.5rem",
            padding: "0.75rem",
            marginBottom: "2rem",
            width: "100%",
            textAlign: "center",
            color: "#fca5a5"
          }}>
            {error}
          </div>
        )}

        {/* Create quiz button */}
        <Link href="/quiz/admin" style={{
          width: "100%",
          padding: "0.75rem",
          backgroundColor: "#8A63D2",
          color: "white",
          border: "none",
          borderRadius: "0.5rem",
          cursor: "pointer",
          fontSize: "1rem",
          fontWeight: "500",
          marginBottom: "0",
          textAlign: "center",
          textDecoration: "none"
        }}>
          Create Quiz
        </Link>
        
        {/* Create quiz info text */}
        <div style={{
          textAlign: "center",
          color: "#aaa",
          fontSize: "0.875rem",
          lineHeight: "1.5",
          position: "fixed",
          bottom: "30px",
          left: 0,
          right: 0,
          width: "100%"
        }}>
          <p>
          Want attention that sticks?  
            <span style={{ fontWeight: "bold", color: "white" }}> Reward it with Hoot!</span>
          </p>
        </div>
      </div>
    </div>
  );
}