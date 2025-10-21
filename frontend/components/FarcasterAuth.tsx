"use client";

import { sdk } from '@farcaster/miniapp-sdk';
import { ProfilePicture } from './ProfilePicture';
import { useState, useEffect } from 'react';

interface FarcasterAuthProps {
  size?: number;
  className?: string;
}

export function FarcasterAuth({ 
  size = 48, 
  className = "" 
}: FarcasterAuthProps) {
  const [context, setContext] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadContext = async () => {
      try {
        const contextData = await sdk.context;
        console.log('🔍 FarcasterAuth Debug (MiniApp SDK):');
        console.log('  - sdk:', sdk);
        console.log('  - context:', contextData);
        console.log('  - context.user:', contextData?.user);
        console.log('  - context.user.pfpUrl:', contextData?.user?.pfpUrl);
        console.log('  - context.user.username:', contextData?.user?.username);
        console.log('  - context.user.displayName:', contextData?.user?.displayName);
        console.log('  - context.user.fid:', contextData?.user?.fid);
        
        setContext(contextData);
      } catch (error) {
        console.error('❌ Error loading Farcaster context:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadContext();
  }, []);

  // If loading, show loading state
  if (isLoading) {
    return (
      <div 
        className={`bg-gray-500 rounded-full flex items-center justify-center ${className}`}
        style={{ width: size, height: size }}
        title="Loading Farcaster context..."
      >
        <span className="text-white text-xs font-medium">...</span>
      </div>
    );
  }

  // If we have user data from Farcaster context, show profile picture
  if (context?.user) {
    return (
      <ProfilePicture 
        size={size}
        className={className}
        showFallback={true}
      />
    );
  }

  // If no user data, show fallback
  return (
    <div 
      className={`bg-gray-600 rounded-full flex items-center justify-center ${className}`}
      style={{ width: size, height: size }}
      title="No Farcaster user data available"
    >
      <span className="text-white text-xs font-medium">?</span>
    </div>
  );
}