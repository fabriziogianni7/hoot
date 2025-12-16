"use client";

import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/lib/use-auth";
import WalletModal from "@/components/WalletModal";
import { useState } from "react";

export default function Footer() {
  const router = useRouter();
  const pathname = usePathname();
  const { loggedUser } = useAuth();
  const [showWalletModal, setShowWalletModal] = useState(false);

  const isActive = (path: string) => {
    if (path === "/" && pathname === "/") return true;
    if (path !== "/" && pathname?.startsWith(path)) return true;
    return false;
  };

  const handleNavigation = (path: string) => {
    if (path === "wallet") {
      if (loggedUser?.isAuthenticated && loggedUser?.address) {
        setShowWalletModal(true);
      }
      return;
    }
    router.push(path);
  };

  const navItems = [
    {
      id: "home",
      label: "Home",
      path: "/",
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 10l9-7 9 7" />
          <path d="M5 10v10h6v-6h2v6h6V10" />
        </svg>
      ),
    },
    {
      id: "next",
      label: "Upcoming",
      path: "/quiz/next",
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      ),
    },
    {
      id: "profile",
      label: "Profile",
      path: "/quiz/profile",
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      ),
    },
    {
      id: "leaderboard",
      label: "Leaderboard",
      path: "/leaderboard",
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
          <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
          <path d="M4 22h16" />
          <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
          <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
          <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
        </svg>
      ),
    },
    {
      id: "wallet",
      label: "Wallet",
      path: "wallet",
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="1" y="4" width="22" height="16" rx="2" />
          <path d="M1 10h22" />
        </svg>
      ),
    },
  ];

  return (
    <>
      <nav className="footer">
        {navItems.map((item) => {
          const active = isActive(item.path);
          return (
            <button
              key={item.id}
              className={`footer__item ${active ? "footer__item--active" : ""}`}
              onClick={() => handleNavigation(item.path)}
              aria-label={item.label}
            >
              <div className="footer__icon">{item.icon}</div>
              <span className="footer__label">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {showWalletModal && (
        <WalletModal onClose={() => setShowWalletModal(false)} />
      )}
    </>
  );
}
