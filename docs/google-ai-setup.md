# Google AI Setup

## Google Speech-to-Text

The realtime path uses Google Cloud Speech-to-Text streaming recognition through the Cloud Run `stt-bridge` service. Google documents streaming recognition as gRPC-only, so the browser does not call Google directly.

Required Cloud Run environment:

- `GOOGLE_CLOUD_PROJECT`
- `GOOGLE_CLOUD_LOCATION`, default `us`
- `GOOGLE_SPEECH_MODEL`, default `chirp_3`
- `GOOGLE_SPEECH_RECOGNIZER`, optional. Defaults to `projects/<project>/locations/<location>/recognizers/_`
- Application Default Credentials or a Cloud Run service account with Speech-to-Text permissions

`chirp_3` is not served from the `global` Speech-to-Text location. Use the `us` or `eu` multi-region location and the matching regional endpoint, for example `us-speech.googleapis.com`.

Audio format:

- 16kHz
- mono
- signed little-endian PCM16
- 100ms chunks by default, configurable from 100ms to 1000ms

The bridge requests Google streaming interim results so live captions can update while a speaker is still talking, then replaces the same row when a final result arrives.

## Gemini

The bridge calls Gemini `generateContent` for summary, action items, decisions, and keywords.

Required environment:

- `GEMINI_API_KEY`

If `GEMINI_API_KEY` is absent or Gemini fails, the bridge falls back to deterministic local extraction so the demo flow still completes.

## Cloud Run Bridge

Build and run locally:

```bash
cd services/stt-bridge
npm install
npm run build
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... USE_MOCK_STT=true npm start
```

Deploy target:

```bash
gcloud run deploy live-meeting-stt-bridge \
  --source services/stt-bridge \
  --allow-unauthenticated \
  --set-env-vars SUPABASE_URL=...,GOOGLE_CLOUD_PROJECT=...,GOOGLE_CLOUD_LOCATION=us
```

Store sensitive values such as `SUPABASE_SERVICE_ROLE_KEY` and `GEMINI_API_KEY` as Cloud Run secrets, not literal env values.
