import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  values: {
    deviceId?: string;
    language: string;
    summaryInterval: 30 | 60 | "manual";
    chunkIntervalMs: number;
    showLowConfidence: boolean;
  };
  devices: MediaDeviceInfo[];
  onSave: (v: SettingsModalProps["values"]) => void;
}

const LANGS = [
  { value: "ko-KR", label: "한국어" },
  { value: "en-US", label: "English (US)" },
  { value: "ja-JP", label: "日本語" },
];

export function SettingsModal({ open, onClose, values, devices, onSave }: SettingsModalProps) {
  const [local, setLocal] = useState(values);
  const firstRef = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    if (open) setLocal(values);
  }, [open, values]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    firstRef.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(23,32,38,0.48)" }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-title"
    >
      <div
        className="w-full max-w-[560px] max-h-[calc(100dvh-64px)] flex flex-col rounded-lg overflow-hidden"
        style={{
          backgroundColor: "var(--color-surface)",
          boxShadow: "0 8px 24px rgba(23,32,38,0.12)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <header
          className="flex items-center justify-between h-14 px-5 border-b"
          style={{ borderColor: "var(--color-border-subtle)" }}
        >
          <h2 id="settings-title" className="text-lg font-bold">
            설정
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="설정 닫기"
            className="w-9 h-9 flex items-center justify-center rounded-md hover:bg-[var(--color-surface-alt)]"
          >
            <X className="w-5 h-5" aria-hidden />
          </button>
        </header>

        <div className="p-5 overflow-y-auto flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="s-device" className="text-sm font-medium">
              입력 장치
            </label>
            <select
              id="s-device"
              ref={firstRef}
              className="h-11 px-3 rounded-md border bg-white"
              style={{ borderColor: "var(--color-border)" }}
              value={local.deviceId ?? ""}
              onChange={(e) => setLocal({ ...local, deviceId: e.target.value || undefined })}
              disabled={devices.length === 0}
            >
              {devices.length === 0 && <option value="">마이크 권한 허용 후 선택 가능</option>}
              {devices.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || `마이크 (${d.deviceId.slice(0, 6)})`}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="s-lang" className="text-sm font-medium">
              언어
            </label>
            <select
              id="s-lang"
              className="h-11 px-3 rounded-md border bg-white"
              style={{ borderColor: "var(--color-border)" }}
              value={local.language}
              onChange={(e) => setLocal({ ...local, language: e.target.value })}
            >
              {LANGS.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </select>
          </div>

          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium mb-1">요약 주기</legend>
            <div
              role="radiogroup"
              className="inline-flex rounded-md p-1"
              style={{ backgroundColor: "var(--color-surface-alt)" }}
            >
              {(["30", "60", "manual"] as const).map((v) => {
                const val = v === "manual" ? "manual" : (Number(v) as 30 | 60);
                const active = local.summaryInterval === val;
                return (
                  <button
                    key={v}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setLocal({ ...local, summaryInterval: val })}
                    className="h-8 px-3 text-sm font-medium rounded"
                    style={{
                      backgroundColor: active ? "var(--color-primary-soft)" : "transparent",
                      color: active ? "var(--color-primary)" : "var(--color-text-muted)",
                    }}
                  >
                    {v === "manual" ? "수동" : `${v}초`}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div className="flex flex-col gap-1">
            <label htmlFor="s-chunk" className="text-sm font-medium">
              오디오 chunk 간격 (ms)
            </label>
            <input
              id="s-chunk"
              type="number"
              min={100}
              max={1000}
              step={50}
              className="h-11 px-3 rounded-md border bg-white"
              style={{ borderColor: "var(--color-border)" }}
              value={local.chunkIntervalMs}
              onChange={(e) =>
                setLocal({
                  ...local,
                  chunkIntervalMs: Math.max(100, Math.min(1000, Number(e.target.value) || 100)),
                })
              }
            />
            <p className="text-xs" style={{ color: "var(--color-text-subtle)" }}>
              100 - 1000ms 범위
            </p>
          </div>

          <label className="flex items-center justify-between gap-3">
            <span className="text-sm font-medium">저신뢰도 표시</span>
            <input
              type="checkbox"
              checked={local.showLowConfidence}
              onChange={(e) => setLocal({ ...local, showLowConfidence: e.target.checked })}
              className="w-5 h-5"
            />
          </label>
        </div>

        <footer
          className="flex items-center justify-end gap-2 px-5 py-4 border-t"
          style={{ borderColor: "var(--color-border-subtle)" }}
        >
          <button
            type="button"
            onClick={onClose}
            className="h-10 px-4 rounded-md border text-sm font-medium bg-white"
            style={{ borderColor: "var(--color-border)" }}
          >
            취소
          </button>
          <button
            type="button"
            onClick={() => {
              onSave(local);
              onClose();
            }}
            className="h-10 px-4 rounded-md text-sm font-semibold text-white"
            style={{ backgroundColor: "var(--color-primary)" }}
          >
            저장
          </button>
        </footer>
      </div>
    </div>
  );
}
