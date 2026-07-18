-- Distinguishes special_entries created by hand (e.g. a planned "Japan trip"
-- expense you type in yourself) from ones mirrored automatically when a
-- transaction is flagged "Special expense". Only 'manual' rows may be
-- deleted from the Simulation page — 'transaction' rows must be un-flagged
-- from Transactions instead, or they'd silently orphan from their linked
-- transaction (which still holds special_entry_id + excluded_from_dashboard).
alter table piggybank.special_entries
  add column if not exists source text not null default 'manual' check (source in ('manual', 'transaction'));

update piggybank.special_entries se
set source = 'transaction'
where exists (
  select 1 from piggybank.transactions t where t.special_entry_id = se.id
);
