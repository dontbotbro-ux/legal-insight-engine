-- =========================================================
-- Legal Intelligence Engine (Supabase/PostgreSQL)
-- Stateful multi-user schema with RLS + search + audit
-- =========================================================

-- 0) Extensions
create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

-- 1) Common updated_at trigger
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- 2) CASES
create table if not exists public.cases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  title text not null,
  jurisdiction text not null,
  case_type text not null,
  statute_date date,
  docket_number text,
  source_url text,
  source_document_path text,

  raw_text text,
  summary text,
  metadata jsonb not null default '{}'::jsonb,

  -- HITL controls
  verification_status boolean not null default false,
  verified_by uuid references auth.users(id) on delete set null,
  verified_at timestamptz,
  constraint cases_verification_requires_reviewer
    check (verification_status = false or verified_by is not null),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Full-text search surface
  search_vector tsvector generated always as (
    to_tsvector(
      'english',
      coalesce(title, '') || ' ' ||
      coalesce(summary, '') || ' ' ||
      coalesce(raw_text, '')
    )
  ) stored
);

drop trigger if exists trg_cases_updated_at on public.cases;
create trigger trg_cases_updated_at
before update on public.cases
for each row execute function public.set_updated_at();

-- Search/filter indexes
create index if not exists idx_cases_user_id on public.cases(user_id);
create index if not exists idx_cases_filter on public.cases(user_id, jurisdiction, case_type, statute_date);
create index if not exists idx_cases_search_vector on public.cases using gin(search_vector);
create index if not exists idx_cases_metadata_gin on public.cases using gin(metadata);
create index if not exists idx_cases_title_trgm on public.cases using gin(title gin_trgm_ops);

-- 3) USER ACTIVITY
create table if not exists public.user_activity (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  case_id uuid references public.cases(id) on delete set null,

  activity_type text not null check (
    activity_type in (
      'case_created',
      'case_updated',
      'query_saved',
      'query_executed',
      'verification_completed',
      'audit_reviewed',
      'exported'
    )
  ),
  activity_payload jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_user_activity_updated_at on public.user_activity;
create trigger trg_user_activity_updated_at
before update on public.user_activity
for each row execute function public.set_updated_at();

create index if not exists idx_user_activity_user_created on public.user_activity(user_id, created_at desc);
create index if not exists idx_user_activity_case on public.user_activity(case_id);
create index if not exists idx_user_activity_payload_gin on public.user_activity using gin(activity_payload);

-- 4) SAVED QUERIES (saved research sessions)
create table if not exists public.saved_queries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  name text not null,
  query_text text not null,

  -- Fast filter columns
  jurisdiction text,
  case_type text,
  statute_date_from date,
  statute_date_to date,

  -- Extra filter flexibility
  filters jsonb not null default '{}'::jsonb,

  last_run_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  search_vector tsvector generated always as (
    to_tsvector('english', coalesce(name, '') || ' ' || coalesce(query_text, ''))
  ) stored
);

drop trigger if exists trg_saved_queries_updated_at on public.saved_queries;
create trigger trg_saved_queries_updated_at
before update on public.saved_queries
for each row execute function public.set_updated_at();

create index if not exists idx_saved_queries_user on public.saved_queries(user_id);
create index if not exists idx_saved_queries_filter on public.saved_queries(user_id, jurisdiction, case_type);
create index if not exists idx_saved_queries_search_vector on public.saved_queries using gin(search_vector);
create index if not exists idx_saved_queries_filters_gin on public.saved_queries using gin(filters);

-- 5) AUDIT LOGS (prompt/response/token billing)
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  case_id uuid references public.cases(id) on delete set null,
  saved_query_id uuid references public.saved_queries(id) on delete set null,

  provider text not null,
  model text not null,

  llm_prompt text not null,
  llm_response text not null,

  prompt_tokens integer not null default 0,
  completion_tokens integer not null default 0,
  total_tokens integer not null default 0,
  token_cost_usd numeric(12,6) not null default 0,

  latency_ms integer,

  -- HITL review of AI output
  verification_status boolean not null default false,
  verified_by uuid references auth.users(id) on delete set null,
  verified_at timestamptz,
  constraint audit_logs_verification_requires_reviewer
    check (verification_status = false or verified_by is not null),

  meta jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_audit_logs_updated_at on public.audit_logs;
create trigger trg_audit_logs_updated_at
before update on public.audit_logs
for each row execute function public.set_updated_at();

create index if not exists idx_audit_logs_user_created on public.audit_logs(user_id, created_at desc);
create index if not exists idx_audit_logs_case on public.audit_logs(case_id);
create index if not exists idx_audit_logs_saved_query on public.audit_logs(saved_query_id);
create index if not exists idx_audit_logs_meta_gin on public.audit_logs using gin(meta);

-- =========================================================
-- RLS
-- =========================================================
alter table public.cases enable row level security;
alter table public.user_activity enable row level security;
alter table public.saved_queries enable row level security;
alter table public.audit_logs enable row level security;

-- CASES policies
DROP POLICY IF EXISTS "cases_select_own" ON public.cases;
create policy "cases_select_own"
on public.cases for select
using (auth.uid() = user_id);

DROP POLICY IF EXISTS "cases_insert_own" ON public.cases;
create policy "cases_insert_own"
on public.cases for insert
with check (auth.uid() = user_id);

DROP POLICY IF EXISTS "cases_update_own" ON public.cases;
create policy "cases_update_own"
on public.cases for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

DROP POLICY IF EXISTS "cases_delete_own" ON public.cases;
create policy "cases_delete_own"
on public.cases for delete
using (auth.uid() = user_id);

-- USER_ACTIVITY policies
DROP POLICY IF EXISTS "user_activity_select_own" ON public.user_activity;
create policy "user_activity_select_own"
on public.user_activity for select
using (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_activity_insert_own" ON public.user_activity;
create policy "user_activity_insert_own"
on public.user_activity for insert
with check (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_activity_update_own" ON public.user_activity;
create policy "user_activity_update_own"
on public.user_activity for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_activity_delete_own" ON public.user_activity;
create policy "user_activity_delete_own"
on public.user_activity for delete
using (auth.uid() = user_id);

-- SAVED_QUERIES policies
DROP POLICY IF EXISTS "saved_queries_select_own" ON public.saved_queries;
create policy "saved_queries_select_own"
on public.saved_queries for select
using (auth.uid() = user_id);

DROP POLICY IF EXISTS "saved_queries_insert_own" ON public.saved_queries;
create policy "saved_queries_insert_own"
on public.saved_queries for insert
with check (auth.uid() = user_id);

DROP POLICY IF EXISTS "saved_queries_update_own" ON public.saved_queries;
create policy "saved_queries_update_own"
on public.saved_queries for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

DROP POLICY IF EXISTS "saved_queries_delete_own" ON public.saved_queries;
create policy "saved_queries_delete_own"
on public.saved_queries for delete
using (auth.uid() = user_id);

-- AUDIT_LOGS policies
DROP POLICY IF EXISTS "audit_logs_select_own" ON public.audit_logs;
create policy "audit_logs_select_own"
on public.audit_logs for select
using (auth.uid() = user_id);

DROP POLICY IF EXISTS "audit_logs_insert_own" ON public.audit_logs;
create policy "audit_logs_insert_own"
on public.audit_logs for insert
with check (auth.uid() = user_id);

DROP POLICY IF EXISTS "audit_logs_update_own" ON public.audit_logs;
create policy "audit_logs_update_own"
on public.audit_logs for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

DROP POLICY IF EXISTS "audit_logs_delete_own" ON public.audit_logs;
create policy "audit_logs_delete_own"
on public.audit_logs for delete
using (auth.uid() = user_id);

-- =========================================================
-- FastMCP-friendly fetch function (RLS-aware)
-- Call via Supabase RPC with end-user JWT for row scoping.
-- =========================================================
create or replace function public.fetch_cases(
  p_search text default null,
  p_jurisdiction text default null,
  p_case_type text default null,
  p_statute_date_from date default null,
  p_statute_date_to date default null,
  p_verified boolean default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  id uuid,
  title text,
  jurisdiction text,
  case_type text,
  statute_date date,
  summary text,
  verification_status boolean,
  verified_by uuid,
  created_at timestamptz,
  updated_at timestamptz,
  rank real
)
language sql
stable
security invoker
as $$
  select
    c.id,
    c.title,
    c.jurisdiction,
    c.case_type,
    c.statute_date,
    c.summary,
    c.verification_status,
    c.verified_by,
    c.created_at,
    c.updated_at,
    case
      when p_search is null or btrim(p_search) = '' then 0::real
      else ts_rank(c.search_vector, plainto_tsquery('english', p_search))
    end as rank
  from public.cases c
  where
    c.user_id = auth.uid()
    and (p_jurisdiction is null or c.jurisdiction = p_jurisdiction)
    and (p_case_type is null or c.case_type = p_case_type)
    and (p_statute_date_from is null or c.statute_date >= p_statute_date_from)
    and (p_statute_date_to is null or c.statute_date <= p_statute_date_to)
    and (p_verified is null or c.verification_status = p_verified)
    and (
      p_search is null
      or btrim(p_search) = ''
      or c.search_vector @@ plainto_tsquery('english', p_search)
    )
  order by
    rank desc,
    c.updated_at desc
  limit greatest(1, least(p_limit, 200))
  offset greatest(0, p_offset);
$$;

grant execute on function public.fetch_cases(text, text, text, date, date, boolean, integer, integer) to authenticated;
