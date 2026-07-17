-- Special entries can be JPY (the simulation's own currency) or VND (flagged
-- directly from a VN transaction). Only JPY entries count toward the
-- simulation's income/expense/remaining/cumulative totals — VND entries are
-- shown for reference only, since converting them would misstate the totals.
alter table piggybank.special_entries
  add column if not exists currency text not null default 'JPY' check (currency in ('JPY', 'VND'));

-- Links a transaction to the special_entries row created when it's flagged
-- as a special expense (replaces the old dashboard-only "excluded" toggle).
-- Deleting the special_entries row (un-flagging) clears this automatically.
alter table piggybank.transactions
  add column if not exists special_entry_id uuid references piggybank.special_entries(id) on delete set null;
