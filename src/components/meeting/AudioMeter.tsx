interface AudioMeterProps {
  level: number; // 0-1
  segments?: number;
  className?: string;
}

export function AudioMeter({ level, segments = 24, className }: AudioMeterProps) {
  const active = Math.round(level * segments);
  const label = level < 0.05 ? "무음" : level > 0.9 ? "매우 큼" : level > 0.5 ? "큼" : "보통";
  return (
    <div
      className={`flex items-center gap-[3px] h-2 ${className ?? ""}`}
      aria-label={`현재 입력 음량 ${label}`}
      role="meter"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(level * 100)}
    >
      {Array.from({ length: segments }).map((_, i) => {
        const on = i < active;
        const clipping = level > 0.95 && i >= segments - 3;
        const bg = on
          ? clipping
            ? "var(--color-error)"
            : "var(--color-primary)"
          : "var(--color-border-subtle)";
        return (
          <span
            key={i}
            className="flex-1 h-full rounded-[1px] transition-colors"
            style={{ backgroundColor: bg }}
          />
        );
      })}
    </div>
  );
}
