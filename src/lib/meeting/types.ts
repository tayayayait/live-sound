export type AppSessionState =
  | "idle"
  | "checking_permission"
  | "ready"
  | "connecting"
  | "recording"
  | "paused"
  | "reconnecting"
  | "stopping"
  | "processing_final"
  | "completed"
  | "error";

export type PermissionState = "unknown" | "prompt" | "granted" | "denied" | "unsupported";

export type WebSocketState =
  "disconnected" | "connecting" | "connected" | "degraded" | "reconnecting" | "failed";

export type SummaryState = "empty" | "waiting" | "generating" | "ready" | "stale" | "failed";

export type ExportState = "idle" | "preparing" | "downloading" | "success" | "failed";

export interface TranscriptSegment {
  id: string;
  speakerId?: string;
  startMs: number;
  endMs?: number;
  text: string;
  confidence?: number;
  state: "partial" | "final" | "corrected" | "low_confidence";
}

export interface SummarySnapshot {
  id: string;
  createdAt: string;
  rangeStartMs: number;
  rangeEndMs: number;
  bullets: string[];
  confidence?: number;
}

export interface ActionItem {
  id: string;
  text: string;
  owner?: string;
  dueDate?: string;
  sourceSegmentIds: string[];
  status: "open" | "done";
}

export interface DecisionItem {
  id: string;
  text: string;
  sourceSegmentIds: string[];
}

export interface ErrorPayload {
  code: string;
  message: string;
  retryable: boolean;
  traceId?: string;
}

export interface SessionMeta {
  id: string;
  title: string;
  language: string;
  summaryInterval: 30 | 60 | "manual";
  chunkIntervalMs: number;
  deviceId?: string;
  startedAt: string;
  endedAt?: string;
  sessionToken?: string;
  wsUrl?: string;
}
