import { z } from "zod";

export const audioChunkSchema = z.object({
  sequence: z.number().int().nonnegative(),
  mimeType: z.string(),
  durationMs: z.number().positive(),
  sampleRate: z.number().int().positive(),
  data: z.string().min(1),
});

const clientEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("audio.chunk"), payload: audioChunkSchema }),
  z.object({ type: z.literal("session.pause"), payload: z.object({ at: z.string() }) }),
  z.object({ type: z.literal("session.resume"), payload: z.object({ at: z.string() }) }),
  z.object({ type: z.literal("session.stop"), payload: z.object({ at: z.string() }) }),
  z.object({
    type: z.literal("summary.request"),
    payload: z.object({ reason: z.literal("manual") }),
  }),
  z.object({ type: z.literal("heartbeat.ping"), payload: z.object({ sentAt: z.string() }) }),
]);

export type ClientEvent = z.infer<typeof clientEventSchema>;

export function parseClientEvent(data: unknown): ClientEvent {
  const raw = typeof data === "string" ? JSON.parse(data) : JSON.parse(data?.toString?.() ?? "{}");
  return clientEventSchema.parse(raw);
}

export function serverEvent(type: string, payload: unknown): string {
  return JSON.stringify({ type, payload });
}
