# API Adapter Contract

## Runtime

- Product API: Supabase Edge Function `meeting-api`
- Realtime STT bridge: Cloud Run Node service `stt-bridge`
- Browser secrets: only Supabase publishable/anon key and public URLs
- Server secrets: Supabase service role key, Google Cloud credentials, Gemini API key

## HTTP API

Base URL:

- `VITE_MEETING_API_BASE_URL`, or
- `${VITE_SUPABASE_URL}/functions/v1/meeting-api`

Endpoints:

- `GET /health`
- `POST /sessions`
- `GET /sessions/:id`
- `GET /sessions/:id/result`
- `POST /sessions/:id/export`

`POST /sessions` returns:

```json
{
  "session": {
    "id": "uuid",
    "title": "주간 회의",
    "language": "ko-KR",
    "summaryInterval": 60,
    "chunkIntervalMs": 100,
    "startedAt": "2026-07-01T00:00:00.000Z",
    "wsUrl": "wss://bridge.example.com/sessions/<id>/audio?token=<token>"
  },
  "sessionToken": "one-time-style-token",
  "wsUrl": "wss://bridge.example.com/sessions/<id>/audio?token=<token>"
}
```

## WebSocket API

Bridge URL:

```text
wss://<bridge-host>/sessions/:id/audio?token=<sessionToken>
```

Client events:

- `audio.chunk`
- `session.pause`
- `session.resume`
- `session.stop`
- `summary.request`
- `heartbeat.ping`

Server events:

- `status.ready`
- `status.latency`
- `transcript.partial`
- `transcript.final`
- `summary.snapshot`
- `action_item.detected`
- `decision.detected`
- `keywords.updated`
- `session.completed`
- `heartbeat.pong`
- `error`

Audio chunk payload starts as base64 16kHz mono PCM:

```json
{
  "type": "audio.chunk",
  "payload": {
    "sequence": 1,
    "mimeType": "audio/pcm;rate=16000",
    "durationMs": 100,
    "sampleRate": 16000,
    "data": "base64-pcm16"
  }
}
```
