-- Optional short memo per transaction (e.g. "half for roommate", "gift"),
-- shown inline wherever transactions are listed and editable in place.
ALTER TABLE kenyakugo.transactions
  ADD COLUMN IF NOT EXISTS note TEXT;
