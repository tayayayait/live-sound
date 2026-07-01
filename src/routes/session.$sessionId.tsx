import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Mic, Pause, Play, RefreshCw, Square } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/meeting/AppShell";
import { AudioMeter } from "@/components/meeting/AudioMeter";
import { ConfirmModal } from "@/components/meeting/ConfirmModal";
import { SettingsModal } from "@/components/meeting/SettingsModal";
import { TranscriptRow } from "@/components/meeting/TranscriptRow";
import {
  startAudioWorkletRecorder,
  type AudioWorkletRecorder,
} from "@/lib/meeting/api/audioWorkletRecorder";
import { MeetingSocketClient } from "@/lib/meeting/api/socketClient";
import { listInputDevices, readLevel, requestMic, type AudioSession } from "@/lib/meeting/audio";
import { MockAdapter } from "@/lib/meeting/mockAdapter";
import { useMeetingStore } from "@/lib/meeting/store";
import { fmtTs } from "@/lib/meeting/export";

export const Route = createFileRoute("/session/$sessionId")({
  head: () => ({
    meta: [
      { title: "실시간 처리 · Live Meeting AI" },
      { name: "description", content: "실시간 자막, 요약, 액션 아이템을 확인합니다." },
    ],
  }),
  component: LiveScreen,
});

type Tab = "transcript" | "summary" | "actions" | "decisions" | "keywords";

function LiveScreen() {
  const { sessionId } = Route.useParams();
  const navigate = useNavigate();

  const session = useMeetingStore((s) => s.session);
  const appState = useMeetingStore((s) => s.appState);
  const wsState = useMeetingStore((s) => s.wsState);
  const latencyMs = useMeetingStore((s) => s.latencyMs);
  const segments = useMeetingStore((s) => s.segments);
  const summaries = useMeetingStore((s) => s.summaries);
  const actionItems = useMeetingStore((s) => s.actionItems);
  const decisions = useMeetingStore((s) => s.decisions);
  const keywords = useMeetingStore((s) => s.keywords);
  const audioLevel = useMeetingStore((s) => s.audioLevel);
  const bufferSeconds = useMeetingStore((s) => s.bufferSeconds);
  const silenceSeconds = useMeetingStore((s) => s.silenceSeconds);
  const elapsed = useMeetingStore((s) => s.recordingElapsedMs);
  const setAppState = useMeetingStore((s) => s.setAppState);
  const setWsState = useMeetingStore((s) => s.setWsState);
  const setLatency = useMeetingStore((s) => s.setLatency);
  const upsertSegment = useMeetingStore((s) => s.upsertSegment);
  const addSummary = useMeetingStore((s) => s.addSummary);
  const addActionItem = useMeetingStore((s) => s.addActionItem);
  const addDecision = useMeetingStore((s) => s.addDecision);
  const setKeywords = useMeetingStore((s) => s.setKeywords);
  const setAudioLevel = useMeetingStore((s) => s.setAudioLevel);
  const setBufferSeconds = useMeetingStore((s) => s.setBufferSeconds);
  const setSilenceSeconds = useMeetingStore((s) => s.setSilenceSeconds);
  const setElapsed = useMeetingStore((s) => s.setElapsed);

  const [filter, setFilter] = useState<"all" | "final" | "low">("all");
  const [activeTab, setActiveTab] = useState<Tab>("summary");
  const [mobileTab, setMobileTab] = useState<"transcript" | Tab>("transcript");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [confirmStop, setConfirmStop] = useState(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [lowConfWarn, setLowConfWarn] = useState(false);

  const audioRef = useRef<AudioSession | null>(null);
  const adapterRef = useRef<MockAdapter | null>(null);
  const socketRef = useRef<MeetingSocketClient | null>(null);
  const recorderRef = useRef<AudioWorkletRecorder | null>(null);
  const rafRef = useRef<number | null>(null);
  const startTsRef = useRef<number>(Date.now());
  const listRef = useRef<HTMLDivElement | null>(null);
  const lowConfCountRef = useRef(0);

  // Redirect if no session
  useEffect(() => {
    if (!session || session.id !== sessionId) {
      navigate({ to: "/" });
    }
  }, [session, sessionId, navigate]);

  // Boot: acquire mic, connect adapter
  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    setAppState("connecting");
    setWsState("connecting");

    (async () => {
      try {
        const mic = await requestMic(session.deviceId);
        if (cancelled) {
          mic.stop();
          return;
        }
        audioRef.current = mic;
        const list = await listInputDevices();
        setDevices(list);

        startTsRef.current = Date.now();

        if (session.wsUrl) {
          const socket = new MeetingSocketClient(session.wsUrl, {
            onStateChange: (state) => {
              if (state === "connecting") setWsState("connecting");
              if (state === "connected") setWsState("connected");
              if (state === "reconnecting") {
                setWsState("reconnecting");
                setAppState("reconnecting");
              }
              if (state === "failed") {
                setWsState("failed");
                setAppState("error");
              }
            },
            onBufferChange: (seconds) => setBufferSeconds(seconds),
            onEvent: (event) => {
              if (event.type === "status.ready") {
                setAppState("recording");
                setWsState("connected");
              } else if (event.type === "status.latency") {
                setLatency(event.payload.latencyMs);
                setWsState(event.payload.latencyMs > 1000 ? "degraded" : "connected");
              } else if (event.type === "transcript.partial" || event.type === "transcript.final") {
                upsertSegment(event.payload);
                if (event.payload.state === "low_confidence") {
                  lowConfCountRef.current += 1;
                  if (lowConfCountRef.current >= 5) setLowConfWarn(true);
                } else if (event.type === "transcript.final") {
                  lowConfCountRef.current = 0;
                }
              } else if (event.type === "summary.snapshot") {
                addSummary(event.payload);
              } else if (event.type === "action_item.detected") {
                addActionItem(event.payload);
              } else if (event.type === "decision.detected") {
                addDecision(event.payload);
              } else if (event.type === "keywords.updated") {
                setKeywords(event.payload.keywords);
              } else if (event.type === "session.completed") {
                setAppState("completed");
                navigate({ to: "/session/$sessionId/result", params: { sessionId } });
              } else if (event.type === "error") {
                toast.error(event.payload.message);
                if (!event.payload.retryable) setAppState("error");
              }
            },
          });
          socketRef.current = socket;
          socket.connect();

          recorderRef.current = await startAudioWorkletRecorder({
            stream: mic.stream,
            chunkIntervalMs: session.chunkIntervalMs,
            onChunk: (chunk) => socket.sendAudioChunk(chunk),
          });
        } else {
          setAppState("recording");
          setWsState("connected");
          const adapter = new MockAdapter(
            {
              onPartial: (seg) => upsertSegment(seg),
              onFinal: (seg) => {
                upsertSegment(seg);
                if (seg.state === "low_confidence") {
                  lowConfCountRef.current += 1;
                  if (lowConfCountRef.current >= 5) setLowConfWarn(true);
                } else {
                  lowConfCountRef.current = 0;
                }
              },
              onSummary: (s) => addSummary(s),
              onAction: (a) => addActionItem(a),
              onDecision: (d) => addDecision(d),
              onKeywords: (k) => setKeywords(k),
              onLatency: (ms) => {
                setLatency(ms);
                setWsState(ms > 1000 ? "degraded" : "connected");
              },
            },
            { summaryIntervalSec: session.summaryInterval },
          );
          adapter.start();
          adapterRef.current = adapter;
        }

        // audio level + elapsed loop
        let lastBufTs = performance.now();
        let silenceStart = performance.now();
        const tick = () => {
          if (audioRef.current) {
            const lvl = readLevel(audioRef.current.analyser);
            setAudioLevel(lvl);
            if (lvl < 0.03) {
              setSilenceSeconds((performance.now() - silenceStart) / 1000);
            } else {
              silenceStart = performance.now();
              setSilenceSeconds(0);
            }
          }
          const now = performance.now();
          if (now - lastBufTs > 500) {
            setBufferSeconds(Math.random() * 1.5);
            lastBufTs = now;
          }
          setElapsed(Date.now() - startTsRef.current);
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
      } catch (err) {
        console.error(err);
        setAppState("error");
        setWsState("failed");
        toast.error("마이크 또는 연결에 실패했습니다.");
      }
    })();

    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      adapterRef.current?.stop();
      socketRef.current?.close();
      recorderRef.current?.stop();
      audioRef.current?.stop();
      audioRef.current = null;
      adapterRef.current = null;
      socketRef.current = null;
      recorderRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.id]);

  // beforeunload guard
  useEffect(() => {
    const guardStates = ["recording", "paused", "reconnecting", "processing_final"];
    const handler = (e: BeforeUnloadEvent) => {
      if (guardStates.includes(appState)) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [appState]);

  // auto scroll transcript
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (nearBottom) el.scrollTop = el.scrollHeight;
  }, [segments]);

  const filtered = useMemo(() => {
    if (filter === "final")
      return segments.filter((s) => s.state === "final" || s.state === "corrected");
    if (filter === "low") return segments.filter((s) => s.state === "low_confidence");
    return segments;
  }, [segments, filter]);

  const togglePause = () => {
    if (appState === "recording") {
      adapterRef.current?.pause();
      socketRef.current?.pause();
      setAppState("paused");
    } else if (appState === "paused") {
      adapterRef.current?.resume();
      socketRef.current?.resume();
      setAppState("recording");
    }
  };

  const doStop = () => {
    setConfirmStop(false);
    setAppState("stopping");
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    recorderRef.current?.stop();
    adapterRef.current?.stop();
    socketRef.current?.stop();
    audioRef.current?.stop();
    audioRef.current = null;
    recorderRef.current = null;
    setAppState("processing_final");
    if (socketRef.current) return;
    // simulate final processing
    setTimeout(() => {
      setAppState("completed");
      navigate({ to: "/session/$sessionId/result", params: { sessionId } });
    }, 800);
  };

  const currentSummary = summaries[summaries.length - 1];

  if (!session) return null;

  return (
    <AppShell
      title={session.title}
      onOpenSettings={() => setSettingsOpen(true)}
      rightExtra={
        <span
          className="hidden sm:inline text-xs font-mono tabular-nums"
          style={{ color: latencyMs > 1000 ? "var(--color-warning)" : "var(--color-text-muted)" }}
        >
          {latencyMs}ms
        </span>
      }
    >
      <div data-testid="live-screen" className="contents">
        {/* Session toolbar */}
        <div
          className="h-16 flex items-center gap-4 px-4 md:px-6 border-b"
          style={{
            backgroundColor: "var(--color-surface)",
            borderColor: "var(--color-border-subtle)",
          }}
        >
          <div className="flex-1 min-w-0">
            <div className="text-lg font-bold truncate">{session.title}</div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <RecordingDot active={appState === "recording"} />
            <span
              className="text-sm font-mono tabular-nums"
              style={{ color: "var(--color-text-muted)" }}
            >
              {fmtTs(elapsed)}
            </span>
          </div>
        </div>

        {lowConfWarn && (
          <div
            role="alert"
            className="px-4 md:px-6 py-2 text-sm"
            style={{ backgroundColor: "var(--color-warning-soft)", color: "var(--color-warning)" }}
          >
            마이크 입력 품질이 낮습니다. 마이크 위치와 주변 소음을 확인해주세요.
          </div>
        )}

        {/* Mobile tab bar */}
        <div
          className="md:hidden border-b overflow-x-auto"
          style={{ borderColor: "var(--color-border-subtle)" }}
        >
          <div className="flex px-2">
            {[
              { k: "transcript" as const, label: "자막" },
              { k: "summary" as const, label: "요약" },
              { k: "actions" as const, label: `할 일 ${actionItems.length}` },
              { k: "decisions" as const, label: `결정 ${decisions.length}` },
            ].map((t) => {
              const active = mobileTab === t.k;
              return (
                <button
                  key={t.k}
                  type="button"
                  onClick={() => setMobileTab(t.k)}
                  className="h-11 px-4 text-sm font-medium whitespace-nowrap"
                  style={{
                    color: active ? "var(--color-primary)" : "var(--color-text-muted)",
                    borderBottom: active
                      ? "2px solid var(--color-primary)"
                      : "2px solid transparent",
                  }}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Body */}
        <div
          className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-12 gap-4 px-4 md:px-6 py-4"
          style={{ paddingBottom: "112px" }}
        >
          {/* Transcript panel */}
          <section
            className={`${mobileTab === "transcript" ? "flex" : "hidden"} md:flex md:col-span-7 flex-col rounded-lg min-w-0`}
            style={{
              backgroundColor: "var(--color-surface)",
              border: "1px solid var(--color-border-subtle)",
              height: "calc(100dvh - 260px)",
            }}
          >
            <header
              className="flex items-center justify-between p-4 border-b"
              style={{ borderColor: "var(--color-border-subtle)" }}
            >
              <h2 className="text-base font-bold">실시간 자막</h2>
              <div
                className="inline-flex rounded-md p-1 text-xs"
                style={{ backgroundColor: "var(--color-surface-alt)" }}
              >
                {(["all", "final", "low"] as const).map((v) => {
                  const label = v === "all" ? "전체" : v === "final" ? "확정" : "낮은 신뢰도";
                  const active = filter === v;
                  return (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setFilter(v)}
                      className="h-7 px-2.5 rounded font-medium"
                      style={{
                        backgroundColor: active ? "var(--color-primary-soft)" : "transparent",
                        color: active ? "var(--color-primary)" : "var(--color-text-muted)",
                      }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </header>
            <div
              ref={listRef}
              data-testid="transcript-list"
              className="flex-1 overflow-y-auto px-4"
              aria-live="polite"
              aria-relevant="additions"
            >
              {filtered.length === 0 ? (
                <EmptyState
                  title="자막을 기다리는 중"
                  description="마이크에 말을 하면 실시간 자막이 나타납니다."
                />
              ) : (
                filtered.map((s) => <TranscriptRow key={s.id} segment={s} />)
              )}
            </div>
          </section>

          {/* Insights */}
          <section
            className={`${mobileTab !== "transcript" ? "flex" : "hidden"} md:flex md:col-span-5 flex-col rounded-lg min-w-0`}
            style={{
              backgroundColor: "var(--color-surface)",
              border: "1px solid var(--color-border-subtle)",
              height: "calc(100dvh - 260px)",
            }}
          >
            <div
              className="hidden md:flex border-b"
              style={{ borderColor: "var(--color-border-subtle)" }}
            >
              <TabBtn
                active={activeTab === "summary"}
                onClick={() => setActiveTab("summary")}
                label="요약"
              />
              <TabBtn
                active={activeTab === "actions"}
                onClick={() => setActiveTab("actions")}
                label={`할 일 ${actionItems.length}`}
              />
              <TabBtn
                active={activeTab === "decisions"}
                onClick={() => setActiveTab("decisions")}
                label={`결정사항 ${decisions.length}`}
              />
              <TabBtn
                active={activeTab === "keywords"}
                onClick={() => setActiveTab("keywords")}
                label="키워드"
              />
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {(() => {
                // On mobile, mobileTab drives which pane shows. On desktop, activeTab drives it.
                // When mobileTab === "transcript", the transcript panel is visible and this
                // insights panel is hidden by CSS on mobile; on desktop we always use activeTab.
                const pane: Tab = mobileTab === "transcript" ? activeTab : (mobileTab as Tab);
                if (pane === "summary")
                  return (
                    <SummaryPane
                      summary={currentSummary}
                      manual={session.summaryInterval === "manual"}
                      onRequest={() => adapterRef.current?.requestManualSummary()}
                    />
                  );
                if (pane === "actions") return <ActionsPane items={actionItems} />;
                if (pane === "decisions") return <DecisionsPane items={decisions} />;
                if (pane === "keywords") return <KeywordsPane items={keywords} />;
                return null;
              })()}
            </div>
          </section>
        </div>

        {/* Bottom audio control bar */}
        <div
          className="fixed bottom-0 left-0 right-0 border-t"
          style={{
            backgroundColor: "var(--color-surface)",
            borderColor: "var(--color-border-subtle)",
          }}
        >
          <div className="max-w-[1400px] mx-auto flex items-center gap-4 px-4 md:px-6 py-4">
            <button
              type="button"
              onClick={togglePause}
              aria-label={
                appState === "recording"
                  ? "일시정지"
                  : appState === "paused"
                    ? "다시 시작"
                    : "녹음 상태"
              }
              disabled={appState !== "recording" && appState !== "paused"}
              className="w-14 h-14 rounded-full flex items-center justify-center text-white shrink-0 disabled:opacity-45"
              style={{
                backgroundColor:
                  appState === "paused" ? "var(--color-primary)" : "var(--color-error)",
              }}
            >
              {appState === "recording" ? (
                <Pause className="w-6 h-6" aria-hidden />
              ) : appState === "paused" ? (
                <Play className="w-6 h-6" aria-hidden />
              ) : (
                <Mic className="w-6 h-6" aria-hidden />
              )}
            </button>

            <div className="flex-1 min-w-0 flex flex-col gap-1.5">
              <div
                className="flex items-center gap-3 text-xs"
                style={{ color: "var(--color-text-muted)" }}
              >
                <span>buffer {bufferSeconds.toFixed(1)}s</span>
                {silenceSeconds > 8 && (
                  <span style={{ color: "var(--color-warning)" }}>· 무음 감지 중</span>
                )}
              </div>
              <AudioMeter level={audioLevel} className="w-full md:w-[240px]" />
            </div>

            <button
              type="button"
              data-testid="stop-session-button"
              onClick={() => setConfirmStop(true)}
              disabled={appState === "stopping" || appState === "processing_final"}
              className="h-11 px-4 rounded-md text-sm font-semibold inline-flex items-center gap-2 border shrink-0 disabled:opacity-45"
              style={{ borderColor: "var(--color-error)", color: "var(--color-error)" }}
            >
              <Square className="w-4 h-4" aria-hidden />
              종료
            </button>
          </div>
        </div>

        <SettingsModal
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          devices={devices}
          values={{
            deviceId: session.deviceId,
            language: session.language,
            summaryInterval: session.summaryInterval,
            chunkIntervalMs: session.chunkIntervalMs,
            showLowConfidence: true,
          }}
          onSave={() => {
            toast.info("설정이 저장되었습니다.");
          }}
        />

        <ConfirmModal
          open={confirmStop}
          title="회의를 종료할까요?"
          description="종료 후에는 최종 요약과 회의록을 확인할 수 있습니다."
          confirmLabel="종료하고 결과 보기"
          danger
          onConfirm={doStop}
          onCancel={() => setConfirmStop(false)}
        />
      </div>
    </AppShell>
  );
}

function RecordingDot({ active }: { active: boolean }) {
  return (
    <span
      role="status"
      aria-label={active ? "녹음 중" : "녹음 일시정지"}
      className="inline-flex items-center gap-1.5 text-xs font-medium"
      style={{ color: active ? "var(--color-error)" : "var(--color-text-muted)" }}
    >
      <span
        className={`w-2.5 h-2.5 rounded-full ${active ? "animate-pulse" : ""}`}
        style={{ backgroundColor: active ? "var(--color-error)" : "var(--color-text-subtle)" }}
      />
      {active ? "녹음 중" : "일시정지"}
    </span>
  );
}

function TabBtn({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-12 px-4 text-sm font-medium"
      style={{
        color: active ? "var(--color-primary)" : "var(--color-text-muted)",
        borderBottom: active ? "2px solid var(--color-primary)" : "2px solid transparent",
      }}
    >
      {label}
    </button>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16">
      <div
        className="w-12 h-12 rounded-full flex items-center justify-center mb-3"
        style={{ backgroundColor: "var(--color-surface-alt)" }}
      >
        <Mic className="w-5 h-5" style={{ color: "var(--color-text-muted)" }} aria-hidden />
      </div>
      <p className="text-sm font-medium">{title}</p>
      <p className="text-xs mt-1" style={{ color: "var(--color-text-muted)" }}>
        {description}
      </p>
    </div>
  );
}

function SummaryPane({
  summary,
  manual,
  onRequest,
}: {
  summary?: { bullets: string[]; createdAt: string };
  manual: boolean;
  onRequest: () => void;
}) {
  const time = summary
    ? new Date(summary.createdAt).toLocaleTimeString("ko-KR", { hour12: false })
    : null;
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-base font-bold">현재 요약</h3>
        {manual && (
          <button
            type="button"
            onClick={onRequest}
            className="h-8 px-3 rounded-md border text-xs font-medium inline-flex items-center gap-1.5 bg-white"
            style={{ borderColor: "var(--color-border)" }}
          >
            <RefreshCw className="w-3.5 h-3.5" aria-hidden />
            수동 갱신
          </button>
        )}
      </div>
      {!summary ? (
        <div className="space-y-2" aria-busy="true">
          <div
            className="h-4 rounded animate-pulse"
            style={{ backgroundColor: "var(--color-surface-alt)" }}
          />
          <div
            className="h-4 rounded animate-pulse w-4/5"
            style={{ backgroundColor: "var(--color-surface-alt)" }}
          />
          <div
            className="h-4 rounded animate-pulse w-3/5"
            style={{ backgroundColor: "var(--color-surface-alt)" }}
          />
          <p className="text-xs mt-3" style={{ color: "var(--color-text-subtle)" }}>
            요약을 생성할 음성을 기다리는 중…
          </p>
        </div>
      ) : (
        <>
          <ul className="flex flex-col gap-2">
            {summary.bullets.map((b, i) => (
              <li key={i} className="text-sm leading-relaxed flex gap-2">
                <span style={{ color: "var(--color-primary)" }}>•</span>
                <span>{b}</span>
              </li>
            ))}
          </ul>
          {time && (
            <p className="text-xs mt-4" style={{ color: "var(--color-text-subtle)" }}>
              마지막 갱신 {time}
            </p>
          )}
        </>
      )}
    </div>
  );
}

function ActionsPane({
  items,
}: {
  items: { id: string; text: string; owner?: string; dueDate?: string }[];
}) {
  if (items.length === 0)
    return (
      <EmptyState title="할 일 없음" description="회의에서 액션 아이템이 감지되면 표시됩니다." />
    );
  return (
    <ul className="flex flex-col gap-2">
      {items.map((a) => (
        <li
          key={a.id}
          className="p-3 rounded-md border"
          style={{ borderColor: "var(--color-border-subtle)" }}
        >
          <p className="text-sm font-medium">{a.text}</p>
          <p className="text-xs mt-1" style={{ color: "var(--color-text-muted)" }}>
            {a.owner ?? "담당자 미정"}
            {a.dueDate ? ` · 기한 ${a.dueDate}` : ""}
          </p>
        </li>
      ))}
    </ul>
  );
}

function DecisionsPane({ items }: { items: { id: string; text: string }[] }) {
  if (items.length === 0)
    return <EmptyState title="결정사항 없음" description="확정된 결정이 감지되면 표시됩니다." />;
  return (
    <ul className="flex flex-col gap-2">
      {items.map((d) => (
        <li
          key={d.id}
          className="p-3 rounded-md text-sm"
          style={{
            backgroundColor: "var(--color-primary-soft)",
            color: "var(--color-primary)",
          }}
        >
          {d.text}
        </li>
      ))}
    </ul>
  );
}

function KeywordsPane({ items }: { items: string[] }) {
  if (items.length === 0)
    return <EmptyState title="키워드 없음" description="주요 키워드가 감지되면 표시됩니다." />;
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((k) => (
        <span
          key={k}
          className="inline-flex items-center h-7 px-2.5 rounded-full text-xs font-medium"
          style={{ backgroundColor: "var(--color-surface-alt)", color: "var(--color-text)" }}
        >
          {k}
        </span>
      ))}
    </div>
  );
}
