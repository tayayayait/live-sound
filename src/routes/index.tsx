import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { CheckCircle2, CircleX, Mic, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/meeting/AppShell";
import { AudioMeter } from "@/components/meeting/AudioMeter";
import { SettingsModal } from "@/components/meeting/SettingsModal";
import { createSession, getHealth, isMeetingApiConfigured } from "@/lib/meeting/api/httpClient";
import {
  isBrowserSupported,
  listInputDevices,
  readLevel,
  requestMic,
  type AudioSession,
} from "@/lib/meeting/audio";
import { useMeetingStore } from "@/lib/meeting/store";
import type { PermissionState } from "@/lib/meeting/types";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "실시간 회의 시작 · Live Meeting AI" },
      {
        name: "description",
        content: "마이크 권한을 확인하고 실시간 회의 세션을 시작합니다.",
      },
    ],
  }),
  component: SetupScreen,
});

function defaultTitle(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `새 회의 - ${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function SetupScreen() {
  const navigate = useNavigate();
  const permission = useMeetingStore((s) => s.permission);
  const setPermission = useMeetingStore((s) => s.setPermission);
  const setSession = useMeetingStore((s) => s.setSession);
  const reset = useMeetingStore((s) => s.reset);

  const [title, setTitle] = useState(defaultTitle());
  const [titleError, setTitleError] = useState<string | null>(null);
  const [language, setLanguage] = useState("ko-KR");
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState<string | undefined>();
  const [summaryInterval, setSummaryInterval] = useState<30 | 60 | "manual">(60);
  const [chunkIntervalMs, setChunkIntervalMs] = useState(100);
  const [showLowConfidence, setShowLowConfidence] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [level, setLevel] = useState(0);
  const [sampleRate, setSampleRate] = useState<number | null>(null);
  const [apiConfigured] = useState(isMeetingApiConfigured());
  const [apiState, setApiState] = useState<"mock" | "checking" | "ok" | "degraded" | "failed">(
    isMeetingApiConfigured() ? "checking" : "mock",
  );
  const [starting, setStarting] = useState(false);
  const audioRef = useRef<AudioSession | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    reset();
    if (!isBrowserSupported()) setPermission("unsupported");
  }, [reset, setPermission]);

  useEffect(() => {
    if (!apiConfigured) return;
    let cancelled = false;
    getHealth()
      .then((health) => {
        if (!cancelled) setApiState(health.status);
      })
      .catch((error: unknown) => {
        console.error(error);
        if (!cancelled) setApiState("failed");
      });
    return () => {
      cancelled = true;
    };
  }, [apiConfigured]);

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      audioRef.current?.stop();
      audioRef.current = null;
    };
  }, []);

  const stopMonitoring = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    audioRef.current?.stop();
    audioRef.current = null;
    setLevel(0);
  };

  const startMonitoring = (session: AudioSession) => {
    const tick = () => {
      setLevel(readLevel(session.analyser));
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  };

  const checkPermission = async () => {
    if (!isBrowserSupported()) {
      setPermission("unsupported");
      return;
    }
    setPermission("prompt");
    try {
      const session = await requestMic(deviceId);
      audioRef.current = session;
      setSampleRate(session.audioContext.sampleRate);
      setPermission("granted");
      const list = await listInputDevices();
      setDevices(list);
      if (!deviceId && list[0]?.deviceId) setDeviceId(list[0].deviceId);
      startMonitoring(session);
      toast.success("마이크가 준비되었습니다.");
    } catch (err) {
      console.error(err);
      setPermission("denied");
      toast.error("마이크 권한이 거부되었습니다.");
    }
  };

  const changeDevice = async (id: string) => {
    setDeviceId(id);
    if (permission !== "granted") return;
    stopMonitoring();
    try {
      const session = await requestMic(id);
      audioRef.current = session;
      setSampleRate(session.audioContext.sampleRate);
      startMonitoring(session);
    } catch (err) {
      console.error(err);
      toast.error("장치 전환에 실패했습니다.");
    }
  };

  const validateTitle = (v: string) => {
    if (v.length > 80) {
      setTitleError("회의 제목은 80자 이내로 입력하세요.");
      return false;
    }
    setTitleError(null);
    return true;
  };

  const canStart = permission === "granted" && !titleError && apiState !== "failed" && !starting;

  const startSession = async () => {
    if (!canStart) return;
    setStarting(true);
    try {
      if (apiConfigured) {
        const created = await createSession({
          title: title.trim() || defaultTitle(),
          language: language as "ko-KR" | "en-US" | "ja-JP",
          summaryInterval,
          chunkIntervalMs,
          clientCapabilities: {
            sampleRate: sampleRate ?? undefined,
            mimeTypes: ["audio/pcm;rate=16000"],
          },
        });
        setSession({
          ...created.session,
          sessionToken: created.sessionToken,
          wsUrl: created.wsUrl,
          deviceId,
        });
        stopMonitoring();
        navigate({ to: "/session/$sessionId", params: { sessionId: created.session.id } });
        return;
      }

      const sessionId = `local-${Date.now()}`;
      setSession({
        id: sessionId,
        title: title.trim() || defaultTitle(),
        language,
        summaryInterval,
        chunkIntervalMs,
        deviceId,
        startedAt: new Date().toISOString(),
      });
      stopMonitoring();
      navigate({ to: "/session/$sessionId", params: { sessionId } });
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "세션 생성에 실패했습니다.");
    } finally {
      setStarting(false);
    }
  };

  return (
    <AppShell title="실시간 회의 시작" onOpenSettings={() => setSettingsOpen(true)}>
      {permission === "denied" && <PermissionBanner onRetry={checkPermission} />}
      {permission === "unsupported" && <UnsupportedBanner />}

      <div className="w-full max-w-[1120px] mx-auto px-4 py-6 md:px-6 md:py-8 pb-32 md:pb-8">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
          <section className="md:col-span-7 flex flex-col gap-5">
            <h1 className="text-2xl md:text-[28px] font-bold leading-tight">실시간 회의 시작</h1>

            <FormField
              label="회의 제목"
              id="meeting-title"
              helper="80자 이내로 입력하세요."
              error={titleError}
            >
              <input
                id="meeting-title"
                type="text"
                value={title}
                maxLength={80}
                onChange={(e) => {
                  setTitle(e.target.value);
                  validateTitle(e.target.value);
                }}
                className="h-11 px-3 rounded-md border bg-white w-full"
                style={{
                  borderColor: titleError ? "var(--color-error)" : "var(--color-border)",
                }}
                aria-invalid={!!titleError}
              />
            </FormField>

            <FormField label="언어" id="meeting-lang">
              <select
                id="meeting-lang"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="h-11 px-3 rounded-md border bg-white w-full"
                style={{ borderColor: "var(--color-border)" }}
              >
                <option value="ko-KR">한국어</option>
                <option value="en-US">English (US)</option>
                <option value="ja-JP">日本語</option>
              </select>
            </FormField>

            <FormField
              label="입력 장치"
              id="meeting-device"
              helper={permission !== "granted" ? "마이크 권한 허용 후 선택 가능" : undefined}
            >
              <select
                id="meeting-device"
                value={deviceId ?? ""}
                onChange={(e) => changeDevice(e.target.value)}
                disabled={permission !== "granted" || devices.length === 0}
                className="h-11 px-3 rounded-md border bg-white w-full disabled:opacity-50"
                style={{ borderColor: "var(--color-border)" }}
              >
                {devices.length === 0 && <option value="">사용 가능한 마이크가 없습니다.</option>}
                {devices.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || `마이크 (${d.deviceId.slice(0, 6)})`}
                  </option>
                ))}
              </select>
            </FormField>

            <fieldset>
              <legend className="text-sm font-medium mb-2">요약 주기</legend>
              <div
                role="radiogroup"
                className="inline-flex rounded-md p-1"
                style={{ backgroundColor: "var(--color-surface-alt)" }}
              >
                {(["30", "60", "manual"] as const).map((v) => {
                  const val = v === "manual" ? "manual" : (Number(v) as 30 | 60);
                  const active = summaryInterval === val;
                  return (
                    <button
                      key={v}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => setSummaryInterval(val)}
                      className="h-9 px-4 text-sm font-medium rounded"
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
          </section>

          <aside className="md:col-span-5 md:sticky md:top-[80px] flex flex-col gap-4 self-start">
            <Panel title="마이크 테스트">
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between text-sm">
                  <span style={{ color: "var(--color-text-muted)" }}>권한</span>
                  <PermissionPill state={permission} />
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span style={{ color: "var(--color-text-muted)" }}>Sample rate</span>
                  <span className="font-mono">{sampleRate ? `${sampleRate} Hz` : "-"}</span>
                </div>
                <div>
                  <div className="text-xs mb-1.5" style={{ color: "var(--color-text-subtle)" }}>
                    음량 레벨
                  </div>
                  <AudioMeter level={level} />
                </div>
                {permission !== "granted" && (
                  <button
                    type="button"
                    data-testid="mic-check-button"
                    onClick={checkPermission}
                    className="h-11 rounded-md text-sm font-semibold inline-flex items-center justify-center gap-2 border bg-white"
                    style={{ borderColor: "var(--color-border)" }}
                  >
                    <Mic className="w-4 h-4" aria-hidden />
                    마이크 확인
                  </button>
                )}
              </div>
            </Panel>

            <Panel title="API 상태">
              <ul className="flex flex-col gap-2 text-sm">
                <ApiRow
                  label="Supabase API"
                  ok={apiState !== "failed"}
                  status={apiStateLabel(apiState)}
                />
                <ApiRow
                  label="Google STT Bridge"
                  ok={apiState !== "failed"}
                  status={apiConfigured ? apiStateLabel(apiState) : "모의"}
                />
                <ApiRow
                  label="Gemini 요약"
                  ok={apiState !== "failed"}
                  status={apiConfigured ? apiStateLabel(apiState) : "모의"}
                />
              </ul>
              <p className="text-xs mt-3" style={{ color: "var(--color-text-subtle)" }}>
                {apiConfigured
                  ? "Supabase meeting-api 상태를 기준으로 표시합니다."
                  : "VITE_MEETING_API_BASE_URL 또는 VITE_SUPABASE_URL이 없어서 모의 어댑터로 실행합니다."}
              </p>
            </Panel>

            <button
              type="button"
              data-testid="start-session-button"
              onClick={startSession}
              disabled={!canStart}
              className="hidden md:inline-flex h-12 items-center justify-center rounded-md text-[15px] font-semibold text-white disabled:opacity-45 disabled:cursor-not-allowed"
              style={{ backgroundColor: "var(--color-primary)" }}
            >
              {starting ? "세션 생성 중" : "실시간 회의 시작"}
            </button>
          </aside>
        </div>
      </div>

      {/* Mobile sticky start button */}
      <div
        className="md:hidden fixed bottom-0 left-0 right-0 p-4 border-t"
        style={{
          backgroundColor: "var(--color-surface)",
          borderColor: "var(--color-border-subtle)",
        }}
      >
        <button
          type="button"
          data-testid="start-session-button"
          onClick={startSession}
          disabled={!canStart}
          className="w-full h-14 rounded-md text-[15px] font-semibold text-white disabled:opacity-45"
          style={{ backgroundColor: "var(--color-primary)" }}
        >
          {starting ? "세션 생성 중" : "실시간 회의 시작"}
        </button>
      </div>

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        devices={devices}
        values={{ deviceId, language, summaryInterval, chunkIntervalMs, showLowConfidence }}
        onSave={(v) => {
          setLanguage(v.language);
          setSummaryInterval(v.summaryInterval);
          setChunkIntervalMs(v.chunkIntervalMs);
          setShowLowConfidence(v.showLowConfidence);
          if (v.deviceId && v.deviceId !== deviceId) changeDevice(v.deviceId);
        }}
      />
    </AppShell>
  );
}

function FormField({
  label,
  id,
  children,
  helper,
  error,
}: {
  label: string;
  id: string;
  children: React.ReactNode;
  helper?: string;
  error?: string | null;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {error ? (
        <p role="alert" className="text-xs" style={{ color: "var(--color-error)" }}>
          {error}
        </p>
      ) : helper ? (
        <p className="text-xs" style={{ color: "var(--color-text-subtle)" }}>
          {helper}
        </p>
      ) : null}
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section
      className="rounded-lg p-5"
      style={{
        backgroundColor: "var(--color-surface)",
        border: "1px solid var(--color-border-subtle)",
      }}
    >
      <h3 className="text-base font-bold mb-3">{title}</h3>
      {children}
    </section>
  );
}

function PermissionPill({ state }: { state: PermissionState }) {
  const map: Record<PermissionState, { label: string; bg: string; fg: string }> = {
    unknown: { label: "미확인", bg: "var(--color-surface-alt)", fg: "var(--color-text-muted)" },
    prompt: { label: "요청 중", bg: "var(--color-info-soft)", fg: "var(--color-info)" },
    granted: { label: "허용됨", bg: "var(--color-success-soft)", fg: "var(--color-success)" },
    denied: { label: "거부됨", bg: "var(--color-error-soft)", fg: "var(--color-error)" },
    unsupported: { label: "미지원", bg: "var(--color-error-soft)", fg: "var(--color-error)" },
  };
  const s = map[state];
  return (
    <span
      className="inline-flex items-center h-6 px-2 rounded-full text-xs font-medium"
      style={{ backgroundColor: s.bg, color: s.fg }}
    >
      {s.label}
    </span>
  );
}

function apiStateLabel(state: "mock" | "checking" | "ok" | "degraded" | "failed") {
  if (state === "mock") return "모의";
  if (state === "checking") return "확인 중";
  if (state === "ok") return "정상";
  if (state === "degraded") return "지연";
  return "오류";
}

function ApiRow({ label, ok, status }: { label: string; ok: boolean; status?: string }) {
  return (
    <li className="flex items-center justify-between">
      <span>{label}</span>
      <span
        className="inline-flex items-center gap-1 text-xs font-medium"
        style={{ color: ok ? "var(--color-success)" : "var(--color-error)" }}
      >
        {ok ? <CheckCircle2 className="w-3.5 h-3.5" /> : <CircleX className="w-3.5 h-3.5" />}
        {status ?? (ok ? "정상" : "오류")}
      </span>
    </li>
  );
}

function PermissionBanner({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="px-4 md:px-6 py-3 flex items-center gap-3 flex-wrap"
      style={{ backgroundColor: "var(--color-error-soft)", color: "var(--color-error)" }}
    >
      <CircleX className="w-4 h-4" aria-hidden />
      <span className="text-sm flex-1 min-w-0">
        마이크 권한이 차단되었습니다. 브라우저 설정에서 마이크 권한을 허용한 뒤 다시 시도하세요.
      </span>
      <button
        type="button"
        onClick={onRetry}
        className="h-8 px-3 rounded-md text-sm font-medium border bg-white"
        style={{ borderColor: "var(--color-error)", color: "var(--color-error)" }}
      >
        다시 확인
      </button>
    </div>
  );
}

function UnsupportedBanner() {
  return (
    <div
      role="alert"
      className="px-4 md:px-6 py-3 flex items-center gap-3"
      style={{ backgroundColor: "var(--color-warning-soft)", color: "var(--color-warning)" }}
    >
      <TriangleAlert className="w-4 h-4" aria-hidden />
      <span className="text-sm">
        이 브라우저는 실시간 녹음을 지원하지 않습니다. Chrome 또는 Edge에서 다시 시도하세요.
      </span>
    </div>
  );
}
