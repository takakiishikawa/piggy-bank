-- Optional per-month label for savings_months (e.g. "Japan trip"), shown
-- as a tag next to the month in the Simulation table.
ALTER TABLE kenyakugo.savings_months
  ADD COLUMN IF NOT EXISTS note TEXT;
