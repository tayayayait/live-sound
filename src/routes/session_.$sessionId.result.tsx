import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Download, FileText, FileJson, FileCode2 } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/meeting/AppShell";
import {
  exportSession,
  getSessionResult,
  isMeetingApiConfigured,
} from "@/lib/meeting/api/httpClient";
import type { SessionResultResponse } from "@/lib/meeting/api/contracts";
import { useMeetingStore } from "@/lib/meeting/store";
import { download, fmtTs } from "@/lib/meeting/export";
import type { SessionMeta } from "@/lib/meeting/types";

export const Route = createFileRoute("/session_/$sessionId/result")({
  head: () => ({
    meta: [
      { title: "회의 결과 · Live Meeting AI" },
      { name: "description", content: "최종 회의록을 검토하고 다운로드합니다." },
    ],
  }),
  component: ResultScreen,
});

type Tab = "transcript" | "actions" | "decisions";

function ResultScreen() {
  const { sessionId } = Route.useParams();
  const navigate = useNavigate();
  const session = useMeetingStore((s) => s.session);
  const segments = useMeetingStore((s) => s.segments);
  const summaries = useMeetingStore((s) => s.summaries);
  const actionItems = useMeetingStore((s) => s.actionItems);
  const decisions = useMeetingStore((s) => s.decisions);
  const toggleActionItem = useMeetingStore((s) => s.toggleActionItem);

  const [tab, setTab] = useState<Tab>("transcript");
  const [query, setQuery] = useState("");
  const [remoteResult, setRemoteResult] = useState<SessionResultResponse | null>(null);
  const [apiConfigured] = useState(isMeetingApiConfigured());

  useEffect(() => {
    if (apiConfigured) {
      getSessionResult(sessionId)
        .then(setRemoteResult)
        .catch((error) => {
          console.error(error);
          toast.error("결과 조회에 실패했습니다.");
          if (!session) navigate({ to: "/" });
        });
      return;
    }
    if (!session || session.id !== sessionId) navigate({ to: "/" });
  }, [apiConfigured, session, sessionId, navigate]);

  const resultSession = remoteResult?.session ?? session;
  const resultSegments = remoteResult?.segments ?? segments;
  const resultSummaries = remoteResult?.summaries ?? summaries;
  const resultActionItems = remoteResult?.actionItems ?? actionItems;
  const resultDecisions = remoteResult?.decisions ?? decisions;

  const endedSession: SessionMeta | null = useMemo(() => {
    if (!resultSession) return null;
    return { ...resultSession, endedAt: resultSession.endedAt ?? new Date().toISOString() };
  }, [resultSession]);

  const finalSegments = useMemo(
    () => resultSegments.filter((s) => s.state !== "partial"),
    [resultSegments],
  );
  const filteredSegments = useMemo(
    () =>
      query.trim()
        ? finalSegments.filter((s) => s.text.toLowerCase().includes(query.toLowerCase()))
        : finalSegments,
    [finalSegments, query],
  );

  const finalSummary = resultSummaries[resultSummaries.length - 1];
  const isEmpty = finalSegments.length === 0;

  if (!endedSession) return null;

  const handleDownload = (format: "md" | "txt" | "json") => {
    if (isEmpty) return;
    void (async () => {
      try {
        if (apiConfigured) {
          const exported = await exportSession(endedSession.id, {
            format,
            include: {
              summary: true,
              decisions: true,
              actionItems: true,
              transcript: true,
            },
          });
          downloadContent(exported.content, exported.filename, exported.mimeType);
        } else {
          download(
            {
              session: endedSession,
              summaries: resultSummaries,
              actionItems: resultActionItems,
              decisions: resultDecisions,
              segments: resultSegments,
            },
            format,
          );
        }
        toast.success(`${format.toUpperCase()} 파일을 다운로드했습니다.`);
      } catch (e) {
        console.error(e);
        toast.error("파일 생성에 실패했습니다.");
      }
    })();
  };

  return (
    <AppShell title={endedSession.title}>
      <div
        data-testid="result-screen"
        className="w-full max-w-[1120px] mx-auto px-4 md:px-6 py-6 md:py-8 pb-32 md:pb-16"
      >
        <header className="mb-6">
          <p className="text-xs font-medium mb-2" style={{ color: "var(--color-primary)" }}>
            회의 완료
          </p>
          <h1 className="text-2xl md:text-[28px] font-bold leading-tight">{endedSession.title}</h1>
          <p className="text-sm mt-1" style={{ color: "var(--color-text-muted)" }}>
            종료 {new Date(endedSession.endedAt!).toLocaleString("ko-KR")} · {finalSegments.length}
            개 자막
          </p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
          <section className="md:col-span-8">
            <Panel title="핵심 요약">
              {isEmpty ? (
                <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
                  분석할 음성이 충분하지 않습니다.
                </p>
              ) : finalSummary && finalSummary.bullets.length > 0 ? (
                <ul className="flex flex-col gap-2">
                  {finalSummary.bullets.slice(0, 5).map((b, i) => (
                    <li key={i} className="text-[15px] leading-relaxed flex gap-2">
                      <span style={{ color: "var(--color-primary)" }}>•</span>
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
                  요약 데이터가 없습니다.
                </p>
              )}
            </Panel>
          </section>

          <aside className="md:col-span-4 flex flex-col gap-4">
            <Panel title="회의 메타">
              <dl className="text-sm grid grid-cols-[80px_1fr] gap-y-2 gap-x-3">
                <dt style={{ color: "var(--color-text-muted)" }}>언어</dt>
                <dd>{endedSession.language}</dd>
                <dt style={{ color: "var(--color-text-muted)" }}>시작</dt>
                <dd>{new Date(endedSession.startedAt).toLocaleString("ko-KR")}</dd>
                <dt style={{ color: "var(--color-text-muted)" }}>결정</dt>
                <dd>{resultDecisions.length}건</dd>
                <dt style={{ color: "var(--color-text-muted)" }}>할 일</dt>
                <dd>{resultActionItems.length}건</dd>
              </dl>
            </Panel>
          </aside>
        </div>

        <div className="mt-8">
          <div className="flex border-b" style={{ borderColor: "var(--color-border-subtle)" }}>
            <TabBtn
              active={tab === "transcript"}
              onClick={() => setTab("transcript")}
              label={`전체 자막 ${finalSegments.length}`}
            />
            <TabBtn
              active={tab === "actions"}
              onClick={() => setTab("actions")}
              label={`할 일 ${resultActionItems.length}`}
            />
            <TabBtn
              active={tab === "decisions"}
              onClick={() => setTab("decisions")}
              label={`결정사항 ${resultDecisions.length}`}
            />
          </div>

          <div className="py-6">
            {tab === "transcript" && (
              <div>
                <input
                  type="search"
                  placeholder="자막 검색"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="w-full h-11 px-3 rounded-md border bg-white mb-4"
                  style={{ borderColor: "var(--color-border)" }}
                  aria-label="자막 검색"
                />
                {filteredSegments.length === 0 ? (
                  <p
                    className="text-sm text-center py-8"
                    style={{ color: "var(--color-text-muted)" }}
                  >
                    {isEmpty ? "자막이 없습니다." : "검색 결과가 없습니다."}
                  </p>
                ) : (
                  <ul className="flex flex-col">
                    {filteredSegments.map((s) => (
                      <li
                        key={s.id}
                        className="grid gap-3 py-3 border-b"
                        style={{
                          gridTemplateColumns: "72px 1fr",
                          borderColor: "var(--color-border-subtle)",
                        }}
                      >
                        <span
                          className="text-xs font-mono tabular-nums pt-1"
                          style={{ color: "var(--color-text-subtle)" }}
                        >
                          {fmtTs(s.startMs)}
                        </span>
                        <div>
                          {s.speakerId && (
                            <span
                              className="text-sm font-semibold mr-2"
                              style={{ color: "var(--color-primary)" }}
                            >
                              {s.speakerId}
                            </span>
                          )}
                          <span className="text-[15px]">{s.text}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {tab === "actions" && (
              <div>
                {resultActionItems.length === 0 ? (
                  <p
                    className="text-sm text-center py-8"
                    style={{ color: "var(--color-text-muted)" }}
                  >
                    할 일이 없습니다.
                  </p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {resultActionItems.map((a) => (
                      <li
                        key={a.id}
                        className="p-3 rounded-md border flex items-start gap-3"
                        style={{ borderColor: "var(--color-border-subtle)" }}
                      >
                        <input
                          type="checkbox"
                          checked={a.status === "done"}
                          onChange={() => toggleActionItem(a.id)}
                          disabled={apiConfigured}
                          className="mt-1 w-4 h-4"
                          aria-label={`${a.text} 완료 표시`}
                        />
                        <div className="flex-1">
                          <p
                            className="text-sm font-medium"
                            style={{
                              textDecoration: a.status === "done" ? "line-through" : "none",
                              color:
                                a.status === "done"
                                  ? "var(--color-text-muted)"
                                  : "var(--color-text)",
                            }}
                          >
                            {a.text}
                          </p>
                          <p className="text-xs mt-1" style={{ color: "var(--color-text-muted)" }}>
                            {a.owner ?? "담당자 미정"}
                            {a.dueDate ? ` · 기한 ${a.dueDate}` : ""}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {tab === "decisions" && (
              <div>
                {resultDecisions.length === 0 ? (
                  <p
                    className="text-sm text-center py-8"
                    style={{ color: "var(--color-text-muted)" }}
                  >
                    결정사항이 없습니다.
                  </p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {resultDecisions.map((d) => (
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
                )}
              </div>
            )}
          </div>
        </div>

        <div className="mt-8 flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
          <div className="flex flex-wrap gap-2">
            <ExportBtn
              icon={<FileText className="w-4 h-4" />}
              label="Markdown"
              testId="export-md-button"
              onClick={() => handleDownload("md")}
              disabled={isEmpty}
            />
            <ExportBtn
              icon={<FileCode2 className="w-4 h-4" />}
              label="Text"
              testId="export-txt-button"
              onClick={() => handleDownload("txt")}
              disabled={isEmpty}
            />
            <ExportBtn
              icon={<FileJson className="w-4 h-4" />}
              label="JSON"
              testId="export-json-button"
              onClick={() => handleDownload("json")}
              disabled={isEmpty}
            />
          </div>
          <Link
            to="/"
            className="inline-flex items-center justify-center h-11 px-4 rounded-md text-sm font-semibold"
            style={{ backgroundColor: "var(--color-primary)", color: "white" }}
          >
            새 회의 시작
          </Link>
        </div>
      </div>
    </AppShell>
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

function ExportBtn({
  icon,
  label,
  testId,
  onClick,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  testId?: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      disabled={disabled}
      className="h-11 px-4 rounded-md border text-sm font-medium inline-flex items-center gap-2 bg-white disabled:opacity-45"
      style={{ borderColor: "var(--color-border)" }}
    >
      <Download className="w-4 h-4" aria-hidden />
      {icon}
      {label}
    </button>
  );
}

function downloadContent(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
