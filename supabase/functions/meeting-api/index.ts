import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.108.2";

type SummaryInterval = 30 | 60 | "manual";
type ExportFormat = "md" | "txt" | "json";

interface SessionMeta {
  id: string;
  title: string;
  language: string;
  summaryInterval: SummaryInterval;
  chunkIntervalMs: number;
  startedAt: string;
  endedAt?: string;
  wsUrl?: string;
}

interface TranscriptSegment {
  id: string;
  speakerId?: string;
  startMs: number;
  endMs?: number;
  text: string;
  confidence?: number;
  state: "partial" | "final" | "corrected" | "low_confidence";
}

interface SummarySnapshot {
  id: string;
  createdAt: string;
  rangeStartMs: number;
  rangeEndMs: number;
  bullets: string[];
  confidence?: number;
}

interface ActionItem {
  id: string;
  text: string;
  owner?: string;
  dueDate?: string;
  sourceSegmentIds: string[];
  status: "open" | "done";
}

interface DecisionItem {
  id: string;
  text: string;
  sourceSegmentIds: string[];
}

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "GET,POST,OPTIONS",
};

const jsonHeaders = {
  ...corsHeaders,
  "content-type": "application/json; charset=utf-8",
};

function adminClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = serviceKey();
  if (!url || !key)
    throw httpError(500, "SUPABASE_NOT_CONFIGURED", "Supabase secrets are not configured.");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function serviceKey(): string | undefined {
  const secretKeys = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (secretKeys) {
    try {
      const parsed = JSON.parse(secretKeys) as Record<string, string>;
      return parsed.default ?? Object.values(parsed)[0];
    } catch {
      return undefined;
    }
  }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
}

function httpError(status: number, code: string, message: string, retryable = false) {
  return { status, code, message, retryable };
}

function errorResponse(error: unknown): Response {
  const e =
    error && typeof error === "object" && "status" in error
      ? (error as { status: number; code: string; message: string; retryable?: boolean })
      : httpError(500, "INTERNAL_ERROR", error instanceof Error ? error.message : "Internal error");
  return new Response(
    JSON.stringify({
      code: e.code,
      message: e.message,
      retryable: e.retryable ?? false,
      traceId: crypto.randomUUID(),
    }),
    { status: e.status, headers: jsonHeaders },
  );
}

function ok(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: jsonHeaders });
}

function routeParts(req: Request): string[] {
  const url = new URL(req.url);
  const parts = url.pathname.split("/").filter(Boolean);
  const index = parts.lastIndexOf("meeting-api");
  return index >= 0 ? parts.slice(index + 1) : parts;
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function validateSessionInput(input: Record<string, unknown>) {
  const title = typeof input.title === "string" ? input.title.trim() : "";
  const language = input.language;
  const summaryInterval = input.summaryInterval;
  const chunkIntervalMs = Number(input.chunkIntervalMs);

  if (title.length < 1 || title.length > 80) {
    throw httpError(400, "INVALID_TITLE", "회의 제목은 1-80자여야 합니다.");
  }
  if (!["ko-KR", "en-US", "ja-JP"].includes(String(language))) {
    throw httpError(400, "INVALID_LANGUAGE", "지원하지 않는 언어입니다.");
  }
  if (![30, 60, "manual"].includes(summaryInterval as never)) {
    throw httpError(400, "INVALID_SUMMARY_INTERVAL", "요약 주기를 선택하세요.");
  }
  if (!Number.isInteger(chunkIntervalMs) || chunkIntervalMs < 100 || chunkIntervalMs > 1000) {
    throw httpError(400, "INVALID_CHUNK_INTERVAL", "오디오 chunk 간격은 100-1000ms여야 합니다.");
  }

  return {
    title,
    language: language as "ko-KR" | "en-US" | "ja-JP",
    summaryInterval: summaryInterval as SummaryInterval,
    chunkIntervalMs,
  };
}

function toSession(row: Record<string, unknown>): SessionMeta {
  return {
    id: String(row.id),
    title: String(row.title),
    language: String(row.language),
    summaryInterval:
      row.summary_interval === "manual" ? "manual" : Number(row.summary_interval) === 30 ? 30 : 60,
    chunkIntervalMs: Number(row.chunk_interval_ms),
    startedAt: String(row.started_at),
    endedAt: row.ended_at ? String(row.ended_at) : undefined,
    wsUrl: row.ws_url ? String(row.ws_url) : undefined,
  };
}

function toSegment(row: Record<string, unknown>): TranscriptSegment {
  return {
    id: String(row.segment_id),
    speakerId: row.speaker_id ? String(row.speaker_id) : undefined,
    startMs: Number(row.start_ms),
    endMs: row.end_ms == null ? undefined : Number(row.end_ms),
    text: String(row.text ?? ""),
    confidence: row.confidence == null ? undefined : Number(row.confidence),
    state: row.state as TranscriptSegment["state"],
  };
}

function toSummary(row: Record<string, unknown>): SummarySnapshot {
  return {
    id: String(row.snapshot_id),
    createdAt: String(row.created_at),
    rangeStartMs: Number(row.range_start_ms),
    rangeEndMs: Number(row.range_end_ms),
    bullets: Array.isArray(row.bullets) ? row.bullets.map(String) : [],
    confidence: row.confidence == null ? undefined : Number(row.confidence),
  };
}

function toAction(row: Record<string, unknown>): ActionItem {
  return {
    id: String(row.action_id),
    text: String(row.text),
    owner: row.owner ? String(row.owner) : undefined,
    dueDate: row.due_date ? String(row.due_date) : undefined,
    sourceSegmentIds: Array.isArray(row.source_segment_ids)
      ? row.source_segment_ids.map(String)
      : [],
    status: row.status === "done" ? "done" : "open",
  };
}

function toDecision(row: Record<string, unknown>): DecisionItem {
  return {
    id: String(row.decision_id),
    text: String(row.text),
    sourceSegmentIds: Array.isArray(row.source_segment_ids)
      ? row.source_segment_ids.map(String)
      : [],
  };
}

function exportFilename(session: SessionMeta, format: ExportFormat): string {
  const d = new Date(session.startedAt);
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
  return `meeting-summary-${stamp}.${format}`;
}

function fmtTs(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function buildExport(
  format: ExportFormat,
  session: SessionMeta,
  summaries: SummarySnapshot[],
  actions: ActionItem[],
  decisions: DecisionItem[],
  segments: TranscriptSegment[],
) {
  const finalSummary = summaries.at(-1);
  if (format === "json") {
    return {
      mimeType: "application/json",
      content: JSON.stringify(
        { session, summaries, actionItems: actions, decisions, transcript: segments },
        null,
        2,
      ),
    };
  }

  const lines: string[] = [];
  if (format === "md") {
    lines.push(`# ${session.title}`, "", "## 핵심 요약");
    if (finalSummary?.bullets.length) finalSummary.bullets.forEach((b) => lines.push(`- ${b}`));
    else lines.push("- 분석할 음성이 충분하지 않습니다.");
    lines.push("", "## 결정사항");
    if (decisions.length) decisions.forEach((d) => lines.push(`- ${d.text}`));
    else lines.push("- 없음");
    lines.push("", "## 할 일");
    if (actions.length)
      actions.forEach((a) =>
        lines.push(
          `- [${a.status === "done" ? "x" : " "}] ${a.text}${a.owner ? ` (${a.owner})` : ""}`,
        ),
      );
    else lines.push("- 없음");
    lines.push("", "## 전체 자막");
    segments.forEach((s) =>
      lines.push(`- \`${fmtTs(s.startMs)}\` **${s.speakerId ?? ""}**: ${s.text}`),
    );
    return { mimeType: "text/markdown", content: lines.join("\n") };
  }

  lines.push(session.title, "=".repeat(session.title.length), "", "[요약]");
  if (finalSummary?.bullets.length) finalSummary.bullets.forEach((b) => lines.push(`- ${b}`));
  else lines.push("- 없음");
  lines.push("", "[전체 자막]");
  segments.forEach((s) => lines.push(`${fmtTs(s.startMs)} ${s.speakerId ?? ""}: ${s.text}`));
  return { mimeType: "text/plain", content: lines.join("\n") };
}

async function getResult(client: ReturnType<typeof adminClient>, id: string) {
  const { data: session, error: sessionError } = await client
    .from("meeting_sessions")
    .select("*")
    .eq("id", id)
    .single();
  if (sessionError || !session)
    throw httpError(404, "SESSION_NOT_FOUND", "세션을 찾을 수 없습니다.");

  const [segmentsRes, summariesRes, actionsRes, decisionsRes, keywordsRes] = await Promise.all([
    client
      .from("transcript_segments")
      .select("*")
      .eq("session_id", id)
      .neq("state", "partial")
      .order("start_ms"),
    client.from("summary_snapshots").select("*").eq("session_id", id).order("created_at"),
    client.from("action_items").select("*").eq("session_id", id).order("created_at"),
    client.from("decision_items").select("*").eq("session_id", id).order("created_at"),
    client.from("session_keywords").select("keywords").eq("session_id", id).maybeSingle(),
  ]);

  for (const res of [segmentsRes, summariesRes, actionsRes, decisionsRes, keywordsRes]) {
    if (res.error) throw httpError(500, "DATABASE_READ_FAILED", res.error.message, true);
  }

  return {
    session: toSession(session),
    segments: (segmentsRes.data ?? []).map(toSegment),
    summaries: (summariesRes.data ?? []).map(toSummary),
    actionItems: (actionsRes.data ?? []).map(toAction),
    decisions: (decisionsRes.data ?? []).map(toDecision),
    keywords: Array.isArray(keywordsRes.data?.keywords)
      ? keywordsRes.data.keywords.map(String)
      : [],
  };
}

export default {
  async fetch(req: Request): Promise<Response> {
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });

    try {
      const client = adminClient();
      const parts = routeParts(req);

      if (req.method === "GET" && parts[0] === "health") {
        const started = performance.now();
        const probe = await client.from("meeting_sessions").select("id").limit(1);
        const okDatabase = !probe.error;
        return ok({
          status: okDatabase ? "ok" : "degraded",
          checkedAt: new Date().toISOString(),
          services: {
            backend: { status: "ok" },
            database: {
              status: okDatabase ? "ok" : "failed",
              latencyMs: Math.round(performance.now() - started),
              message: probe.error?.message,
            },
            stt: {
              status: Deno.env.get("GOOGLE_CLOUD_PROJECT") ? "ok" : "degraded",
              message: Deno.env.get("GOOGLE_CLOUD_PROJECT")
                ? undefined
                : "GOOGLE_CLOUD_PROJECT is not configured",
            },
            gemini: {
              status: Deno.env.get("GEMINI_API_KEY") ? "ok" : "degraded",
              message: Deno.env.get("GEMINI_API_KEY")
                ? undefined
                : "GEMINI_API_KEY is not configured",
            },
            bridge: {
              status: Deno.env.get("STT_BRIDGE_WS_URL") ? "ok" : "degraded",
              message: Deno.env.get("STT_BRIDGE_WS_URL")
                ? undefined
                : "STT_BRIDGE_WS_URL is not configured",
            },
          },
        });
      }

      if (req.method === "POST" && parts[0] === "sessions" && parts.length === 1) {
        const body = await req.json();
        const input = validateSessionInput(body);
        const token = crypto.randomUUID() + "." + crypto.randomUUID();
        const bridgeBase = Deno.env.get("STT_BRIDGE_WS_URL") ?? "ws://localhost:8787";
        const { data, error } = await client
          .from("meeting_sessions")
          .insert({
            title: input.title,
            language: input.language,
            summary_interval: String(input.summaryInterval),
            chunk_interval_ms: input.chunkIntervalMs,
            session_token_hash: await sha256(token),
          })
          .select("*")
          .single();
        if (error || !data)
          throw httpError(
            500,
            "SESSION_CREATE_FAILED",
            error?.message ?? "세션 생성에 실패했습니다.",
            true,
          );

        const wsUrl = `${bridgeBase.replace(/\/$/, "")}/sessions/${data.id}/audio?token=${encodeURIComponent(token)}`;
        await client.from("meeting_sessions").update({ ws_url: wsUrl }).eq("id", data.id);
        return ok(
          {
            session: { ...toSession({ ...data, ws_url: wsUrl }), sessionToken: token, wsUrl },
            sessionToken: token,
            wsUrl,
          },
          201,
        );
      }

      if (req.method === "GET" && parts[0] === "sessions" && parts[1] && parts.length === 2) {
        const { data, error } = await client
          .from("meeting_sessions")
          .select("*")
          .eq("id", parts[1])
          .single();
        if (error || !data) throw httpError(404, "SESSION_NOT_FOUND", "세션을 찾을 수 없습니다.");
        return ok({ session: toSession(data) });
      }

      if (req.method === "GET" && parts[0] === "sessions" && parts[1] && parts[2] === "result") {
        const result = await getResult(client, parts[1]);
        return ok({
          ...result,
          emptyReason: result.segments.length === 0 ? "no_audio" : undefined,
        });
      }

      if (req.method === "POST" && parts[0] === "sessions" && parts[1] && parts[2] === "export") {
        const body = await req.json();
        const format = body.format as ExportFormat;
        if (!["md", "txt", "json"].includes(format))
          throw httpError(400, "INVALID_EXPORT_FORMAT", "지원하지 않는 내보내기 형식입니다.");
        const result = await getResult(client, parts[1]);
        const generated = buildExport(
          format,
          result.session,
          result.summaries,
          result.actionItems,
          result.decisions,
          result.segments,
        );
        const filename = exportFilename(result.session, format);
        await client.from("export_jobs").insert({
          session_id: parts[1],
          format,
          filename,
          mime_type: generated.mimeType,
          content: generated.content,
        });
        return ok({ filename, mimeType: generated.mimeType, content: generated.content });
      }

      throw httpError(404, "NOT_FOUND", "요청한 meeting-api 경로가 없습니다.");
    } catch (error) {
      return errorResponse(error);
    }
  },
};
