# API Connection Checklist

Cloud Run bridge URL is intentionally last. First prepare Supabase, Google Speech-to-Text, and Gemini.

## 1. Supabase

Get these values from Supabase Dashboard > Project Settings > API:

- Project URL: `SUPABASE_URL`
- Publishable key or legacy anon key: `VITE_SUPABASE_PUBLISHABLE_KEY`
- Service role key: `SUPABASE_SERVICE_ROLE_KEY`

Use the values here:

- Frontend local file: `.env.local`
- Supabase Edge Function local file: `supabase/functions/.env`
- Cloud Run bridge env/secret: later, when deploying `services/stt-bridge`

Never put `SUPABASE_SERVICE_ROLE_KEY` in frontend env variables.

## 2. Google Speech-to-Text

Prepare this before Cloud Run deployment:

- Google Cloud project id: `GOOGLE_CLOUD_PROJECT`
- Google Speech location: `GOOGLE_CLOUD_LOCATION=us` or `GOOGLE_CLOUD_LOCATION=eu` for the default `chirp_3` model
- Google Speech model: `GOOGLE_SPEECH_MODEL=chirp_3` unless intentionally using another supported model
- Enable Speech-to-Text API in that project
- Use a Cloud Run service account with permission to call Speech-to-Text

For local bridge testing, use one of these:

- `USE_MOCK_STT=true` for mock transcription
- or `GOOGLE_APPLICATION_CREDENTIALS=C:\path\to\service-account.json` for real Google credentials

Do not commit service account JSON files.

## 3. Gemini

Create a Gemini API key in Google AI Studio:

- `GEMINI_API_KEY`

Store it only in server-side places:

- `supabase/functions/.env` for local Edge Function health checks
- Cloud Run Secret Manager for production bridge

Do not expose it through `VITE_` variables.

## 4. Cloud Run Bridge URL, Later

After `services/stt-bridge` is deployed to Cloud Run, Google gives an HTTPS URL like:

```text
https://live-meeting-stt-bridge-xxxxx.a.run.app
```

Convert it to WebSocket form:

```text
wss://live-meeting-stt-bridge-xxxxx.a.run.app
```

Then set:

```env
STT_BRIDGE_WS_URL=wss://live-meeting-stt-bridge-xxxxx.a.run.app
```

Until then, local development can use:

```env
STT_BRIDGE_WS_URL=ws://localhost:8787
```
