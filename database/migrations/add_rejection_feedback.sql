-- Add columns for rejection feedback loop: reasoning_summary, iteration_count, plan_iterations
alter table risk_cases add column if not exists reasoning_summary jsonb default '[]';
alter table risk_cases add column if not exists iteration_count int default 0;
alter table risk_cases add column if not exists plan_iterations jsonb default '[]';
