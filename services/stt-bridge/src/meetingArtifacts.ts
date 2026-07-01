export interface BridgeTranscriptSegment {
  id: string;
  speakerId?: string;
  startMs: number;
  endMs?: number;
  text: string;
  confidence?: number;
  state: "partial" | "final" | "corrected" | "low_confidence";
}

export interface DerivedMeetingArtifacts {
  summary: {
    id: string;
    createdAt: string;
    rangeStartMs: number;
    rangeEndMs: number;
    bullets: string[];
  };
  actions: {
    id: string;
    text: string;
    owner?: string;
    dueDate?: string;
    sourceSegmentIds: string[];
    status: "open";
  }[];
  decisions: {
    id: string;
    text: string;
    sourceSegmentIds: string[];
  }[];
  keywords: string[];
}

export function deriveMeetingArtifacts({
  sessionId,
  rangeEndMs,
  segments,
}: {
  sessionId: string;
  rangeEndMs: number;
  segments: BridgeTranscriptSegment[];
}): DerivedMeetingArtifacts {
  const finalSegments = segments.filter(
    (segment) => segment.state !== "partial" && segment.text.trim(),
  );
  const recent = finalSegments.slice(-5);
  const now = new Date().toISOString();

  const actions = finalSegments
    .filter((segment) => /해주세요|해야|작성|정리|공유|검토|마무리/.test(segment.text))
    .slice(-5)
    .map((segment, index) => ({
      id: `action-${sessionId}-${segment.id}-${index}`,
      text: trimSentence(segment.text),
      owner: extractOwner(segment.text),
      dueDate: extractDueDate(segment.text),
      sourceSegmentIds: [segment.id],
      status: "open" as const,
    }));

  const decisions = finalSegments
    .filter((segment) => /결정|확정|사용한다|진행하겠습니다|진행합니다/.test(segment.text))
    .slice(-5)
    .map((segment, index) => ({
      id: `decision-${sessionId}-${segment.id}-${index}`,
      text: trimSentence(segment.text),
      sourceSegmentIds: [segment.id],
    }));

  return {
    summary: {
      id: `sum-${sessionId}-${Date.now()}`,
      createdAt: now,
      rangeStartMs: 0,
      rangeEndMs,
      bullets: recent.length
        ? recent.map((segment) => trimSentence(segment.text)).slice(0, 5)
        : ["요약할 확정 자막이 아직 없습니다."],
    },
    actions,
    decisions,
    keywords: extractKeywords(finalSegments.map((segment) => segment.text).join(" ")),
  };
}

function trimSentence(text: string): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  return normalized.length > 80 ? `${normalized.slice(0, 77)}...` : normalized;
}

function extractOwner(text: string): string | undefined {
  const match = text.match(/([가-힣A-Za-z]{2,12})\s*(님|씨|담당자)/);
  return match?.[1];
}

function extractDueDate(text: string): string | undefined {
  const match = text.match(
    /(오늘|내일|이번 주|다음 주|월요일|화요일|수요일|목요일|금요일|토요일|일요일|[0-9]{1,2}월\s*[0-9]{1,2}일)까지?/,
  );
  return match?.[1];
}

function extractKeywords(text: string): string[] {
  const candidates = [
    "Google STT",
    "Gemini",
    "Supabase",
    "Cloud Run",
    "API 계약",
    "실시간 자막",
    "요약",
    "액션아이템",
    "결정사항",
  ];
  return candidates.filter((keyword) => text.includes(keyword)).slice(0, 20);
}
