import type { AudioChunkPayload } from "./contracts";

export interface AudioWorkletRecorder {
  stop: () => void;
}

const PROCESSOR_CODE = `
class MeetingPcmProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0]?.[0];
    if (input) this.port.postMessage(input.slice(0));
    return true;
  }
}
registerProcessor("meeting-pcm-processor", MeetingPcmProcessor);
`;

export async function startAudioWorkletRecorder({
  stream,
  chunkIntervalMs,
  onChunk,
}: {
  stream: MediaStream;
  chunkIntervalMs: number;
  onChunk: (payload: AudioChunkPayload) => void;
}): Promise<AudioWorkletRecorder> {
  const audioContext = new AudioContext();
  const source = audioContext.createMediaStreamSource(stream);
  const processorUrl = URL.createObjectURL(new Blob([PROCESSOR_CODE], { type: "text/javascript" }));
  await audioContext.audioWorklet.addModule(processorUrl);
  URL.revokeObjectURL(processorUrl);

  const node = new AudioWorkletNode(audioContext, "meeting-pcm-processor");
  const targetSampleRate = 16000;
  const samplesPerChunk = Math.round((targetSampleRate * chunkIntervalMs) / 1000);
  let sequence = 0;
  let pending: number[] = [];

  node.port.onmessage = (event: MessageEvent<Float32Array>) => {
    const downsampled = downsample(event.data, audioContext.sampleRate, targetSampleRate);
    pending.push(...downsampled);
    while (pending.length >= samplesPerChunk) {
      const chunk = pending.slice(0, samplesPerChunk);
      pending = pending.slice(samplesPerChunk);
      onChunk({
        sequence: sequence++,
        mimeType: "audio/pcm;rate=16000",
        durationMs: chunkIntervalMs,
        sampleRate: targetSampleRate,
        data: pcm16ToBase64(chunk),
      });
    }
  };

  source.connect(node);
  node.connect(audioContext.destination);

  return {
    stop: () => {
      node.disconnect();
      source.disconnect();
      audioContext.close().catch(() => {});
    },
  };
}

function downsample(input: Float32Array, sourceRate: number, targetRate: number): number[] {
  if (sourceRate === targetRate) return Array.from(input);
  const ratio = sourceRate / targetRate;
  const length = Math.floor(input.length / ratio);
  const output = new Array<number>(length);
  for (let i = 0; i < length; i += 1) {
    output[i] = input[Math.floor(i * ratio)] ?? 0;
  }
  return output;
}

function pcm16ToBase64(samples: number[]): string {
  const buffer = new ArrayBuffer(samples.length * 2);
  const view = new DataView(buffer);
  samples.forEach((sample, index) => {
    const clamped = Math.max(-1, Math.min(1, sample));
    view.setInt16(index * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
  });
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}
