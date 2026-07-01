import type { BridgeTranscriptSegment, DerivedMeetingArtifacts } from "./meetingArtifacts.js";
import { deriveMeetingArtifacts } from "./meetingArtifacts.js";

export async function deriveArtifactsWithGemini({
  apiKey,
  sessionId,
  rangeEndMs,
  segments,
}: {
  apiKey?: string;
  sessionId: string;
  rangeEndMs: number;
  segments: BridgeTranscriptSegment[];
}): Promise<DerivedMeetingArtifacts> {
  if (!apiKey) return deriveMeetingArtifacts({ sessionId, rangeEndMs, segments });

  const transcript = segments
    .filter((segment) => segment.state !== "partial")
    .map((segment) => `${segment.speakerId ?? "Speaker"}: ${segment.text}`)
    .join("\n");
  if (!transcript.trim()) return deriveMeetingArtifacts({ sessionId, rangeEndMs, segments });

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                {
                  text:
                    "다음 회의 자막에서 JSON만 반환하세요. schema: {summaryBullets:string[], actions:{text:string,owner?:string,dueDate?:string,sourceSegmentIds:string[]}[], decisions:{text:string,sourceSegmentIds:string[]}[], keywords:string[]}. " +
                    "각 summary bullet은 80자 이하, actions와 decisions는 근거가 되는 segment id를 넣으세요. " +
                    "반드시 제공된 자막 내용만을 바탕으로 요약해야 하며, 자막이 너무 짧거나 일상적인 인사말뿐이어서 요약할 내용이 없다면 상상해서 지어내지 말고 빈 배열을 반환하거나 '아직 요약할 충분한 대화가 없습니다.'라고 작성하세요.\n\n" +
                    segments
                      .filter((segment) => segment.state !== "partial")
                      .map(
                        (segment) =>
                          `[${segment.id}] ${segment.speakerId ?? "Speaker"}: ${segment.text}`,
                      )
                      .join("\n"),
                },
              ],
            },
          ],
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.2,
          },
        }),
      },
    );
    if (!response.ok) throw new Error(`Gemini request failed: ${response.status}`);
    const body = (await response.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text = body.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error("Gemini response is empty");
    const parsed = JSON.parse(text) as {
      summaryBullets?: string[];
      actions?: { text: string; owner?: string; dueDate?: string; sourceSegmentIds?: string[] }[];
      decisions?: { text: string; sourceSegmentIds?: string[] }[];
      keywords?: string[];
    };

    return {
      summary: {
        id: `sum-${sessionId}-${Date.now()}`,
        createdAt: new Date().toISOString(),
        rangeStartMs: 0,
        rangeEndMs,
        bullets: (parsed.summaryBullets ?? []).slice(0, 7),
      },
      actions: (parsed.actions ?? []).map((action, index) => ({
        id: `action-${sessionId}-${Date.now()}-${index}`,
        text: action.text,
        owner: action.owner,
        dueDate: action.dueDate,
        sourceSegmentIds: action.sourceSegmentIds ?? [],
        status: "open",
      })),
      decisions: (parsed.decisions ?? []).map((decision, index) => ({
        id: `decision-${sessionId}-${Date.now()}-${index}`,
        text: decision.text,
        sourceSegmentIds: decision.sourceSegmentIds ?? [],
      })),
      keywords: (parsed.keywords ?? []).slice(0, 20),
    };
  } catch {
    return deriveMeetingArtifacts({ sessionId, rangeEndMs, segments });
  }
}
