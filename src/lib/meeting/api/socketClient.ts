import { AudioChunkQueue } from "./audioQueue";
import {
  parseServerSocketEvent,
  serializeClientSocketEvent,
  type AudioChunkPayload,
  type ClientSocketEvent,
  type ServerSocketEvent,
} from "./contracts";

export interface MeetingSocketCallbacks {
  onEvent: (event: ServerSocketEvent) => void;
  onStateChange?: (
    state: "connecting" | "connected" | "reconnecting" | "failed" | "closed",
  ) => void;
  onBufferChange?: (seconds: number, droppedCount: number) => void;
}

export class MeetingSocketClient {
  private socket: WebSocket | null = null;
  private retryIndex = 0;
  private closedByClient = false;
  private heartbeatId: number | null = null;
  private readonly queue = new AudioChunkQueue(10_000);
  private readonly retryDelays = [1000, 2000, 4000];

  constructor(
    private readonly wsUrl: string,
    private readonly callbacks: MeetingSocketCallbacks,
  ) {}

  connect(): void {
    this.closedByClient = false;
    this.callbacks.onStateChange?.(this.retryIndex > 0 ? "reconnecting" : "connecting");
    this.socket = new WebSocket(this.wsUrl);
    this.socket.onopen = () => {
      this.retryIndex = 0;
      this.callbacks.onStateChange?.("connected");
      this.flushQueue();
      this.startHeartbeat();
    };
    this.socket.onmessage = (message) => {
      try {
        this.callbacks.onEvent(parseServerSocketEvent(JSON.parse(String(message.data))));
      } catch (error) {
        this.callbacks.onEvent({
          type: "error",
          payload: {
            code: "SOCKET_EVENT_PARSE_FAILED",
            message: error instanceof Error ? error.message : "서버 이벤트를 해석하지 못했습니다.",
            retryable: true,
          },
        });
      }
    };
    this.socket.onclose = (event) => {
      this.stopHeartbeat();
      if (this.closedByClient) {
        this.callbacks.onStateChange?.("closed");
        return;
      }
      if (event.code === 1008 || event.code === 1011) {
        this.callbacks.onStateChange?.("failed");
        return;
      }
      this.reconnect();
    };
    this.socket.onerror = () => {
      this.callbacks.onEvent({
        type: "error",
        payload: {
          code: "WS_CONNECT_FAILED",
          message: "실시간 연결에 실패했습니다.",
          retryable: true,
        },
      });
    };
  }

  sendAudioChunk(payload: AudioChunkPayload): void {
    const encoded = serializeClientSocketEvent({ type: "audio.chunk", payload });
    if (this.isOpen()) {
      this.socket?.send(encoded);
      return;
    }
    this.queue.push({
      sequence: payload.sequence,
      durationMs: payload.durationMs,
      encoded,
    });
    this.callbacks.onBufferChange?.(this.queue.bufferedSeconds, this.queue.droppedCount);
  }

  pause(): void {
    this.sendControl("session.pause", { at: new Date().toISOString() });
  }

  resume(): void {
    this.sendControl("session.resume", { at: new Date().toISOString() });
  }

  requestSummary(): void {
    this.sendControl("summary.request", { reason: "manual" });
  }

  stop(): void {
    this.sendControl("session.stop", { at: new Date().toISOString() });
  }

  close(): void {
    this.closedByClient = true;
    this.stopHeartbeat();
    this.socket?.close();
  }

  private flushQueue(): void {
    for (const chunk of this.queue.drain()) {
      this.socket?.send(chunk.encoded);
    }
    this.callbacks.onBufferChange?.(0, this.queue.droppedCount);
  }

  private sendControl(
    type: ClientSocketEvent["type"],
    payload: ClientSocketEvent["payload"],
  ): void {
    if (!this.isOpen()) return;
    this.socket?.send(serializeClientSocketEvent({ type, payload } as ClientSocketEvent));
  }

  private reconnect(): void {
    if (this.retryIndex >= this.retryDelays.length) {
      this.callbacks.onStateChange?.("failed");
      this.callbacks.onEvent({
        type: "error",
        payload: {
          code: "WS_RECONNECT_FAILED",
          message: "연결을 복구하지 못했습니다.",
          retryable: false,
        },
      });
      return;
    }
    const delay = this.retryDelays[this.retryIndex++];
    this.callbacks.onStateChange?.("reconnecting");
    window.setTimeout(() => this.connect(), delay);
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatId = window.setInterval(() => {
      this.sendControl("heartbeat.ping", { sentAt: new Date().toISOString() });
    }, 5000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatId) window.clearInterval(this.heartbeatId);
    this.heartbeatId = null;
  }

  private isOpen(): boolean {
    return this.socket?.readyState === WebSocket.OPEN;
  }
}
