import { createHash } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { BridgeTranscriptSegment, DerivedMeetingArtifacts } from "./meetingArtifacts.js";

export interface BridgeSession {
  id: string;
  title: string;
  language: "ko-KR" | "en-US" | "ja-JP";
  summaryInterval: 30 | 60 | "manual";
  chunkIntervalMs: number;
  sessionTokenHash: string;
}

export class SupabaseRepository {
  private readonly client: SupabaseClient;

  constructor(url: string, serviceRoleKey: string) {
    this.client = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  async verifySessionToken(sessionId: string, token: string): Promise<BridgeSession> {
    const { data, error } = await this.client
      .from("meeting_sessions")
      .select("*")
      .eq("id", sessionId)
      .single();
    if (error || !data) throw new Error("SESSION_NOT_FOUND");

    const expected = String(data.session_token_hash);
    if (sha256(token) !== expected) throw new Error("INVALID_SESSION_TOKEN");

    await this.client.from("meeting_sessions").update({ status: "recording" }).eq("id", sessionId);

    return {
      id: String(data.id),
      title: String(data.title),
      language: data.language as BridgeSession["language"],
      summaryInterval:
        data.summary_interval === "manual"
          ? "manual"
          : Number(data.summary_interval) === 30
            ? 30
            : 60,
      chunkIntervalMs: Number(data.chunk_interval_ms),
      sessionTokenHash: expected,
    };
  }

  async upsertSegment(sessionId: string, segment: BridgeTranscriptSegment): Promise<void> {
    const { error } = await this.client.from("transcript_segments").upsert({
      session_id: sessionId,
      segment_id: segment.id,
      speaker_id: segment.speakerId,
      start_ms: Math.round(segment.startMs),
      end_ms: segment.endMs == null ? null : Math.round(segment.endMs),
      text: segment.text,
      confidence: segment.confidence,
      state: segment.state,
    });
    if (error) throw new Error(`SEGMENT_SAVE_FAILED: ${error.message}`);
  }

  async saveArtifacts(sessionId: string, artifacts: DerivedMeetingArtifacts): Promise<void> {
    const { error: summaryError } = await this.client.from("summary_snapshots").upsert({
      session_id: sessionId,
      snapshot_id: artifacts.summary.id,
      created_at: artifacts.summary.createdAt,
      range_start_ms: Math.round(artifacts.summary.rangeStartMs),
      range_end_ms: Math.round(artifacts.summary.rangeEndMs),
      bullets: artifacts.summary.bullets,
    });
    if (summaryError) throw new Error(`SUMMARY_SAVE_FAILED: ${summaryError.message}`);

    for (const action of artifacts.actions) {
      const { error } = await this.client.from("action_items").upsert({
        session_id: sessionId,
        action_id: action.id,
        text: action.text,
        owner: action.owner,
        due_date: action.dueDate,
        source_segment_ids: action.sourceSegmentIds,
        status: action.status,
      });
      if (error) throw new Error(`ACTION_SAVE_FAILED: ${error.message}`);
    }

    for (const decision of artifacts.decisions) {
      const { error } = await this.client.from("decision_items").upsert({
        session_id: sessionId,
        decision_id: decision.id,
        text: decision.text,
        source_segment_ids: decision.sourceSegmentIds,
      });
      if (error) throw new Error(`DECISION_SAVE_FAILED: ${error.message}`);
    }

    const { error: keywordsError } = await this.client.from("session_keywords").upsert({
      session_id: sessionId,
      keywords: artifacts.keywords,
    });
    if (keywordsError) throw new Error(`KEYWORD_SAVE_FAILED: ${keywordsError.message}`);
  }

  async completeSession(sessionId: string): Promise<string> {
    const endedAt = new Date().toISOString();
    const { error } = await this.client
      .from("meeting_sessions")
      .update({ status: "completed", ended_at: endedAt })
      .eq("id", sessionId);
    if (error) throw new Error(`SESSION_COMPLETE_FAILED: ${error.message}`);
    return endedAt;
  }
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
