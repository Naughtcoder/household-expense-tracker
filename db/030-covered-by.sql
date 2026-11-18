-- A payment one of them made that the other paid back: it counts as the one
-- who paid it back's spending, and points at the transfer that did it.
alter table transactions add column if not exists covered_by uuid references transactions(id) on delete set null;
create index if not exists transactions_covered_by on transactions (covered_by) where covered_by is not null;
