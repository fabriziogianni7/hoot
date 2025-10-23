"use client";

import { useProfile } from '@farcaster/auth-kit';

interface ProfilePictureProps {
  size?: number;
  className?: string;
  showFallback?: boolean;
}

export function ProfilePicture({ 
  size = 40, 
  className = "",
  showFallback = true 
}: ProfilePictureProps) {
  const { isAuthenticated, profile } = useProfile();

  // Debug logging
  console.log('ProfilePicture - isAuthenticated:', isAuthenticated);
  console.log('ProfilePicture - profile:', profile);

  // If not authenticated, show a fallback or nothing
  if (!isAuthenticated || !profile) {
    if (!showFallback) return null;
    
    return (
      <div 
        className={`bg-gray-600 rounded-full flex items-center justify-center ${className}`}
        style={{ width: size, height: size }}
        title={`Not authenticated. isAuthenticated: ${isAuthenticated}, profile: ${!!profile}`}
      >
        <span className="text-white text-xs font-medium">?</span>
      </div>
    );
  }

  // If we have a profile picture URL, use it
  if (profile.pfpUrl) {
    return (
      <img
        src={profile.pfpUrl}
        alt={profile.displayName || profile.username || 'Profile'}
        className={`rounded-full object-cover ${className}`}
        style={{ width: size, height: size }}
        onError={(e) => {
          // Fallback to initials if image fails to load
          const target = e.target as HTMLImageElement;
          target.style.display = 'none';
          const parent = target.parentElement;
          if (parent) {
            parent.innerHTML = `
              <div class="bg-blue-600 rounded-full flex items-center justify-center" style="width: ${size}px; height: ${size}px;">
                <span class="text-white text-xs font-medium">
                  ${(profile.displayName || profile.username || '?').charAt(0).toUpperCase()}
                </span>
              </div>
            `;
          }
        }}
      />
    );
  }

  // Fallback to initials if no profile picture
  const initials = (profile.displayName || profile.username || '?').charAt(0).toUpperCase();
  
  return (
    <div 
      className={`bg-blue-600 rounded-full flex items-center justify-center ${className}`}
      style={{ width: size, height: size }}
    >
      <span className="text-white text-xs font-medium">{initials}</span>
    </div>
  );
}
