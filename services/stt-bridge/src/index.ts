import { createServer } from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import { loadConfig } from "./config.js";
import { deriveArtifactsWithGemini } from "./geminiArtifacts.js";
import type { BridgeTranscriptSegment } from "./meetingArtifacts.js";
import { createSpeechRecognizer, type SpeechRecognizer } from "./speechRecognizer.js";
import { SupabaseRepository, type BridgeSession } from "./supabaseRepository.js";
import { parseClientEvent, serverEvent } from "./wire.js";

const config = loadConfig();
const repository = new SupabaseRepository(config.supabaseUrl, config.supabaseServiceRoleKey);
const server = createServer((_req, res) => {
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({ status: "ok", service: "stt-bridge" }));
});
const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", async (req, socket, head) => {
  try {
    const url = new URL(req.url ?? "", `http://${req.headers.host}`);
    const match = url.pathname.match(/^\/sessions\/([^/]+)\/audio$/);
    const token = url.searchParams.get("token");
    if (!match || !token) throw new Error("INVALID_BRIDGE_REQUEST");
    const sessionId = match[1];
    await repository.verifySessionToken(sessionId, token);
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req, sessionId, token);
    });
  } catch {
    socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
    socket.destroy();
  }
});

wss.on("connection", async (ws: WebSocket, _req: unknown, sessionId: string, token: string) => {
  const connectedAt = Date.now();
  let session: BridgeSession;
  let recognizer: SpeechRecognizer | null = null;
  let lastSummaryAt = 0;
  const finalSegments: BridgeTranscriptSegment[] = [];

  const send = (type: string, payload: unknown) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(serverEvent(type, payload));
  };

  const emitError = (code: string, message: string, retryable = false) => {
    send("error", { code, message, retryable, traceId: crypto.randomUUID() });
  };

  const summarize = async (reason: "cycle" | "manual" | "stop") => {
    if (finalSegments.length === 0) return;
    const rangeEndMs = finalSegments.at(-1)?.endMs ?? Date.now() - connectedAt;
    const artifacts = await deriveArtifactsWithGemini({
      apiKey: config.geminiApiKey,
      sessionId,
      rangeEndMs,
      segments: finalSegments,
    });
    await repository.saveArtifacts(sessionId, artifacts);
    send("summary.snapshot", artifacts.summary);
    for (const action of artifacts.actions) send("action_item.detected", action);
    for (const decision of artifacts.decisions) send("decision.detected", decision);
    send("keywords.updated", { keywords: artifacts.keywords, reason });
    lastSummaryAt = Date.now();
  };

  try {
    session = await repository.verifySessionToken(sessionId, token);
    send("status.ready", { sessionId });
    recognizer = createSpeechRecognizer({
      session,
      recognizer: config.googleRecognizer,
      model: config.googleModel,
      useMock: config.useMockStt,
      callbacks: {
        onPartial: async (segment) => {
          await repository.upsertSegment(sessionId, segment);
          send("transcript.partial", segment);
        },
        onFinal: async (segment) => {
          finalSegments.push(segment);
          await repository.upsertSegment(sessionId, segment);
          send("transcript.final", segment);

          const intervalMs =
            session.summaryInterval === "manual"
              ? Number.POSITIVE_INFINITY
              : session.summaryInterval * 1000;
          if (Date.now() - lastSummaryAt >= intervalMs) await summarize("cycle");
        },
        onError: (error) => {
          const failure = classifySttFailure(error);
          emitError("STT_STREAM_FAILED", failure.message, failure.retryable);
          recognizer = null;
          if (ws.readyState === WebSocket.OPEN) {
            ws.close(failure.retryable ? 1012 : 1011, "STT_STREAM_FAILED");
          }
        },
      },
    });
  } catch (error) {
    emitError(
      "BRIDGE_CONNECT_FAILED",
      error instanceof Error ? error.message : "Bridge connection failed",
      false,
    );
    ws.close(1008);
    return;
  }

  ws.on("message", async (data) => {
    try {
      const event = parseClientEvent(data);
      if (event.type === "heartbeat.ping") {
        send("heartbeat.pong", {
          sentAt: event.payload.sentAt,
          receivedAt: new Date().toISOString(),
        });
        send("status.latency", {
          latencyMs: Math.max(0, Date.now() - Date.parse(event.payload.sentAt)),
        });
        return;
      }
      if (event.type === "audio.chunk") {
        recognizer?.pushAudio(Buffer.from(event.payload.data, "base64"), event.payload.durationMs);
        return;
      }
      if (event.type === "summary.request") {
        await summarize("manual");
        return;
      }
      if (event.type === "session.pause" || event.type === "session.resume") {
        return;
      }
      if (event.type === "session.stop") {
        await recognizer?.stop();
        await summarize("stop");
        const endedAt = await repository.completeSession(sessionId);
        send("session.completed", { resultId: sessionId, endedAt });
        ws.close(1000);
      }
    } catch (error) {
      emitError(
        "BRIDGE_MESSAGE_FAILED",
        error instanceof Error ? error.message : "Invalid bridge message",
        true,
      );
    }
  });

  ws.on("close", async () => {
    await recognizer?.stop().catch(() => {});
  });
});

server.listen(config.port, () => {
  console.log(`stt-bridge listening on :${config.port}`);
});

function classifySttFailure(error: Error): { message: string; retryable: boolean } {
  if (/model ".+" does not exist in the location named/i.test(error.message)) {
    return {
      message:
        `${error.message} Set GOOGLE_CLOUD_LOCATION to us or eu when using GOOGLE_SPEECH_MODEL=chirp_3.`,
      retryable: false,
    };
  }
  if (/Cannot call write after a stream was destroyed/i.test(error.message)) {
    return {
      message: "Speech recognition stream closed before audio could be processed.",
      retryable: true,
    };
  }
  return { message: error.message, retryable: true };
}
