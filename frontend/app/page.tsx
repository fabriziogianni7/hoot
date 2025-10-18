"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useMiniKit, useQuickAuth } from "@coinbase/onchainkit/minikit";
import { useRouter } from "next/navigation";
import { minikitConfig } from "../minikit.config";
import { useQuiz } from "@/lib/quiz-context";

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
  const [gamePin, setGamePin] = useState("");
  const router = useRouter();
  const [error, setError] = useState("");
  const { quizzes, startGame, getQuizById } = useQuiz();
  const [availableQuizzes, setAvailableQuizzes] = useState<string[]>([]);

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

  // Estrai gli ID dei quiz disponibili
  useEffect(() => {
    if (quizzes.length > 0) {
      const quizIds = quizzes.map(q => q.id);
      setAvailableQuizzes(quizIds);
      console.log('Quiz disponibili:', quizIds);
    }
  }, [quizzes]);

  const { data: authData, isLoading: isAuthLoading, error: authError } = useQuickAuth<AuthResponse>(
    "/api/auth",
    { method: "GET" }
  );

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (gamePin.trim()) {
      // Cerca il quiz con l'ID corrispondente al PIN inserito
      const quiz = getQuizById(gamePin.trim());
      
      if (quiz) {
        // Se il quiz esiste, avvia il gioco con quell'ID
        startGame(quiz.id);
        router.push(`/quiz/lobby`);
      } else {
        // Se il quiz non esiste, mostra un errore
        setError(`Quiz con PIN "${gamePin}" non trovato. Controlla il PIN e riprova.`);
        setTimeout(() => setError(""), 5000); // Rimuovi l'errore dopo 5 secondi
      }
    }
  };

  // Determina il testo da mostrare nel badge dell'utente
  const getUserBadgeText = () => {
    if (isAuthLoading) return "Connecting...";
    if (authError) return "Not Connected";
    if (authData?.success && context?.user?.displayName) {
      return context.user.displayName;
    }
    if (authData?.success && authData?.user?.fid) {
      return `FID: ${authData.user.fid}`;
    }
    return "Connected";
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
          backgroundColor: authData?.success ? "#1e40af" : "#222",
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
            backgroundColor: authData?.success ? "#4ade80" : "#ef4444"
          }}></div>
          {getUserBadgeText()}
        </div>
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
          marginBottom: "4rem",
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
            list="available-quizzes"
          />
          
          {/* Datalist per mostrare i quiz disponibili */}
          <datalist id="available-quizzes">
            {availableQuizzes.map(id => (
              <option key={id} value={id} />
            ))}
          </datalist>
          
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
              fontWeight: "500",
              marginBottom: "1rem"
            }}
          >
            Jump
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
        
        {/* Quiz disponibili */}
        {availableQuizzes.length > 0 && (
          <div style={{
            backgroundColor: "rgba(59, 130, 246, 0.1)",
            border: "1px solid #3b82f6",
            borderRadius: "0.5rem",
            padding: "0.75rem",
            marginBottom: "2rem",
            width: "100%"
          }}>
            <h3 style={{ marginBottom: "0.5rem", fontSize: "0.875rem", color: "#93c5fd" }}>
              Quiz disponibili:
            </h3>
            <ul style={{ fontSize: "0.875rem", paddingLeft: "1rem" }}>
              {quizzes.map(quiz => (
                <li key={quiz.id} style={{ marginBottom: "0.25rem" }}>
                  <span style={{ color: "#93c5fd" }}>{quiz.id}</span>: {quiz.title}
                </li>
              ))}
            </ul>
          </div>
        )}
        
        {/* Create quiz button */}
        <Link href="/quiz/admin" style={{
          width: "100%",
          padding: "0.75rem",
          backgroundColor: "#1e40af",
          color: "white",
          border: "none",
          borderRadius: "0.5rem",
          cursor: "pointer",
          fontSize: "1rem",
          fontWeight: "500",
          marginBottom: "4rem",
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
          bottom: "2rem",
          left: 0,
          right: 0,
          width: "100%"
        }}>
          <p>
            If you wanna create a quiz, grab a coffee and jump on<br />
            <span style={{ fontWeight: "bold", color: "white" }}>telegram community</span><br />
            — we're cooking
          </p>
        </div>
      </div>
    </div>
  );
}