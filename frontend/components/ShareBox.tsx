"use client";

import sdk from "@farcaster/miniapp-sdk";
import { useState } from "react";
import QRCodeModal from "./QRCodeModal";

interface ShareBoxProps {
  roomCode: string;
  onClose: () => void;
  onGoToLobby?: () => void;
}

export default function ShareBox({ roomCode, onClose, onGoToLobby }: ShareBoxProps) {
  const [copied, setCopied] = useState(false);
  const [pinCopied, setPinCopied] = useState(false);
  const [showQRModal, setShowQRModal] = useState(false);
  
  const quizUrl = `${window.location.origin}/quiz/lobby/${roomCode}`;
  
  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(quizUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy link:', err);
      // Fallback per browser che non supportano clipboard API
      const textArea = document.createElement('textarea');
      textArea.value = quizUrl;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleCopyPin = async () => {
    try {
      await navigator.clipboard.writeText(roomCode);
      setPinCopied(true);
      setTimeout(() => setPinCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy PIN:', err);
      // Fallback per browser che non supportano clipboard API
      const textArea = document.createElement('textarea');
      textArea.value = roomCode;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setPinCopied(true);
      setTimeout(() => setPinCopied(false), 2000);
    }
  };

  const handleCastQuiz = async () => {
    const text = `🎯 Join my quiz on Hoot! The PIN is: ${roomCode}\n\n${quizUrl}`;
    await sdk.actions.composeCast({ 
      text,
      close: false,
      channelKey: 'hoot',
      embeds: [`${quizUrl}` as string]
    });
  };

  return (
    <div
      className="bottom-sheet"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="share-box animate-slide-up">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "var(--spacing-md)",
          }}
        >
          <h3 className="share-box__title">Quiz Created Successfully! 🎉</h3>
          <button
            onClick={onClose}
            className="btn"
            style={{
              padding: "var(--spacing-xs)",
              minWidth: "auto",
              background: "transparent",
              color: "var(--color-text-secondary)",
            }}
            aria-label="Close"
          >
            <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--spacing-md)",
          }}
        >
          {/* Share Box Container */}
          <div className="share-box__section">
            <h4
              className="text-h2"
              style={{
                marginBottom: "var(--spacing-md)",
              }}
            >
              Share Box
            </h4>
            
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "var(--spacing-md)",
              }}
            >
              {/* QR Codes Button */}
                <button
                  onClick={() => setShowQRModal(true)}
                className="btn btn--primary"
                style={{ width: "100%" }}
                >
                <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ marginRight: "var(--spacing-xs)" }}>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                  </svg>
                  QR Codes
                </button>
              
              {/* Link Box */}
              <div
                className="share-box__section"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "var(--spacing-sm)",
                  padding: "var(--spacing-sm) var(--spacing-md)",
                }}
              >
                <p
                  className="text-body"
                  style={{
                    color: "var(--color-primary)",
                    wordBreak: "break-all",
                    flex: 1,
                    fontSize: "var(--font-size-caption)",
                  }}
                >
                  {quizUrl}
                </p>
                <button
                  onClick={handleCopyLink}
                  className="btn"
                  style={{
                    padding: "var(--spacing-xs)",
                    minWidth: "auto",
                    backgroundColor: copied ? "var(--color-success)" : "var(--color-surface)",
                    color: "var(--color-text)",
                    flexShrink: 0,
                  }}
                  title={copied ? "Copied!" : "Copy link"}
                  aria-label={copied ? "Copied!" : "Copy link"}
                >
                  {copied ? (
                    <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  )}
                </button>
              </div>
              
              {/* PIN Box */}
              <div
                className="share-box__section"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "var(--spacing-sm)",
                  padding: "var(--spacing-sm) var(--spacing-md)",
                }}
              >
                <p
                  className="text-h1"
                  style={{
                    fontFamily: "monospace",
                    flex: 1,
                    textAlign: "center",
                  }}
                >
                  {roomCode}
                </p>
                <button
                  onClick={handleCopyPin}
                  className="btn"
                  style={{
                    padding: "var(--spacing-xs)",
                    minWidth: "auto",
                    backgroundColor: pinCopied ? "var(--color-success)" : "var(--color-surface)",
                    color: "var(--color-text)",
                    flexShrink: 0,
                  }}
                  title={pinCopied ? "Copied!" : "Copy PIN"}
                  aria-label={pinCopied ? "Copied!" : "Copy PIN"}
                >
                  {pinCopied ? (
                    <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
          </div>
          
          <button
            onClick={handleCastQuiz}
            className="btn btn--primary btn--large"
            style={{ width: "100%" }}
          >
            <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24" style={{ marginRight: "var(--spacing-xs)" }}>
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
            </svg>
            Cast your Quiz
          </button>
          
          {onGoToLobby && (
            <button
              onClick={onGoToLobby}
              className="btn btn--large"
              style={{
                width: "100%",
                backgroundColor: "var(--color-success)",
                color: "var(--color-text)",
              }}
            >
              Go to Lobby
            </button>
          )}
          
          <div style={{ textAlign: "center" }}>
            <p
              className="text-caption"
              style={{
                color: "var(--color-text-muted)",
              }}
            >
              Players can join using QR codes, link, or PIN
            </p>
          </div>
        </div>
      </div>
      
      {/* QR Code Modal */}
      <QRCodeModal
        isOpen={showQRModal}
        onClose={() => setShowQRModal(false)}
        roomCode={roomCode}
      />
    </div>
  );
}
