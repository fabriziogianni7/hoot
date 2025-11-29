"use client";

type QuizStatus = "pending" | "active" | "completed" | "cancelled";

interface StatusBadgeProps {
  status: QuizStatus;
  size?: "sm" | "md";
}

const STATUS_CONFIG: Record<
  QuizStatus,
  { label: string; bg: string; dot: string; text: string }
> = {
  pending: {
    label: "Pending",
    bg: "bg-amber-500/10 border-amber-400/40",
    dot: "bg-amber-300",
    text: "text-amber-200",
  },
  active: {
    label: "Active",
    bg: "bg-emerald-500/10 border-emerald-400/40",
    dot: "bg-emerald-300",
    text: "text-emerald-200",
  },
  completed: {
    label: "Completed",
    bg: "bg-sky-500/10 border-sky-400/40",
    dot: "bg-sky-300",
    text: "text-sky-200",
  },
  cancelled: {
    label: "Cancelled",
    bg: "bg-rose-500/10 border-rose-400/40",
    dot: "bg-rose-300",
    text: "text-rose-200",
  },
};

export default function StatusBadge({ status, size = "md" }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;
  const padding = size === "sm" ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-xs";

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border ${config.bg} ${config.text} ${padding} font-semibold uppercase tracking-wide`}
    >
      <span className={`h-2 w-2 rounded-full ${config.dot}`} />
      {config.label}
    </span>
  );
}

