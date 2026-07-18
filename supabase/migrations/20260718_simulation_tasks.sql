-- Tasks are a second kind of item inside a Simulation thread, alongside
-- freeform notes: a checkable to-do with a start date, plus its own
-- comment thread for follow-up discussion.
create table if not exists piggybank.simulation_tasks (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references piggybank.simulation_threads(id) on delete cascade,
  title text not null,
  start_date date,
  done boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists simulation_tasks_thread_idx on piggybank.simulation_tasks (thread_id);

alter table piggybank.simulation_tasks enable row level security;

create policy "auth all access" on piggybank.simulation_tasks
  for all to authenticated
  using (true)
  with check (true);

create table if not exists piggybank.simulation_task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references piggybank.simulation_tasks(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists simulation_task_comments_task_idx on piggybank.simulation_task_comments (task_id);

alter table piggybank.simulation_task_comments enable row level security;

create policy "auth all access" on piggybank.simulation_task_comments
  for all to authenticated
  using (true)
  with check (true);
