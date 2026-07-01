import { describe, expect, it } from "vitest";
import { deriveMeetingArtifacts } from "./meetingArtifacts";

describe("deriveMeetingArtifacts", () => {
  it("derives summary, actions, decisions, and keywords from final transcript text", () => {
    const artifacts = deriveMeetingArtifacts({
      sessionId: "session-1",
      rangeEndMs: 30_000,
      segments: [
        {
          id: "seg-1",
          speakerId: "Speaker 1",
          startMs: 0,
          endMs: 2000,
          text: "API 계약 문서를 금요일까지 작성해주세요.",
          state: "final",
        },
        {
          id: "seg-2",
          speakerId: "Speaker 2",
          startMs: 3000,
          endMs: 5000,
          text: "Google STT와 Gemini를 사용하는 것으로 결정합니다.",
          state: "final",
        },
      ],
    });

    expect(artifacts.summary.bullets.length).toBeGreaterThan(0);
    expect(artifacts.actions[0]?.text).toContain("API 계약");
    expect(artifacts.decisions[0]?.text).toContain("Google STT");
    expect(artifacts.keywords).toContain("Google STT");
  });
});
