import { describe, expect, it } from "vitest";
import {
  parseClientSocketEvent,
  parseServerSocketEvent,
  serializeClientSocketEvent,
} from "./contracts";

describe("meeting socket contracts", () => {
  it("parses transcript final events from the bridge", () => {
    const event = parseServerSocketEvent({
      type: "transcript.final",
      payload: {
        id: "seg-1",
        speakerId: "Speaker 1",
        startMs: 120,
        endMs: 420,
        text: "오늘 회의를 시작합니다.",
        confidence: 0.92,
        state: "final",
      },
    });

    expect(event.type).toBe("transcript.final");
    expect(event.payload.text).toBe("오늘 회의를 시작합니다.");
  });

  it("rejects unknown server event names", () => {
    expect(() =>
      parseServerSocketEvent({
        type: "transcript.done",
        payload: {},
      }),
    ).toThrow(/Unsupported server event/);
  });

  it("serializes and parses audio chunk events", () => {
    const encoded = serializeClientSocketEvent({
      type: "audio.chunk",
      payload: {
        sequence: 7,
        mimeType: "audio/pcm;rate=16000",
        durationMs: 250,
        sampleRate: 16000,
        data: "AAAA",
      },
    });

    const parsed = parseClientSocketEvent(encoded);

    expect(parsed.type).toBe("audio.chunk");
    expect(parsed.payload.sequence).toBe(7);
  });
});
