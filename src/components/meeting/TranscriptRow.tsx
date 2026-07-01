import { TriangleAlert } from "lucide-react";
import type { TranscriptSegment } from "@/lib/meeting/types";
import { fmtTs } from "@/lib/meeting/export";

const SPEAKER_COLORS: Record<string, string> = {
  "Speaker 1": "var(--color-primary)",
  "Speaker 2": "var(--color-accent)",
  "Speaker 3": "var(--color-info)",
};

export function TranscriptRow({ segment }: { segment: TranscriptSegment }) {
  const isPartial = segment.state === "partial";
  const isLow = segment.state === "low_confidence";
  const color = segment.speakerId
    ? (SPEAKER_COLORS[segment.speakerId] ?? "var(--color-text)")
    : "var(--color-text)";

  return (
    <div
      data-testid="transcript-row"
      data-state={segment.state}
      className="grid gap-3 py-3 border-b"
      style={{ gridTemplateColumns: "72px 1fr", borderColor: "var(--color-border-subtle)" }}
    >
      <div
        className="text-xs font-mono tabular-nums pt-1"
        style={{ color: "var(--color-text-subtle)" }}
      >
        {fmtTs(segment.startMs)}
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-2 mb-1">
          {segment.speakerId && (
            <span className="text-sm font-semibold" style={{ color }}>
              {segment.speakerId}
            </span>
          )}
          {isLow && (
            <span
              className="inline-flex items-center gap-1 text-xs"
              style={{ color: "var(--color-warning)" }}
            >
              <TriangleAlert className="w-3 h-3" aria-hidden />
              신뢰도 낮음
            </span>
          )}
        </div>
        <p
          className="text-[15px] leading-[1.6] break-words"
          style={{
            color: isPartial ? "var(--color-text-muted)" : "var(--color-text)",
            fontStyle: isPartial ? "italic" : "normal",
          }}
        >
          {segment.text}
          {isPartial && <span aria-hidden> …</span>}
        </p>
      </div>
    </div>
  );
}
