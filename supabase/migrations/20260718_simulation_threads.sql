-- Lightweight notes feature for the Simulation page: user-created "threads"
-- (e.g. "副業" / side business, "借金返済" / debt repayment) each holding a
-- list of freeform memo entries. Independent of the savings/income tracking
-- tables — purely for jotting down thoughts tied to a topic.
create table if not exists piggybank.simulation_threads (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table piggybank.simulation_threads enable row level security;

create policy "auth all access" on piggybank.simulation_threads
  for all to authenticated
  using (true)
  with check (true);

create table if not exists piggybank.simulation_notes (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references piggybank.simulation_threads(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists simulation_notes_thread_idx on piggybank.simulation_notes (thread_id);

alter table piggybank.simulation_notes enable row level security;

create policy "auth all access" on piggybank.simulation_notes
  for all to authenticated
  using (true)
  with check (true);
