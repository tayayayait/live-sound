create extension if not exists pgcrypto;

create table public.meeting_sessions (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 80),
  language text not null check (language in ('ko-KR', 'en-US', 'ja-JP')),
  summary_interval text not null check (summary_interval in ('30', '60', 'manual')),
  chunk_interval_ms integer not null check (chunk_interval_ms between 100 and 1000),
  status text not null default 'created' check (
    status in ('created', 'recording', 'paused', 'processing_final', 'completed', 'failed')
  ),
  session_token_hash text not null,
  ws_url text,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.transcript_segments (
  session_id uuid not null references public.meeting_sessions(id) on delete cascade,
  segment_id text not null,
  speaker_id text,
  start_ms integer not null check (start_ms >= 0),
  end_ms integer check (end_ms >= 0),
  text text not null default '',
  confidence numeric check (confidence is null or (confidence >= 0 and confidence <= 1)),
  state text not null check (state in ('partial', 'final', 'corrected', 'low_confidence')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (session_id, segment_id)
);

create table public.summary_snapshots (
  session_id uuid not null references public.meeting_sessions(id) on delete cascade,
  snapshot_id text not null,
  created_at timestamptz not null default now(),
  range_start_ms integer not null check (range_start_ms >= 0),
  range_end_ms integer not null check (range_end_ms >= 0),
  bullets text[] not null default '{}',
  confidence numeric check (confidence is null or (confidence >= 0 and confidence <= 1)),
  primary key (session_id, snapshot_id)
);

create table public.action_items (
  session_id uuid not null references public.meeting_sessions(id) on delete cascade,
  action_id text not null,
  text text not null,
  owner text,
  due_date text,
  source_segment_ids text[] not null default '{}',
  status text not null default 'open' check (status in ('open', 'done')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (session_id, action_id)
);

create table public.decision_items (
  session_id uuid not null references public.meeting_sessions(id) on delete cascade,
  decision_id text not null,
  text text not null,
  source_segment_ids text[] not null default '{}',
  created_at timestamptz not null default now(),
  primary key (session_id, decision_id)
);

create table public.session_keywords (
  session_id uuid primary key references public.meeting_sessions(id) on delete cascade,
  keywords text[] not null default '{}',
  updated_at timestamptz not null default now()
);

create table public.export_jobs (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.meeting_sessions(id) on delete cascade,
  format text not null check (format in ('md', 'txt', 'json')),
  filename text not null,
  mime_type text not null,
  content text not null,
  created_at timestamptz not null default now()
);

create index meeting_sessions_status_idx on public.meeting_sessions(status);
create index transcript_segments_session_time_idx on public.transcript_segments(session_id, start_ms);
create index summary_snapshots_session_created_idx on public.summary_snapshots(session_id, created_at desc);
create index action_items_session_status_idx on public.action_items(session_id, status);
create index decision_items_session_created_idx on public.decision_items(session_id, created_at);
create index export_jobs_session_created_idx on public.export_jobs(session_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger meeting_sessions_set_updated_at
before update on public.meeting_sessions
for each row execute function public.set_updated_at();

create trigger transcript_segments_set_updated_at
before update on public.transcript_segments
for each row execute function public.set_updated_at();

create trigger action_items_set_updated_at
before update on public.action_items
for each row execute function public.set_updated_at();

create trigger session_keywords_set_updated_at
before update on public.session_keywords
for each row execute function public.set_updated_at();

alter table public.meeting_sessions enable row level security;
alter table public.transcript_segments enable row level security;
alter table public.summary_snapshots enable row level security;
alter table public.action_items enable row level security;
alter table public.decision_items enable row level security;
alter table public.session_keywords enable row level security;
alter table public.export_jobs enable row level security;

revoke all on public.meeting_sessions from anon, authenticated;
revoke all on public.transcript_segments from anon, authenticated;
revoke all on public.summary_snapshots from anon, authenticated;
revoke all on public.action_items from anon, authenticated;
revoke all on public.decision_items from anon, authenticated;
revoke all on public.session_keywords from anon, authenticated;
revoke all on public.export_jobs from anon, authenticated;
