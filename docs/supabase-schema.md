# Supabase Schema

## Tables

- `meeting_sessions`: session metadata, status, token hash, bridge URL
- `transcript_segments`: partial/final/corrected/low-confidence transcript rows
- `summary_snapshots`: Gemini or fallback summary snapshots
- `action_items`: extracted action items
- `decision_items`: extracted decisions
- `session_keywords`: latest keyword list per session
- `export_jobs`: generated export content audit trail

## Security

- All tables have RLS enabled.
- `anon` and `authenticated` grants are explicitly revoked.
- Browser clients must not read/write these tables directly.
- `meeting-api` and `stt-bridge` use server-side Supabase secret/service role credentials.
- Raw session tokens are never stored. `meeting_sessions.session_token_hash` stores SHA-256 only.

## Required Supabase Secrets

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_SECRET_KEYS`
- `STT_BRIDGE_WS_URL`
- `GOOGLE_CLOUD_PROJECT`
- `GOOGLE_CLOUD_LOCATION` (`us` or `eu` for the default `chirp_3` model)
- `GOOGLE_SPEECH_MODEL`
- `GEMINI_API_KEY`

## Local Commands

```bash
npx supabase migration list
npx supabase db push
npx supabase functions serve meeting-api
npx supabase functions deploy meeting-api
```
