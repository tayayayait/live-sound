export interface QueuedAudioChunk {
  sequence: number;
  durationMs: number;
  encoded: string;
}

export class AudioChunkQueue {
  private chunks: QueuedAudioChunk[] = [];
  private totalMs = 0;
  private drops = 0;

  constructor(private readonly maxBufferedMs = 10_000) {}

  get bufferedMs(): number {
    return this.totalMs;
  }

  get bufferedSeconds(): number {
    return this.totalMs / 1000;
  }

  get droppedCount(): number {
    return this.drops;
  }

  get length(): number {
    return this.chunks.length;
  }

  push(chunk: QueuedAudioChunk): void {
    this.chunks.push(chunk);
    this.totalMs += chunk.durationMs;
    while (this.totalMs > this.maxBufferedMs && this.chunks.length > 0) {
      const dropped = this.chunks.shift();
      if (!dropped) break;
      this.totalMs -= dropped.durationMs;
      this.drops += 1;
    }
  }

  drain(): QueuedAudioChunk[] {
    const drained = this.chunks;
    this.chunks = [];
    this.totalMs = 0;
    return drained;
  }

  clear(): void {
    this.chunks = [];
    this.totalMs = 0;
  }
}
