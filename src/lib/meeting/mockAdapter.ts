// Mock backend adapter simulating WebSocket transcript / summary events.
// Replace with real WebSocket client when the backend adapter is available.

import type { ActionItem, DecisionItem, SummarySnapshot, TranscriptSegment } from "./types";

const SAMPLE_LINES: { speaker: string; text: string }[] = [
  { speaker: "Speaker 1", text: "안녕하세요, 오늘 회의를 시작하겠습니다." },
  { speaker: "Speaker 2", text: "이번 주 스프린트 진행 상황을 공유드릴게요." },
  { speaker: "Speaker 1", text: "실시간 자막 기능은 프로토타입이 완성됐습니다." },
  { speaker: "Speaker 2", text: "다음 주까지 요약 정확도 개선을 마무리해야 합니다." },
  { speaker: "Speaker 1", text: "김민수 님이 API 문서 초안을 금요일까지 정리해주세요." },
  { speaker: "Speaker 2", text: "배포는 다음 주 화요일 오후 3시로 확정합니다." },
  { speaker: "Speaker 1", text: "지연 시간 관련해서는 인프라 팀과 별도로 논의합시다." },
  { speaker: "Speaker 2", text: "QA 담당자는 이수정 님으로 지정하겠습니다." },
  { speaker: "Speaker 1", text: "이번 릴리스 범위는 실시간 자막과 요약으로 한정합니다." },
  { speaker: "Speaker 2", text: "액션 아이템은 슬랙 채널에도 공유 부탁드립니다." },
];

const ACTION_SEEDS = [
  { text: "API 문서 초안 정리", owner: "김민수", due: "금요일" },
  { text: "요약 정확도 개선 검증", owner: "이수정" },
  { text: "배포 일정 공지", owner: "박지훈", due: "다음 주 화요일" },
];

const DECISION_SEEDS = [
  "배포일은 다음 주 화요일 오후 3시로 확정",
  "이번 릴리스 범위는 실시간 자막과 요약으로 한정",
];

const KEYWORD_SEEDS = ["실시간 자막", "요약", "배포", "API 문서", "QA", "스프린트", "지연시간"];

export interface MockAdapterCallbacks {
  onPartial: (seg: TranscriptSegment) => void;
  onFinal: (seg: TranscriptSegment) => void;
  onSummary: (s: SummarySnapshot) => void;
  onAction: (a: ActionItem) => void;
  onDecision: (d: DecisionItem) => void;
  onKeywords: (k: string[]) => void;
  onLatency: (ms: number) => void;
}

export interface MockAdapterOptions {
  summaryIntervalSec: 30 | 60 | "manual";
}

export class MockAdapter {
  private cbs: MockAdapterCallbacks;
  private opts: MockAdapterOptions;
  private paused = false;
  private stopped = false;
  private startTime = 0;
  private nextLineIdx = 0;
  private lineTimer: ReturnType<typeof setTimeout> | null = null;
  private summaryTimer: ReturnType<typeof setInterval> | null = null;
  private latencyTimer: ReturnType<typeof setInterval> | null = null;
  private allBullets: string[] = [];

  constructor(cbs: MockAdapterCallbacks, opts: MockAdapterOptions) {
    this.cbs = cbs;
    this.opts = opts;
  }

  start() {
    this.startTime = performance.now();
    this.scheduleNextLine(1500);

    if (this.opts.summaryIntervalSec !== "manual") {
      const ms = this.opts.summaryIntervalSec * 1000;
      this.summaryTimer = setInterval(() => this.emitSummary(), ms);
    }

    this.latencyTimer = setInterval(() => {
      const latency = 80 + Math.floor(Math.random() * 200);
      this.cbs.onLatency(latency);
    }, 2000);
  }

  requestManualSummary() {
    this.emitSummary();
  }

  pause() {
    this.paused = true;
  }
  resume() {
    this.paused = false;
    this.scheduleNextLine(800);
  }

  stop() {
    this.stopped = true;
    if (this.lineTimer) clearTimeout(this.lineTimer);
    if (this.summaryTimer) clearInterval(this.summaryTimer);
    if (this.latencyTimer) clearInterval(this.latencyTimer);
    // final summary
    this.emitSummary();
    // final action items / decisions if not yet emitted
    ACTION_SEEDS.forEach((seed, i) => {
      this.cbs.onAction({
        id: `action-final-${i}`,
        text: seed.text,
        owner: seed.owner,
        dueDate: seed.due,
        sourceSegmentIds: [],
        status: "open",
      });
    });
    DECISION_SEEDS.forEach((text, i) => {
      this.cbs.onDecision({
        id: `decision-final-${i}`,
        text,
        sourceSegmentIds: [],
      });
    });
    this.cbs.onKeywords(KEYWORD_SEEDS);
  }

  private scheduleNextLine(delay: number) {
    if (this.stopped) return;
    this.lineTimer = setTimeout(() => this.emitLine(), delay);
  }

  private emitLine() {
    if (this.stopped) return;
    if (this.paused) {
      this.scheduleNextLine(1000);
      return;
    }
    const line = SAMPLE_LINES[this.nextLineIdx % SAMPLE_LINES.length];
    this.nextLineIdx++;
    const id = `seg-${this.nextLineIdx}-${Date.now()}`;
    const startMs = performance.now() - this.startTime;

    // partial: reveal text progressively
    const words = line.text.split(" ");
    let cursor = 0;
    const revealStep = () => {
      if (this.stopped) return;
      cursor = Math.min(words.length, cursor + Math.max(1, Math.ceil(words.length / 4)));
      const partialText = words.slice(0, cursor).join(" ");
      this.cbs.onPartial({
        id,
        speakerId: line.speaker,
        startMs,
        text: partialText,
        state: "partial",
      });
      if (cursor < words.length) {
        setTimeout(revealStep, 50);
      } else {
        // finalize
        setTimeout(() => {
          if (this.stopped) return;
          const confidence = 0.7 + Math.random() * 0.3;
          this.cbs.onFinal({
            id,
            speakerId: line.speaker,
            startMs,
            endMs: performance.now() - this.startTime,
            text: line.text,
            confidence,
            state: confidence < 0.75 ? "low_confidence" : "final",
          });
          this.allBullets.push(line.text);

          // occasionally emit action items / decisions
          if (this.nextLineIdx === 5) {
            this.cbs.onAction({
              id: `action-${Date.now()}`,
              text: "API 문서 초안 정리",
              owner: "김민수",
              dueDate: "금요일",
              sourceSegmentIds: [id],
              status: "open",
            });
          }
          if (this.nextLineIdx === 6) {
            this.cbs.onDecision({
              id: `decision-${Date.now()}`,
              text: "배포일은 다음 주 화요일 오후 3시로 확정",
              sourceSegmentIds: [id],
            });
          }
          this.scheduleNextLine(1500 + Math.random() * 1500);
        }, 300);
      }
    };
    revealStep();
  }

  private emitSummary() {
    const nowMs = performance.now() - this.startTime;
    const recent = this.allBullets.slice(-5);
    if (recent.length === 0) return;
    this.cbs.onSummary({
      id: `sum-${Date.now()}`,
      createdAt: new Date().toISOString(),
      rangeStartMs: 0,
      rangeEndMs: nowMs,
      bullets: recent.map((t) => (t.length > 80 ? t.slice(0, 77) + "..." : t)),
    });
    this.cbs.onKeywords(KEYWORD_SEEDS.slice(0, 5 + Math.floor(Math.random() * 3)));
  }
}
