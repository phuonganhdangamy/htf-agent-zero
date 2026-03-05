-- ── COMPANY PROFILE ──────────────────────────────────────────
create table company_profiles (
  id uuid primary key default gen_random_uuid(),
  company_id text unique not null,
  industry text,
  annual_revenue numeric,
  primary_products jsonb,
  risk_appetite text check (risk_appetite in ('low', 'medium', 'high')),
  notification_threshold int default 60,
  created_at timestamptz default now()
);

-- ── MOCK ERP TABLES ──────────────────────────────────────────
create table suppliers (
  id uuid primary key default gen_random_uuid(),
  supplier_id text unique not null,
  supplier_name text not null,
  tier int,
  country text,
  region text,
  lat numeric,
  lon numeric,
  materials_supplied jsonb,
  criticality_score int,
  single_source boolean default false,
  lead_time_days int,
  contract_value numeric,
  has_backup_supplier boolean default false,
  backup_lead_time_days int,
  switching_cost text check (switching_cost in ('low', 'medium', 'high')),
  ticker text,
  is_public_company boolean default false,
  created_at timestamptz default now()
);

create table facilities (
  id uuid primary key default gen_random_uuid(),
  facility_id text unique not null,
  facility_type text check (facility_type in ('plant', 'warehouse', 'dc', 'assembly')),
  country text,
  lat numeric,
  lon numeric,
  production_capacity numeric,
  primary_inputs jsonb,
  inventory_buffer_days int,
  products_produced jsonb,
  daily_production_capacity numeric,
  created_at timestamptz default now()
);

create table materials (
  id uuid primary key default gen_random_uuid(),
  material_id text unique not null,
  material_name text,
  category text check (category in ('raw', 'component', 'subassembly')),
  commodity_linked boolean default false,
  created_at timestamptz default now()
);

create table products (
  id uuid primary key default gen_random_uuid(),
  product_id text unique not null,
  product_name text,
  annual_volume numeric,
  margin_percent numeric,
  priority_level text check (priority_level in ('high', 'medium', 'low')),
  created_at timestamptz default now()
);

create table bill_of_materials (
  id uuid primary key default gen_random_uuid(),
  product_id text references products(product_id),
  material_id text references materials(material_id),
  quantity_required numeric,
  unit text
);

create table supplier_materials (
  id uuid primary key default gen_random_uuid(),
  material_id text references materials(material_id),
  supplier_id text references suppliers(supplier_id),
  supplying_facility_id text,
  contract_type text,
  primary_supplier boolean default true,
  share_percent numeric,
  lead_time_days int
);

create table transport_routes (
  id uuid primary key default gen_random_uuid(),
  route_id text unique not null,
  origin_supplier_id text references suppliers(supplier_id),
  destination_facility_id text references facilities(facility_id),
  transport_mode text check (transport_mode in ('air', 'sea', 'rail', 'truck')),
  key_ports jsonb,
  key_airports jsonb,
  transit_time_days int,
  incoterms text
);

create table purchase_orders (
  id uuid primary key default gen_random_uuid(),
  po_id text unique not null,
  supplier_id text references suppliers(supplier_id),
  material_id text references materials(material_id),
  quantity numeric,
  eta date,
  ship_mode text,
  status text default 'open',
  delay_risk numeric,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table inventory (
  id uuid primary key default gen_random_uuid(),
  material_id text references materials(material_id),
  facility_id text references facilities(facility_id),
  supplier_id text references suppliers(supplier_id),
  current_inventory_units numeric,
  daily_usage numeric,
  days_of_inventory_remaining numeric,
  reorder_point int,
  safety_stock_days int,
  updated_at timestamptz default now()
);

-- ── AGENT OPERATIONAL TABLES ──────────────────────────────────
create table signal_events (
  id uuid primary key default gen_random_uuid(),
  event_id text unique not null,
  event_type text,
  subtype text,
  country text,
  region text,
  lat numeric,
  lon numeric,
  start_date timestamptz,
  confidence_score numeric,
  company_exposed boolean,
  supplier_id text,
  facility_id text,
  evidence_links jsonb,
  signal_sources jsonb,
  tone numeric,
  risk_category text,
  forecasted boolean default false,
  created_at timestamptz default now()
);

create table risk_cases (
  id uuid primary key default gen_random_uuid(),
  case_id text unique not null,
  cluster_id text,
  risk_category text,
  headline text,
  status text default 'open',
  scores jsonb,
  exposure jsonb,
  hypotheses jsonb,
  recommended_plan text,
  alternative_plans jsonb,
  expected_risk_reduction numeric,
  expected_cost numeric,
  expected_loss_prevented numeric,
  execution_steps jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table decision_packets (
  id uuid primary key default gen_random_uuid(),
  packet_id text unique not null,
  case_id text references risk_cases(case_id),
  decision_mode text check (decision_mode in ('Monitor','Investigate','Prepare','Escalate','Execute')),
  risk_summary jsonb,
  constraints jsonb,
  authorized_actions jsonb,
  requires_approval_for jsonb,
  escalation_owner text,
  approval_expiry_hours int default 2,
  generated_at timestamptz default now()
);

create table action_runs (
  id uuid primary key default gen_random_uuid(),
  action_run_id text unique not null,
  case_id text references risk_cases(case_id),
  plan_id text,
  status text default 'drafted',
  steps jsonb,
  approvals jsonb,
  audit_refs jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table draft_artifacts (
  id uuid primary key default gen_random_uuid(),
  artifact_id text unique not null,
  action_run_id text references action_runs(action_run_id),
  type text check (type in ('email', 'ticket', 'erp_diff', 'slack_message')),
  preview text,
  structured_payload jsonb,
  evidence_refs jsonb,
  status text default 'pending',
  created_at timestamptz default now()
);

create table change_proposals (
  id uuid primary key default gen_random_uuid(),
  proposal_id text unique not null,
  action_run_id text references action_runs(action_run_id),
  system text,
  entity_type text,
  entity_id text,
  diff jsonb,
  risk jsonb,
  approved_by text,
  approved_at timestamptz,
  status text default 'pending',
  created_at timestamptz default now()
);

create table audit_log (
  id uuid primary key default gen_random_uuid(),
  action_run_id text references action_runs(action_run_id),
  case_id text,
  actor text,
  event_type text,
  payload jsonb,
  created_at timestamptz default now()
);

-- ── MEMORY TABLES ────────────────────────────────────────────
create table memory_patterns (
  id uuid primary key default gen_random_uuid(),
  pattern_id text unique not null,
  trigger_conditions jsonb,
  recommended_actions jsonb,
  avoid_actions jsonb,
  avg_cost_usd numeric,
  avg_loss_prevented_usd numeric,
  avg_risk_reduction numeric,
  confidence numeric,
  support_count int default 1,
  last_updated timestamptz default now()
);

create table memory_entities (
  id uuid primary key default gen_random_uuid(),
  entity_type text,
  entity_id text,
  stats jsonb,
  calibration jsonb,
  confidence numeric,
  last_updated timestamptz default now(),
  unique(entity_type, entity_id)
);

create table memory_preferences (
  id uuid primary key default gen_random_uuid(),
  org_id text unique not null,
  objectives jsonb,
  approval_policy jsonb,
  forbidden jsonb,
  last_updated timestamptz default now()
);

-- ── REALTIME ─────────────────────────────────────────────────
alter publication supabase_realtime add table risk_cases;
alter publication supabase_realtime add table action_runs;
alter publication supabase_realtime add table change_proposals;
alter publication supabase_realtime add table draft_artifacts;
