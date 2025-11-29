import { Suspense } from "react";
import ResultsPageClient from "../ResultsPageClient";

interface ResultsRoomPageProps {
  params: Promise<{ roomCode: string }>;
}

export default async function ResultsRoomPage({
  params,
}: ResultsRoomPageProps) {
  const { roomCode } = await params;

  return (
    <Suspense>
      <ResultsPageClient roomCode={roomCode} />
    </Suspense>
  );
}


