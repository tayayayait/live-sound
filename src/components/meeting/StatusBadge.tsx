import { CheckCircle2, CircleX, Info, Loader2, TriangleAlert } from "lucide-react";
import type { WebSocketState } from "@/lib/meeting/types";

const MAP: Record<
  WebSocketState,
  { label: string; bg: string; fg: string; icon: React.ComponentType<{ className?: string }> }
> = {
  disconnected: {
    label: "대기",
    bg: "var(--color-surface-alt)",
    fg: "var(--color-text-muted)",
    icon: Info,
  },
  connecting: {
    label: "연결 중",
    bg: "var(--color-info-soft)",
    fg: "var(--color-info)",
    icon: Loader2,
  },
  connected: {
    label: "연결됨",
    bg: "var(--color-success-soft)",
    fg: "var(--color-success)",
    icon: CheckCircle2,
  },
  degraded: {
    label: "지연 높음",
    bg: "var(--color-warning-soft)",
    fg: "var(--color-warning)",
    icon: TriangleAlert,
  },
  reconnecting: {
    label: "재연결 중",
    bg: "var(--color-warning-soft)",
    fg: "var(--color-warning)",
    icon: Loader2,
  },
  failed: {
    label: "연결 실패",
    bg: "var(--color-error-soft)",
    fg: "var(--color-error)",
    icon: CircleX,
  },
};

export function StatusBadge({ state }: { state: WebSocketState }) {
  const { label, bg, fg, icon: Icon } = MAP[state];
  const animate = state === "connecting" || state === "reconnecting";
  return (
    <span
      role="status"
      className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full text-xs font-medium whitespace-nowrap"
      style={{ backgroundColor: bg, color: fg }}
    >
      <Icon className={`w-3.5 h-3.5 ${animate ? "animate-spin" : ""}`} aria-hidden />
      {label}
    </span>
  );
}
