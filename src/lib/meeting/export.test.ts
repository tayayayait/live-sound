import { describe, expect, it } from "vitest";
import { toJson, toMarkdown, toText } from "./export";
import type { ExportData } from "./export";

const data: ExportData = {
  session: {
    id: "session-1",
    title: "주간 회의",
    language: "ko-KR",
    summaryInterval: 60,
    chunkIntervalMs: 250,
    startedAt: "2026-07-01T01:00:00.000Z",
    endedAt: "2026-07-01T01:10:00.000Z",
  },
  summaries: [
    {
      id: "sum-1",
      createdAt: "2026-07-01T01:05:00.000Z",
      rangeStartMs: 0,
      rangeEndMs: 300000,
      bullets: ["실시간 자막과 요약 범위를 확정했습니다."],
    },
  ],
  actionItems: [
    {
      id: "action-1",
      text: "API 계약 문서 작성",
      owner: "김민수",
      dueDate: "금요일",
      sourceSegmentIds: ["seg-1"],
      status: "open",
    },
  ],
  decisions: [
    {
      id: "decision-1",
      text: "Google STT와 Gemini를 사용한다.",
      sourceSegmentIds: ["seg-1"],
    },
  ],
  segments: [
    {
      id: "seg-1",
      speakerId: "Speaker 1",
      startMs: 1000,
      endMs: 2500,
      text: "Google STT와 Gemini로 진행하겠습니다.",
      confidence: 0.9,
      state: "final",
    },
  ],
};

describe("meeting export", () => {
  it("includes summary, decisions, actions, and transcript in markdown", () => {
    const markdown = toMarkdown(data);

    expect(markdown).toContain("# 주간 회의");
    expect(markdown).toContain("실시간 자막과 요약 범위를 확정했습니다.");
    expect(markdown).toContain("Google STT와 Gemini를 사용한다.");
    expect(markdown).toContain("- [ ] API 계약 문서 작성");
    expect(markdown).toContain("Google STT와 Gemini로 진행하겠습니다.");
  });

  it("keeps text export limited to summary and transcript", () => {
    const text = toText(data);

    expect(text).toContain("[요약]");
    expect(text).toContain("[전체 자막]");
    expect(text).not.toContain("[결정사항]");
  });

  it("emits final transcript only in json export", () => {
    const json = JSON.parse(toJson(data)) as { transcript: unknown[] };

    expect(json.transcript).toHaveLength(1);
  });
});
