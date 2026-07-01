import type {
  CreateSessionRequest,
  CreateSessionResponse,
  ExportRequest,
  ExportResponse,
  HealthResponse,
  SessionResultResponse,
} from "./contracts";
import { normalizeErrorPayload } from "./contracts";
import type { ErrorPayload } from "../types";

export class MeetingApiError extends Error {
  constructor(
    public readonly payload: ErrorPayload,
    public readonly status = 500,
  ) {
    super(payload.message);
  }
}

export function isMeetingApiConfigured(): boolean {
  return getMeetingApiBaseUrl() !== null;
}

export function getMeetingApiBaseUrl(): string | null {
  const explicit = import.meta.env.VITE_MEETING_API_BASE_URL as string | undefined;
  if (explicit) return explicit.replace(/\/$/, "");
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  if (supabaseUrl) return `${supabaseUrl.replace(/\/$/, "")}/functions/v1/meeting-api`;
  return null;
}

export async function getHealth(): Promise<HealthResponse> {
  return request<HealthResponse>("GET", "/health");
}

export async function createSession(input: CreateSessionRequest): Promise<CreateSessionResponse> {
  return request<CreateSessionResponse>("POST", "/sessions", input);
}

export async function getSession(
  id: string,
): Promise<{ session: CreateSessionResponse["session"] }> {
  return request<{ session: CreateSessionResponse["session"] }>(
    "GET",
    `/sessions/${encodeURIComponent(id)}`,
  );
}

export async function getSessionResult(id: string): Promise<SessionResultResponse> {
  return request<SessionResultResponse>("GET", `/sessions/${encodeURIComponent(id)}/result`);
}

export async function exportSession(id: string, input: ExportRequest): Promise<ExportResponse> {
  return request<ExportResponse>("POST", `/sessions/${encodeURIComponent(id)}/export`, input);
}

async function request<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  const baseUrl = getMeetingApiBaseUrl();
  if (!baseUrl) {
    throw new MeetingApiError({
      code: "MEETING_API_NOT_CONFIGURED",
      message: "Supabase meeting-api endpoint is not configured.",
      retryable: false,
    });
  }

  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  const apikey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    import.meta.env.VITE_SUPABASE_ANON_KEY) as string | undefined;
  if (apikey) headers.apikey = apikey;

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body == null ? undefined : JSON.stringify(body),
  });

  if (!response.ok) {
    let payload: ErrorPayload;
    try {
      payload = normalizeErrorPayload(await response.json(), `HTTP_${response.status}`);
    } catch {
      payload = {
        code: `HTTP_${response.status}`,
        message: response.statusText || "API 요청에 실패했습니다.",
        retryable: response.status >= 500,
      };
    }
    throw new MeetingApiError(payload, response.status);
  }

  return (await response.json()) as T;
}
