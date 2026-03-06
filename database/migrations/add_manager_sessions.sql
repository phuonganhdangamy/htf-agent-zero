-- Create manager_sessions table for tracking session state and activity
create table if not exists manager_sessions (
  id uuid primary key default gen_random_uuid(),
  session_id text unique not null,
  org_id text,
  started_at timestamptz default now(),
  updated_at timestamptz default now(),
  last_pipeline_run_at timestamptz,
  pipeline_runs int default 0,
  cases_created jsonb default '[]',
  actions_approved int default 0,
  actions_pending int default 0,
  agents_invoked jsonb default '[]',
  warnings jsonb default '[]',
  session_summary text
);

-- Create index for fast lookups by org_id and updated_at
create index if not exists idx_manager_sessions_org_id on manager_sessions(org_id);
create index if not exists idx_manager_sessions_updated_at on manager_sessions(updated_at desc);
