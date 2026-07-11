-- Lets a one-off/exceptional transaction (e.g. a security deposit) be
-- excluded from the dashboard's monthly budget calculations while still
-- counting in the Report's historical trend.
ALTER TABLE kenyakugo.transactions
  ADD COLUMN IF NOT EXISTS excluded_from_dashboard BOOLEAN NOT NULL DEFAULT FALSE;
