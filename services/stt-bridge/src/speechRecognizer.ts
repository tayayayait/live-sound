import { v2 as speechV2 } from "@google-cloud/speech";
import type { BridgeTranscriptSegment } from "./meetingArtifacts.js";
import type { BridgeSession } from "./supabaseRepository.js";

export interface SpeechRecognizer {
  pushAudio(chunk: Buffer, durationMs: number): void;
  stop(): Promise<void>;
}

export interface RecognizerCallbacks {
  onPartial: (segment: BridgeTranscriptSegment) => Promise<void> | void;
  onFinal: (segment: BridgeTranscriptSegment) => Promise<void> | void;
  onError: (error: Error) => Promise<void> | void;
}

export function createSpeechRecognizer({
  session,
  recognizer,
  model = "chirp_3",
  useMock,
  callbacks,
}: {
  session: BridgeSession;
  recognizer: string;
  model?: string;
  useMock: boolean;
  callbacks: RecognizerCallbacks;
}): SpeechRecognizer {
  if (useMock) return new MockSpeechRecognizer(session, callbacks);
  return new GoogleSpeechRecognizer(session, recognizer, model, callbacks);
}

class MockSpeechRecognizer implements SpeechRecognizer {
  private sequence = 0;
  private elapsedMs = 0;
  private stopped = false;
  private readonly sampleLines = [
    "안녕하세요, 오늘 회의를 시작하겠습니다.",
    "Google STT와 Gemini를 사용하는 것으로 결정합니다.",
    "API 계약 문서를 금요일까지 작성해주세요.",
    "Supabase에는 세션과 결과를 저장하겠습니다.",
  ];

  constructor(
    private readonly session: BridgeSession,
    private readonly callbacks: RecognizerCallbacks,
  ) {}

  pushAudio(_chunk: Buffer, durationMs: number): void {
    if (this.stopped) return;
    this.elapsedMs += durationMs;
    if (this.sequence % 8 !== 0) {
      this.sequence += 1;
      return;
    }

    const text = this.sampleLines[(this.sequence / 8) % this.sampleLines.length];
    const id = `mock-${this.session.id}-${this.sequence}`;
    void this.callbacks.onPartial({
      id,
      speakerId: "Speaker 1",
      startMs: Math.max(0, this.elapsedMs - durationMs),
      text: text.slice(0, Math.max(6, Math.floor(text.length / 2))),
      state: "partial",
    });
    void this.callbacks.onFinal({
      id,
      speakerId: "Speaker 1",
      startMs: Math.max(0, this.elapsedMs - durationMs),
      endMs: this.elapsedMs,
      text,
      confidence: 0.92,
      state: "final",
    });
    this.sequence += 1;
  }

  async stop(): Promise<void> {
    this.stopped = true;
  }
}

class GoogleSpeechRecognizer implements SpeechRecognizer {
  private readonly client: speechV2.SpeechClient;
  private readonly stream: ReturnType<speechV2.SpeechClient["_streamingRecognize"]>;
  private stopped = false;
  private errorNotified = false;
  private elapsedMs = 0;
  private segmentIndex = 0;

  constructor(
    private readonly session: BridgeSession,
    private readonly recognizer: string,
    private readonly model: string,
    private readonly callbacks: RecognizerCallbacks,
  ) {
    this.client = new speechV2.SpeechClient(speechClientOptionsForRecognizer(recognizer));
    this.stream = this.client._streamingRecognize();
    this.stream.on("data", (response) => {
      void this.handleResponse(response);
    });
    this.stream.on("error", (error) => {
      this.fail(error);
    });
    this.stream.on("close", () => {
      this.stopped = true;
    });
    this.writeOrFail({
      recognizer: this.recognizer,
      streamingConfig: {
        config: {
          explicitDecodingConfig: {
            encoding: "LINEAR16",
            sampleRateHertz: 16000,
            audioChannelCount: 1,
          },
          languageCodes: [this.session.language],
          model: this.model,
          features: {
            enableAutomaticPunctuation: true,
          },
        },
        streamingFeatures: {
          interimResults: true,
        },
      },
    });
  }

  pushAudio(chunk: Buffer, durationMs: number): void {
    if (this.isStreamClosed()) {
      this.stopped = true;
      return;
    }
    this.elapsedMs += durationMs;
    this.writeOrFail({ audio: chunk });
  }

  async stop(): Promise<void> {
    if (this.isStreamClosed()) {
      this.stopped = true;
      return;
    }
    this.stopped = true;
    this.stream.end();
  }

  private writeOrFail(payload: unknown): void {
    if (this.isStreamClosed()) {
      this.stopped = true;
      return;
    }
    try {
      this.stream.write(payload);
    } catch (error) {
      this.fail(error);
    }
  }

  private fail(error: unknown): void {
    this.stopped = true;
    if (this.errorNotified) return;
    this.errorNotified = true;
    void this.callbacks.onError(error instanceof Error ? error : new Error(String(error)));
  }

  private isStreamClosed(): boolean {
    const stream = this.stream as unknown as {
      closed?: boolean;
      destroyed?: boolean;
      writableDestroyed?: boolean;
      writableEnded?: boolean;
    };
    return Boolean(
      this.stopped ||
        stream.closed ||
        stream.destroyed ||
        stream.writableDestroyed ||
        stream.writableEnded,
    );
  }

  private async handleResponse(response: {
    results?: {
      alternatives?: { transcript?: string; confidence?: number }[];
      isFinal?: boolean;
      languageCode?: string;
    }[];
  }) {
    for (const result of response.results ?? []) {
      const alt = result.alternatives?.[0];
      if (!alt?.transcript) continue;
      const id = `gcp-${this.session.id}-${this.segmentIndex}`;
      const segment: BridgeTranscriptSegment = {
        id,
        speakerId: result.languageCode ? "Speaker 1" : undefined,
        startMs: Math.max(0, this.elapsedMs - 1000),
        endMs: result.isFinal ? this.elapsedMs : undefined,
        text: alt.transcript,
        confidence: alt.confidence,
        state: result.isFinal ? "final" : "partial",
      };
      if (result.isFinal) {
        this.segmentIndex += 1;
        await this.callbacks.onFinal(segment);
      } else {
        await this.callbacks.onPartial(segment);
      }
    }
  }
}

function speechClientOptionsForRecognizer(recognizer: string) {
  const location = recognizer.match(/\/locations\/([^/]+)\//)?.[1];
  if (!location || location === "global") return undefined;
  return { apiEndpoint: `${location}-speech.googleapis.com` };
}
