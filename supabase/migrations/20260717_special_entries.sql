-- Named, itemized one-off income/expense entries for a simulation month
-- (e.g. income "Bonus", expense "Japan trip"). Independent of the single
-- default_monthly_income scalar in income_sources, which now represents
-- only the recurring/regular monthly income.
create table if not exists piggybank.special_entries (
  id uuid primary key default gen_random_uuid(),
  month text not null check (month ~ '^\d{4}-\d{2}$'),
  kind text not null check (kind in ('income', 'expense')),
  name text not null,
  amount bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists special_entries_month_idx on piggybank.special_entries (month);

alter table piggybank.special_entries enable row level security;

create policy "auth all access" on piggybank.special_entries
  for all to authenticated
  using (true)
  with check (true);
