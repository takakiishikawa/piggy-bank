-- Simulation feature: JP-side income -> annual savings tracker.
-- Independent of the VN-side budget/category tables (kept extensible for a
-- future "vn" income source via the `source` column, but only "jp" is used today).

create table if not exists kenyakugo.income_sources (
  source text primary key check (source in ('jp', 'vn')),
  default_monthly_income bigint not null default 0,
  updated_at timestamptz not null default now()
);

alter table kenyakugo.income_sources enable row level security;

create policy "auth all access" on kenyakugo.income_sources
  for all to authenticated
  using (true)
  with check (true);

-- One row per tracked month ('YYYY-MM'). A month with no row simply hasn't
-- been tracked yet (rendered as "No data" client-side for past months, or
-- seeded from the default income client-side for the current/future months).
create table if not exists kenyakugo.savings_months (
  month text primary key,
  planned_savings bigint not null default 0,
  actual_savings bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table kenyakugo.savings_months enable row level security;

create policy "auth all access" on kenyakugo.savings_months
  for all to authenticated
  using (true)
  with check (true);
