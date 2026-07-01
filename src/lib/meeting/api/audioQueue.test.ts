import { describe, expect, it } from "vitest";
import { AudioChunkQueue } from "./audioQueue";

describe("AudioChunkQueue", () => {
  it("drops oldest chunks when buffered duration exceeds the limit", () => {
    const queue = new AudioChunkQueue(1000);

    queue.push({ sequence: 1, durationMs: 500, encoded: "a" });
    queue.push({ sequence: 2, durationMs: 500, encoded: "b" });
    queue.push({ sequence: 3, durationMs: 500, encoded: "c" });

    expect(queue.bufferedMs).toBe(1000);
    expect(queue.droppedCount).toBe(1);
    expect(queue.drain().map((chunk) => chunk.sequence)).toEqual([2, 3]);
  });
});
