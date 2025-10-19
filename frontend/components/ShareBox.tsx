"use client";

import { useState } from "react";

interface ShareBoxProps {
  roomCode: string;
  onClose: () => void;
  onGoToLobby?: () => void;
}

export default function ShareBox({ roomCode, onClose, onGoToLobby }: ShareBoxProps) {
  const [copied, setCopied] = useState(false);
  
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

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-50">
      <div className="bg-gray-900 border border-gray-700 rounded-t-2xl p-6 w-full max-w-md transform transition-transform duration-300 ease-out animate-slide-up">
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
            <div className="bg-gray-800 rounded-lg p-3 border border-gray-600">
              <p className="text-sm text-blue-400 break-all">{quizUrl}</p>
            </div>
          </div>
          
          <div>
            <p className="text-gray-300 mb-2">Or share the PIN:</p>
            <div className="bg-gray-800 rounded-lg p-3 border border-gray-600 text-center">
              <p className="text-2xl font-bold text-white font-mono">{roomCode}</p>
            </div>
          </div>
          
          <div className="flex gap-3">
            <button
              onClick={handleCopyLink}
              className={`flex-1 py-3 px-4 rounded-lg font-medium transition-colors ${
                copied 
                  ? 'bg-green-600 text-white' 
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
              }`}
            >
              {copied ? '✓ Copied!' : 'Copy Link'}
            </button>
            
            <button
              onClick={() => {
                const shareText = `Join my quiz! PIN: ${roomCode}\nLink: ${quizUrl}`;
                if (navigator.share) {
                  navigator.share({
                    title: 'Join Quiz',
                    text: shareText,
                    url: quizUrl
                  });
                } else {
                  // Fallback: copy to clipboard
                  handleCopyLink();
                }
              }}
              className="flex-1 py-3 px-4 rounded-lg font-medium bg-purple-600 hover:bg-purple-700 text-white transition-colors"
            >
              Share
            </button>
          </div>
          
          {onGoToLobby && (
            <button
              onClick={onGoToLobby}
              className="w-full py-3 px-4 rounded-lg font-medium bg-green-600 hover:bg-green-700 text-white transition-colors"
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
