export interface AudioSession {
  stream: MediaStream;
  audioContext: AudioContext;
  analyser: AnalyserNode;
  stop: () => void;
}

export function isBrowserSupported(): boolean {
  if (typeof window === "undefined") return true;
  return !!(
    navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === "function" &&
    (typeof window.MediaRecorder !== "undefined" || typeof window.AudioContext !== "undefined")
  );
}

export async function listInputDevices(): Promise<MediaDeviceInfo[]> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices) return [];
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices.filter((d) => d.kind === "audioinput");
}

export async function requestMic(deviceId?: string): Promise<AudioSession> {
  const constraints: MediaStreamConstraints = {
    audio: deviceId
      ? { deviceId: { exact: deviceId }, echoCancellation: true, noiseSuppression: true }
      : { echoCancellation: true, noiseSuppression: true },
  };
  const stream = await navigator.mediaDevices.getUserMedia(constraints);
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const audioContext = new AudioCtx();
  const source = audioContext.createMediaStreamSource(stream);
  const analyser = audioContext.createAnalyser();
  analyser.fftSize = 512;
  source.connect(analyser);

  const stop = () => {
    stream.getTracks().forEach((t) => t.stop());
    audioContext.close().catch(() => {});
  };
  return { stream, audioContext, analyser, stop };
}

export function readLevel(analyser: AnalyserNode): number {
  const data = new Uint8Array(analyser.fftSize);
  analyser.getByteTimeDomainData(data);
  let sumSq = 0;
  for (let i = 0; i < data.length; i++) {
    const v = (data[i] - 128) / 128;
    sumSq += v * v;
  }
  const rms = Math.sqrt(sumSq / data.length);
  return Math.min(1, rms * 3);
}
