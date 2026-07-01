import { Link } from "@tanstack/react-router";
import { Settings } from "lucide-react";
import type { ReactNode } from "react";
import { StatusBadge } from "./StatusBadge";
import { useMeetingStore } from "@/lib/meeting/store";

interface AppShellProps {
  title?: string;
  children: ReactNode;
  onOpenSettings?: () => void;
  rightExtra?: ReactNode;
}

export function AppShell({ title, children, onOpenSettings, rightExtra }: AppShellProps) {
  const wsState = useMeetingStore((s) => s.wsState);
  return (
    <div className="min-h-dvh flex flex-col">
      <header
        className="sticky top-0 z-40 h-14 flex items-center justify-between px-4 md:px-6"
        style={{
          backgroundColor: "var(--color-surface)",
          borderBottom: "1px solid var(--color-border-subtle)",
        }}
      >
        <Link to="/" className="font-bold text-base tracking-tight">
          Live Meeting AI
        </Link>
        <div
          className="hidden md:block text-sm font-medium truncate max-w-[40%]"
          style={{ color: "var(--color-text-muted)" }}
        >
          {title}
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge state={wsState} />
          {rightExtra}
          {onOpenSettings && (
            <button
              type="button"
              onClick={onOpenSettings}
              aria-label="설정 열기"
              title="설정"
              className="w-10 h-10 flex items-center justify-center rounded-md hover:bg-[var(--color-surface-alt)] transition-colors"
            >
              <Settings className="w-5 h-5" aria-hidden />
            </button>
          )}
        </div>
      </header>
      <main className="flex-1 flex flex-col">{children}</main>
    </div>
  );
}
