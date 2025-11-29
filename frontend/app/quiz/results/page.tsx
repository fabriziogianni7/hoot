import { Suspense } from "react";
import ResultsPageClient from "./ResultsPageClient";

export default function ResultsPage() {
  return (
    <Suspense>
      <ResultsPageClient />
    </Suspense>
  );
}