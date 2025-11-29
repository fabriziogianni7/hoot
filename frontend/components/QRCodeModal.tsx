"use client";

import { useState } from "react";
import QRCode from "react-qr-code";

interface QRCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  roomCode: string;
}

export default function QRCodeModal({ isOpen, onClose, roomCode }: QRCodeModalProps) {
  if (!isOpen) return null;

  // Get app IDs from environment variables
  // These should be set in your .env.local file
  // Default App ID found from Farcaster dashboard: rJhq_S-W31yg
  const farcasterAppId = process.env.NEXT_PUBLIC_FARCASTER_APP_ID || "rJhq_S-W31yg";
  const farcasterSlug = process.env.NEXT_PUBLIC_FARCASTER_APP_SLUG || "hoot";
  const baseCustomDomain = process.env.NEXT_PUBLIC_BASE_CUSTOM_DOMAIN || ""; // Optional custom domain (e.g., "hoot")
  
  // Get production URL from environment or use canonical domain
  // This ensures QR codes always point to production, not localhost
  const productionUrl = 
    process.env.NEXT_PUBLIC_URL || 
    process.env.NEXT_PUBLIC_NGROK_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : null) ||
    "https://hoot-quiz.com"; // Fallback to canonical domain
  
  // Generate the URLs
  const absoluteUrl = `${productionUrl}/quiz/lobby/${roomCode}`;
  
  // Farcaster miniapp URL - format: https://farcaster.xyz/miniapps/<app-id>/<slug>/<path>
  // Reference: https://farcaster.xyz/miniapps/rJhq_S-W31yg/hoot
  const farcasterUrl = `https://farcaster.xyz/miniapps/${farcasterAppId}/${farcasterSlug}/quiz/lobby/${roomCode}`;
  
  // Base app URL - Base App uses direct domain URL (not App ID based like Farcaster)
  // Reference: https://docs.base.org/mini-apps/core-concepts/navigation#deeplinks
  // Base App supports two formats:
  // 1. Direct URL: https://hoot-quiz.com/quiz/lobby/XXXXXX (works when opened from Base App)
  // 2. Deeplink: cbwallet://miniapp?url=https://hoot-quiz.com/quiz/lobby/XXXXXX (works on mobile when Base App is installed)
  let baseAppDirectUrl = absoluteUrl; // Use production URL
  if (baseCustomDomain) {
    // Use custom domain if configured (e.g., https://hoot.base.org/quiz/lobby/XXXXXX)
    baseAppDirectUrl = `https://${baseCustomDomain}.base.org/quiz/lobby/${roomCode}`;
  }
  
  // Base App deeplink - format: cbwallet://miniapp?url=<encoded-url>
  // This works on mobile when Base App is installed
  // For QR codes on mobile, we should use the deeplink format
  const baseAppDeeplink = `cbwallet://miniapp?url=${encodeURIComponent(baseAppDirectUrl)}`;
  
  // For QR codes, we use the deeplink format for Base App (better mobile experience)
  // The deeplink opens Base App directly on mobile when installed
  // If Base App is not installed, it will fallback to opening the URL in browser
  const baseAppUrl = baseAppDeeplink;

  const qrCodes = [
    {
      title: "E-Mail Login",
      description: "Direct link to the lobby",
      url: absoluteUrl,
      bgColor: "bg-green-900/20",
      borderColor: "border-green-600/50"
    },
    {
      title: "Farcaster Miniapp",
      description: "Open in Farcaster app",
      url: farcasterUrl,
      bgColor: "bg-purple-900/20",
      borderColor: "border-purple-600/50"
    },
    {
      title: "Base App",
      description: "Open in Base app",
      url: baseAppUrl,
      bgColor: "bg-blue-900/20",
      borderColor: "border-blue-600/50"
    }
  ];

  const handleCopyUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      // You could add a toast notification here
    } catch (err) {
      console.error('Failed to copy URL:', err);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60] p-4">
      <div className="bg-black border border-gray-800 rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-bold text-white">QR Codes</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {qrCodes.map((qr, index) => (
            <div key={index} className="flex flex-col items-center">
              <div className={`${qr.bgColor} border ${qr.borderColor} rounded-lg p-4 w-full mb-2`}>
                <p className="text-sm font-semibold text-white mb-1 text-center">{qr.title}</p>
                <p className="text-xs text-gray-400 mb-3 text-center">{qr.description}</p>
                <div className="bg-white rounded-lg p-3 flex justify-center mb-3">
                  <QRCode
                    value={qr.url}
                    size={120}
                    style={{ height: "auto", maxWidth: "100%", width: "100%" }}
                    viewBox="0 0 256 256"
                  />
                </div>
                <button
                  onClick={() => handleCopyUrl(qr.url)}
                  className="w-full py-2 px-3 text-xs bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors"
                >
                  Copy URL
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

