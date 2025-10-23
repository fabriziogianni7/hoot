"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useMiniKit } from "@coinbase/onchainkit/minikit";
import { useRouter } from "next/navigation";
import { useQuiz } from "@/lib/quiz-context";
import { useAuth } from "@/lib/use-auth";
import { FarcasterAuth } from "@/components/FarcasterAuth";
import { sdk } from '@farcaster/miniapp-sdk';

export default function Home() {
  const { isFrameReady, setFrameReady } = useMiniKit();
  const [gamePin, setGamePin] = useState("");
  const router = useRouter();
  const [error, setError] = useState("");
  const { findGameByRoomCode } = useQuiz();
  const [isJoining, setIsJoining] = useState(false);
  
  // Initialize authentication (runs in background for Supabase session)
  useAuth();

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
        console.log('✅ Farcaster SDK ready - splash screen hidden');
      } catch (error) {
        console.error('❌ Error initializing Farcaster SDK:', error);
      }
    };
    
    initializeFarcasterSDK();
    
    // Cleanup function to reset the background color when component unmounts
    return () => {
      document.body.style.backgroundColor = "";
    };
  }, [setFrameReady, isFrameReady]);

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
      
      {/* Farcaster Auth in top right corner */}
      <div style={{
        position: "absolute",
        top: "1rem",
        right: "1rem",
        zIndex: 10
      }}>
        <FarcasterAuth 
          size={48}
        />
      </div>
      
      {/* Logo and description */}
      <div style={{
        position: "absolute",
        top: "2rem",
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 10,
        display: "flex",
        flexDirection: "column",
        alignItems: "center"
      }}>
        <img 
          src="/Logo.png" 
          alt="Hoot Logo" 
          style={{
            height: "230px",
            width: "auto"
          }}
        />
        {/* Description text */}
        <p style={{
          color: "white",
          fontSize: "0.8rem",
          textAlign: "center",
          lineHeight: "1.3",
          opacity: 0.9,
          marginTop: "0.05rem",
          width: "250px"
        }}>
          You can use Hoot to join an existing quiz or to create new ones
        </p>
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
        padding: "0 1.5rem",
        marginTop: "200px" // Reduced margin to move content higher
      }}>
        
        {/* Section 1 - Game pin input form */}
        <div style={{
          width: "100%",
          background: "linear-gradient(135deg, rgba(138, 99, 210, 0.1) 0%, rgba(138, 99, 210, 0.05) 100%)",
          borderRadius: "0.75rem",
          padding: "1.5rem",
          marginBottom: "1.5rem",
          border: "3px solid rgba(138, 99, 210, 0.2)",
          boxShadow: "0 8px 32px rgba(138, 99, 210, 0.1)"
        }}>
          {/* Section label */}
          <div style={{
            color: "#8A63D2",
            fontSize: "0.75rem",
            fontWeight: "500",
            marginBottom: "1rem",
            textAlign: "center"
          }}>
          </div>
          
          <form onSubmit={handleJoin} style={{ width: "100%" }}>
            <input
              type="text"
              value={gamePin}
              onChange={(e) => {
                const value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
                if (value.length <= 6) {
                  setGamePin(value);
                }
              }}
              placeholder="Insert PIN"
              maxLength={6}
              style={{
                width: "100%",
                padding: "0.75rem",
                background: "linear-gradient(135deg, rgba(138, 99, 210, 0.3) 0%, rgba(138, 99, 210, 0.2) 100%)",
                color: "white",
                border: `1px solid ${gamePin.length === 6 ? 'rgba(34, 197, 94, 0.5)' : 'rgba(138, 99, 210, 0.3)'}`,
                borderRadius: "0.5rem",
                marginBottom: "0.75rem",
                textAlign: "center",
                fontSize: "1rem",
                backdropFilter: "blur(5px)"
              }}
            />
            
            <button
              type="submit"
              disabled={isJoining || gamePin.trim().length !== 6}
              style={{
                width: "100%",
                padding: "0.75rem",
                background: (isJoining || gamePin.trim().length !== 6)
                  ? "linear-gradient(135deg, rgba(138, 99, 210, 0.3) 0%, rgba(138, 99, 210, 0.2) 100%)"
                  : "linear-gradient(135deg, rgba(138, 99, 210, 0.4) 0%, rgba(138, 99, 210, 0.3) 100%)",
                color: "white",
                border: "1px solid rgba(138, 99, 210, 0.3)",
                borderRadius: "0.5rem",
                cursor: (isJoining || gamePin.trim().length !== 6) ? "not-allowed" : "pointer",
                fontSize: "1rem",
                fontWeight: "500",
                opacity: (isJoining || gamePin.trim().length !== 6) ? 0.7 : 1,
                backdropFilter: "blur(5px)"
              }}
            >
              {isJoining ? "Joining..." : "Join"}
            </button>
          </form>
        </div>
        
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
        
        {/* Help text */}
        <div style={{
          textAlign: "center",
          color: "#6b7280",
          fontSize: "0.875rem",
          lineHeight: "1.5",
          position: "fixed",
          bottom: "30px",
          left: 0,
          right: 0,
          width: "100%"
        }}>
          <p>
            Need help? 
            <a 
              href="#" 
              style={{ 
                color: "#6b7280", 
                textDecoration: "underline",
                cursor: "pointer",
                marginLeft: "0.25rem"
              }}
            >
              Contact us
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}