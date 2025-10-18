"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useMiniKit } from "@coinbase/onchainkit/minikit";
import { useRouter } from "next/navigation";
import Head from "next/head";

export default function QuizLobbyPage() {
  const { isFrameReady, setFrameReady } = useMiniKit();
  const [gamePin, setGamePin] = useState("");
  const router = useRouter();

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

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (gamePin.trim()) {
      router.push(`/quiz/join?pin=${gamePin}`);
    }
  };

  return (
    <>
      <Head>
        <style>{`
          body {
            background-color: black !important;
            margin: 0;
            padding: 0;
          }
        `}</style>
      </Head>
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
        
        {/* Wallet button in top right corner */}
        <div style={{
          position: "absolute",
          top: "1rem",
          right: "1rem",
          zIndex: 10
        }}>
          <button style={{
            backgroundColor: "#222",
            color: "white",
            padding: "0.5rem 1rem",
            borderRadius: "0.5rem",
            border: "none",
            fontSize: "0.875rem"
          }}>
            Wallet
          </button>
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
          {/* Logo */}
          <div style={{
            fontSize: "3rem",
            fontWeight: "bold",
            marginBottom: "2.5rem",
            letterSpacing: "0.05em"
          }}>
            LOGO
          </div>
          
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
              style={{
                width: "100%",
                padding: "0.75rem",
                backgroundColor: "#222",
                color: "white",
                border: "none",
                borderRadius: "0.5rem",
                cursor: "pointer",
                fontSize: "1rem",
                fontWeight: "500"
              }}
            >
              Jump
            </button>
          </form>
          
          {/* Create quiz info text */}
          <div style={{
            marginTop: "auto",
            position: "absolute",
            bottom: "2rem",
            textAlign: "center",
            color: "#aaa",
            fontSize: "0.875rem",
            lineHeight: "1.5"
          }}>
            <p>
              If you wanna create a quiz, grab a coffee and jump on<br />
              <span style={{ fontWeight: "bold", color: "white" }}>telegram community</span><br />
              — we're cooking
            </p>
          </div>
        </div>
      </div>
    </>
  );
}