"use client";

import { useState } from "react";
import { sdk } from "@farcaster/miniapp-sdk";

interface ShareBoxProps {
  roomCode: string;
  onClose: () => void;
  onGoToLobby?: () => void;
}

export default function ShareBox({ roomCode, onClose, onGoToLobby }: ShareBoxProps) {
  const [copied, setCopied] = useState(false);
  const [pinCopied, setPinCopied] = useState(false);
  
  const quizUrl = `${window.location.origin}/quiz/lobby?room=${roomCode}`;
  
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
    <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-50">
      <div className="bg-black border border-white rounded-t-lg p-6 w-full max-w-md mx-4 mb-0 transform transition-transform duration-300 ease-out animate-slide-up">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-bold text-white">Quiz Created Successfully! 🎉</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        <div className="space-y-4">
          <div>
            <p className="text-gray-300 mb-2">Share this link with your players:</p>
            <div className="bg-purple-800/50 border border-purple-600 rounded-lg p-3 flex items-center justify-between">
              <p className="text-sm text-blue-400 break-all flex-1 mr-2">{quizUrl}</p>
              <button
                onClick={handleCopyLink}
                className={`p-2 rounded-lg transition-colors ${
                  copied 
                    ? 'bg-green-600 text-white' 
                    : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                }`}
                title={copied ? 'Copied!' : 'Copy link'}
              >
                {copied ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                )}
              </button>
            </div>
          </div>
          
          <div>
            <p className="text-gray-300 mb-2">Or share the PIN:</p>
            <div className="bg-purple-800/50 border border-purple-600 rounded-lg p-3 flex items-center justify-between">
              <p className="text-2xl font-bold text-white font-mono flex-1 text-center">{roomCode}</p>
              <button
                onClick={handleCopyPin}
                className={`p-2 rounded-lg transition-colors ml-2 ${
                  pinCopied 
                    ? 'bg-green-600 text-white' 
                    : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                }`}
                title={pinCopied ? 'Copied!' : 'Copy PIN'}
              >
                {pinCopied ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                )}
              </button>
            </div>
          </div>
          
          <button
            onClick={handleCastQuiz}
            className="w-full py-3 px-4 rounded-lg font-medium bg-purple-600 hover:bg-purple-700 text-white transition-colors flex items-center justify-center gap-2"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
            </svg>
            Cast your Quiz
          </button>
          
          {onGoToLobby && (
            <button
              onClick={onGoToLobby}
              className="w-full py-3 px-4 rounded-lg font-medium text-white transition-colors"
              style={{
                backgroundColor: "#22c55e", // Verde delle risposte corrette
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "#16a34a"; // Verde più scuro per hover
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "#22c55e"; // Verde normale
              }}
            >
              Go to Lobby
            </button>
          )}
          
          <div className="text-center">
            <p className="text-sm text-gray-400">
              Players can join using either the link or the PIN
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
