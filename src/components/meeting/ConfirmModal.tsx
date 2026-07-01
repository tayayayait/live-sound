import { useEffect, useRef } from "react";
import { X } from "lucide-react";

interface ConfirmModalProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = "취소",
  danger,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const btnRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    btnRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(23,32,38,0.48)" }}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
    >
      <div
        className="w-full max-w-[480px] rounded-lg"
        style={{
          backgroundColor: "var(--color-surface)",
          boxShadow: "0 8px 24px rgba(23,32,38,0.12)",
        }}
      >
        <header
          className="flex items-center justify-between h-14 px-5 border-b"
          style={{ borderColor: "var(--color-border-subtle)" }}
        >
          <h2 id="confirm-title" className="text-lg font-bold">
            {title}
          </h2>
          <button
            type="button"
            onClick={onCancel}
            aria-label="닫기"
            className="w-9 h-9 flex items-center justify-center rounded-md hover:bg-[var(--color-surface-alt)]"
          >
            <X className="w-5 h-5" aria-hidden />
          </button>
        </header>
        <div className="p-5">
          <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
            {description}
          </p>
        </div>
        <footer
          className="flex items-center justify-end gap-2 px-5 py-4 border-t"
          style={{ borderColor: "var(--color-border-subtle)" }}
        >
          <button
            type="button"
            onClick={onCancel}
            className="h-10 px-4 rounded-md border text-sm font-medium bg-white"
            style={{ borderColor: "var(--color-border)" }}
          >
            {cancelLabel}
          </button>
          <button
            ref={btnRef}
            type="button"
            data-testid="confirm-stop-button"
            onClick={onConfirm}
            className="h-10 px-4 rounded-md text-sm font-semibold text-white"
            style={{ backgroundColor: danger ? "var(--color-error)" : "var(--color-primary)" }}
          >
            {confirmLabel}
          </button>
        </footer>
      </div>
    </div>
  );
}
