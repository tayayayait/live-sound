import { z } from "zod";
import type {
  ActionItem,
  DecisionItem,
  ErrorPayload,
  SessionMeta,
  SummarySnapshot,
  TranscriptSegment,
} from "../types";

const transcriptSegmentSchema = z.object({
  id: z.string().min(1),
  speakerId: z.string().optional(),
  startMs: z.number().nonnegative(),
  endMs: z.number().nonnegative().optional(),
  text: z.string(),
  confidence: z.number().min(0).max(1).optional(),
  state: z.enum(["partial", "final", "corrected", "low_confidence"]),
});

const summarySnapshotSchema = z.object({
  id: z.string().min(1),
  createdAt: z.string().min(1),
  rangeStartMs: z.number().nonnegative(),
  rangeEndMs: z.number().nonnegative(),
  bullets: z.array(z.string()),
  confidence: z.number().min(0).max(1).optional(),
});

const actionItemSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  owner: z.string().optional(),
  dueDate: z.string().optional(),
  sourceSegmentIds: z.array(z.string()),
  status: z.enum(["open", "done"]),
});

const decisionItemSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  sourceSegmentIds: z.array(z.string()),
});

const errorPayloadSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  retryable: z.boolean(),
  traceId: z.string().optional(),
});

const audioChunkPayloadSchema = z.object({
  sequence: z.number().int().nonnegative(),
  mimeType: z.string().min(1),
  durationMs: z.number().positive(),
  sampleRate: z.number().int().positive(),
  data: z.string().min(1),
});

const clientEventSchemas = {
  "audio.chunk": audioChunkPayloadSchema,
  "session.pause": z.object({ at: z.string().min(1) }),
  "session.resume": z.object({ at: z.string().min(1) }),
  "session.stop": z.object({ at: z.string().min(1) }),
  "summary.request": z.object({ reason: z.enum(["manual"]) }),
  "heartbeat.ping": z.object({ sentAt: z.string().min(1) }),
} as const;

const serverEventSchemas = {
  "status.ready": z.object({ sessionId: z.string().min(1) }),
  "status.latency": z.object({ latencyMs: z.number().nonnegative() }),
  "transcript.partial": transcriptSegmentSchema,
  "transcript.final": transcriptSegmentSchema,
  "summary.snapshot": summarySnapshotSchema,
  "action_item.detected": actionItemSchema,
  "decision.detected": decisionItemSchema,
  "keywords.updated": z.object({ keywords: z.array(z.string()) }),
  "session.completed": z.object({ resultId: z.string().min(1), endedAt: z.string().optional() }),
  "heartbeat.pong": z.object({ sentAt: z.string().min(1), receivedAt: z.string().min(1) }),
  error: errorPayloadSchema,
} as const;

export interface HealthResponse {
  status: "ok" | "degraded" | "failed";
  services: Record<"backend" | "stt" | "gemini" | "database" | "bridge", ServiceHealth>;
  checkedAt: string;
}

export interface ServiceHealth {
  status: "ok" | "degraded" | "failed";
  latencyMs?: number;
  message?: string;
}

export interface CreateSessionRequest {
  title: string;
  language: "ko-KR" | "en-US" | "ja-JP";
  summaryInterval: 30 | 60 | "manual";
  chunkIntervalMs: number;
  clientCapabilities: {
    sampleRate?: number;
    mimeTypes: string[];
  };
}

export interface CreateSessionResponse {
  session: SessionMeta;
  sessionToken: string;
  wsUrl: string;
}

export interface SessionResultResponse {
  session: SessionMeta;
  summaries: SummarySnapshot[];
  actionItems: ActionItem[];
  decisions: DecisionItem[];
  keywords: string[];
  segments: TranscriptSegment[];
  emptyReason?: "no_audio" | "silence_only" | "processing_failed";
}

export interface ExportRequest {
  format: "md" | "txt" | "json";
  include: {
    summary: boolean;
    decisions: boolean;
    actionItems: boolean;
    transcript: boolean;
  };
}

export interface ExportResponse {
  filename: string;
  mimeType: string;
  content: string;
}

type ClientEventPayloads = {
  [K in keyof typeof clientEventSchemas]: z.infer<(typeof clientEventSchemas)[K]>;
};

type ServerEventPayloads = {
  [K in keyof typeof serverEventSchemas]: z.infer<(typeof serverEventSchemas)[K]>;
};

export type ClientSocketEvent = {
  [K in keyof ClientEventPayloads]: { type: K; payload: ClientEventPayloads[K] };
}[keyof ClientEventPayloads];

export type ServerSocketEvent = {
  [K in keyof ServerEventPayloads]: { type: K; payload: ServerEventPayloads[K] };
}[keyof ServerEventPayloads];

export type AudioChunkPayload = ClientEventPayloads["audio.chunk"];

export function parseServerSocketEvent(value: unknown): ServerSocketEvent {
  return parseTypedEvent(value, serverEventSchemas, "server") as ServerSocketEvent;
}

export function parseClientSocketEvent(value: string | unknown): ClientSocketEvent {
  const raw = typeof value === "string" ? JSON.parse(value) : value;
  return parseTypedEvent(raw, clientEventSchemas, "client") as ClientSocketEvent;
}

export function serializeClientSocketEvent(event: ClientSocketEvent): string {
  return JSON.stringify(parseClientSocketEvent(event));
}

export function serializeServerSocketEvent(event: ServerSocketEvent): string {
  return JSON.stringify(parseServerSocketEvent(event));
}

function parseTypedEvent(
  value: unknown,
  schemas: Record<string, z.ZodTypeAny>,
  side: "client" | "server",
) {
  const envelope = z.object({ type: z.string(), payload: z.unknown() }).parse(value);
  const schema = schemas[envelope.type];
  if (!schema) {
    throw new Error(`Unsupported ${side} event: ${envelope.type}`);
  }
  return {
    type: envelope.type,
    payload: schema.parse(envelope.payload),
  };
}

export function normalizeErrorPayload(
  error: unknown,
  fallbackCode = "UNKNOWN_ERROR",
): ErrorPayload {
  if (error && typeof error === "object" && "code" in error && "message" in error) {
    const parsed = errorPayloadSchema.safeParse(error);
    if (parsed.success) return parsed.data;
  }
  return {
    code: fallbackCode,
    message: error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.",
    retryable: false,
  };
}
