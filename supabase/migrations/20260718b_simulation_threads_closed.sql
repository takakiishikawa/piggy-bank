-- Lets a thread be "closed" (archived) once it's no longer active, without
-- deleting its notes/tasks. Closed threads are hidden from the main chip
-- row but remain viewable/reopenable from the Archived list.
alter table piggybank.simulation_threads
  add column if not exists closed_at timestamptz;
