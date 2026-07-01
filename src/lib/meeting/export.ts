import type {
  ActionItem,
  DecisionItem,
  SessionMeta,
  SummarySnapshot,
  TranscriptSegment,
} from "./types";

export interface ExportData {
  session: SessionMeta;
  summaries: SummarySnapshot[];
  actionItems: ActionItem[];
  decisions: DecisionItem[];
  segments: TranscriptSegment[];
}

function fmtTs(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

function filename(session: SessionMeta, ext: string): string {
  const d = new Date(session.startedAt);
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
  return `meeting-summary-${stamp}.${ext}`;
}

export function toMarkdown(data: ExportData): string {
  const { session, summaries, actionItems, decisions, segments } = data;
  const finalSummary = summaries[summaries.length - 1];
  const lines: string[] = [];
  lines.push(`# ${session.title}`);
  lines.push("");
  lines.push(`- 시작: ${session.startedAt}`);
  if (session.endedAt) lines.push(`- 종료: ${session.endedAt}`);
  lines.push(`- 언어: ${session.language}`);
  lines.push("");
  lines.push("## 핵심 요약");
  if (finalSummary && finalSummary.bullets.length > 0) {
    finalSummary.bullets.forEach((b) => lines.push(`- ${b}`));
  } else {
    lines.push("- 분석할 음성이 충분하지 않습니다.");
  }
  lines.push("");
  lines.push("## 결정사항");
  if (decisions.length > 0) decisions.forEach((d) => lines.push(`- ${d.text}`));
  else lines.push("- 없음");
  lines.push("");
  lines.push("## 할 일");
  if (actionItems.length > 0) {
    actionItems.forEach((a) => {
      const check = a.status === "done" ? "x" : " ";
      const owner = a.owner ? ` (${a.owner}${a.dueDate ? `, ${a.dueDate}` : ""})` : "";
      lines.push(`- [${check}] ${a.text}${owner}`);
    });
  } else {
    lines.push("- 없음");
  }
  lines.push("");
  lines.push("## 전체 자막");
  segments
    .filter((s) => s.state !== "partial")
    .forEach((s) => {
      lines.push(`- \`${fmtTs(s.startMs)}\` **${s.speakerId ?? ""}**: ${s.text}`);
    });
  return lines.join("\n");
}

export function toText(data: ExportData): string {
  const { session, summaries, segments } = data;
  const finalSummary = summaries[summaries.length - 1];
  const lines: string[] = [];
  lines.push(session.title);
  lines.push("=".repeat(session.title.length));
  lines.push("");
  lines.push("[요약]");
  if (finalSummary) finalSummary.bullets.forEach((b) => lines.push(`- ${b}`));
  else lines.push("- 없음");
  lines.push("");
  lines.push("[전체 자막]");
  segments
    .filter((s) => s.state !== "partial")
    .forEach((s) => {
      lines.push(`${fmtTs(s.startMs)} ${s.speakerId ?? ""}: ${s.text}`);
    });
  return lines.join("\n");
}

export function toJson(data: ExportData): string {
  return JSON.stringify(
    {
      session: data.session,
      transcript: data.segments.filter((s) => s.state !== "partial"),
      summaries: data.summaries,
      actionItems: data.actionItems,
      decisions: data.decisions,
    },
    null,
    2,
  );
}

export function download(data: ExportData, format: "md" | "txt" | "json") {
  let content = "";
  let mime = "text/plain";
  if (format === "md") {
    content = toMarkdown(data);
    mime = "text/markdown";
  } else if (format === "txt") {
    content = toText(data);
  } else {
    content = toJson(data);
    mime = "application/json";
  }
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename(data.session, format);
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export { fmtTs };
