import { create } from "zustand";
import type {
  ActionItem,
  AppSessionState,
  DecisionItem,
  PermissionState,
  SessionMeta,
  SummarySnapshot,
  TranscriptSegment,
  WebSocketState,
} from "./types";

interface MeetingStore {
  session: SessionMeta | null;
  appState: AppSessionState;
  permission: PermissionState;
  wsState: WebSocketState;
  latencyMs: number;
  segments: TranscriptSegment[];
  summaries: SummarySnapshot[];
  actionItems: ActionItem[];
  decisions: DecisionItem[];
  keywords: string[];
  audioLevel: number; // 0-1
  bufferSeconds: number;
  silenceSeconds: number;
  recordingElapsedMs: number;

  setSession: (s: SessionMeta) => void;
  setAppState: (s: AppSessionState) => void;
  setPermission: (p: PermissionState) => void;
  setWsState: (w: WebSocketState) => void;
  setLatency: (n: number) => void;
  upsertSegment: (seg: TranscriptSegment) => void;
  addSummary: (s: SummarySnapshot) => void;
  addActionItem: (a: ActionItem) => void;
  toggleActionItem: (id: string) => void;
  addDecision: (d: DecisionItem) => void;
  setKeywords: (k: string[]) => void;
  setAudioLevel: (v: number) => void;
  setBufferSeconds: (v: number) => void;
  setSilenceSeconds: (v: number) => void;
  setElapsed: (ms: number) => void;
  reset: () => void;
}

export const useMeetingStore = create<MeetingStore>((set) => ({
  session: null,
  appState: "idle",
  permission: "unknown",
  wsState: "disconnected",
  latencyMs: 0,
  segments: [],
  summaries: [],
  actionItems: [],
  decisions: [],
  keywords: [],
  audioLevel: 0,
  bufferSeconds: 0,
  silenceSeconds: 0,
  recordingElapsedMs: 0,

  setSession: (session) => set({ session }),
  setAppState: (appState) => set({ appState }),
  setPermission: (permission) => set({ permission }),
  setWsState: (wsState) => set({ wsState }),
  setLatency: (latencyMs) => set({ latencyMs }),
  upsertSegment: (seg) =>
    set((state) => {
      const idx = state.segments.findIndex((s) => s.id === seg.id);
      if (idx >= 0) {
        const next = state.segments.slice();
        next[idx] = seg;
        return { segments: next };
      }
      return { segments: [...state.segments, seg] };
    }),
  addSummary: (s) => set((state) => ({ summaries: [...state.summaries, s] })),
  addActionItem: (a) => set((state) => ({ actionItems: [...state.actionItems, a] })),
  toggleActionItem: (id) =>
    set((state) => ({
      actionItems: state.actionItems.map((a) =>
        a.id === id ? { ...a, status: a.status === "open" ? "done" : "open" } : a,
      ),
    })),
  addDecision: (d) => set((state) => ({ decisions: [...state.decisions, d] })),
  setKeywords: (keywords) => set({ keywords }),
  setAudioLevel: (audioLevel) => set({ audioLevel }),
  setBufferSeconds: (bufferSeconds) => set({ bufferSeconds }),
  setSilenceSeconds: (silenceSeconds) => set({ silenceSeconds }),
  setElapsed: (recordingElapsedMs) => set({ recordingElapsedMs }),
  reset: () =>
    set({
      session: null,
      appState: "idle",
      wsState: "disconnected",
      latencyMs: 0,
      segments: [],
      summaries: [],
      actionItems: [],
      decisions: [],
      keywords: [],
      audioLevel: 0,
      bufferSeconds: 0,
      silenceSeconds: 0,
      recordingElapsedMs: 0,
    }),
}));
