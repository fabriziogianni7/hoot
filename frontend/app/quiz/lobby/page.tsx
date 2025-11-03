"use client";

import { useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function RedirectContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const roomCode = searchParams.get("room");

  useEffect(() => {
    if (roomCode) {
      // Redirect to new dynamic route
      router.replace(`/quiz/lobby/${roomCode}`);
    } else {
      // If no room code, redirect to home or show error
      router.replace("/");
    }
  }, [roomCode, router]);

  return (
    <div className="min-h-screen w-full bg-black text-white flex items-center justify-center">
      Redirecting...
    </div>
  );
}

export default function LobbyPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen w-full bg-black text-white flex items-center justify-center">
          Loading...
        </div>
      }
    >
      <RedirectContent />
    </Suspense>
  );
}