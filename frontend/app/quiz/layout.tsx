import { ReactNode } from "react";
import { AuthWrapper } from "@/components/auth-wrapper";

export default function QuizLayout({ children }: { children: ReactNode }) {
  return (
    <AuthWrapper>
      {children}
    </AuthWrapper>
  );
}