import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSpeechRecognizer } from "./speechRecognizer";
import type { BridgeSession } from "./supabaseRepository";

const speechMock = vi.hoisted(() => {
  class FakeStreamingRecognize {
    destroyed = false;
    writes: unknown[] = [];
    private readonly listeners = new Map<string, Array<(arg: unknown) => void>>();

    on(event: string, listener: (arg: unknown) => void) {
      this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener]);
      return this;
    }

    write(payload: unknown) {
      if (this.destroyed) throw new Error("Cannot call write after a stream was destroyed");
      this.writes.push(payload);
      return true;
    }

    end() {
      this.destroyed = true;
      this.emit("close");
    }

    fail(error: Error) {
      this.destroyed = true;
      this.emit("error", error);
    }

    destroySilently() {
      this.destroyed = true;
    }

    private emit(event: string, arg?: unknown) {
      for (const listener of this.listeners.get(event) ?? []) listener(arg);
    }
  }

  return {
    FakeStreamingRecognize,
    stream: null as InstanceType<typeof FakeStreamingRecognize> | null,
    clientOptions: [] as unknown[],
  };
});

vi.mock("@google-cloud/speech", () => ({
  v2: {
    SpeechClient: class {
      constructor(options?: unknown) {
        speechMock.clientOptions.push(options);
      }

      _streamingRecognize() {
        if (!speechMock.stream) throw new Error("missing fake speech stream");
        return speechMock.stream;
      }
    },
  },
}));

const session: BridgeSession = {
  id: "session-1",
  title: "Test session",
  language: "ko-KR",
  summaryInterval: 30,
  chunkIntervalMs: 250,
  sessionTokenHash: "hash",
};

describe("GoogleSpeechRecognizer", () => {
  beforeEach(() => {
    speechMock.stream = new speechMock.FakeStreamingRecognize();
    speechMock.clientOptions = [];
  });

  it("uses the regional Speech endpoint from the recognizer location", () => {
    createSpeechRecognizer({
      session,
      recognizer: "projects/test/locations/us/recognizers/test",
      model: "chirp_3",
      useMock: false,
      callbacks: {
        onPartial: vi.fn(),
        onFinal: vi.fn(),
        onError: vi.fn(),
      },
    });

    expect(speechMock.clientOptions[0]).toEqual({ apiEndpoint: "us-speech.googleapis.com" });
  });

  it("requests interim streaming results for live captions", () => {
    createSpeechRecognizer({
      session,
      recognizer: "projects/test/locations/us/recognizers/test",
      model: "chirp_3",
      useMock: false,
      callbacks: {
        onPartial: vi.fn(),
        onFinal: vi.fn(),
        onError: vi.fn(),
      },
    });
    const stream = speechMock.stream;
    if (!stream) throw new Error("missing fake speech stream");

    expect(stream.writes[0]).toMatchObject({
      streamingConfig: {
        streamingFeatures: {
          interimResults: true,
        },
      },
    });
  });

  it("does not write more audio after the Google stream errors and is destroyed", () => {
    const onError = vi.fn();
    const recognizer = createSpeechRecognizer({
      session,
      recognizer: "projects/test/locations/global/recognizers/test",
      model: "chirp_3",
      useMock: false,
      callbacks: {
        onPartial: vi.fn(),
        onFinal: vi.fn(),
        onError,
      },
    });
    const stream = speechMock.stream;
    if (!stream) throw new Error("missing fake speech stream");

    expect(stream.writes).toHaveLength(1);

    stream.fail(new Error("upstream stream closed"));

    expect(() => recognizer.pushAudio(Buffer.from("audio"), 250)).not.toThrow();
    expect(stream.writes).toHaveLength(1);
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: "upstream stream closed" }));
  });

  it("drops audio without surfacing a raw write error when the stream is already destroyed", () => {
    const onError = vi.fn();
    const recognizer = createSpeechRecognizer({
      session,
      recognizer: "projects/test/locations/us/recognizers/test",
      model: "chirp_3",
      useMock: false,
      callbacks: {
        onPartial: vi.fn(),
        onFinal: vi.fn(),
        onError,
      },
    });
    const stream = speechMock.stream;
    if (!stream) throw new Error("missing fake speech stream");

    stream.destroySilently();

    expect(() => recognizer.pushAudio(Buffer.from("audio"), 250)).not.toThrow();
    expect(stream.writes).toHaveLength(1);
    expect(onError).not.toHaveBeenCalled();
  });
});
