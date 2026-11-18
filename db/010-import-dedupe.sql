-- The unique constraint stops the same bank message landing twice. Applied to
-- a historical file it also collapses genuine repeats: nine Yandex rides at an
-- identical fare on one day, or four identical small purchases. 144 rows of
-- Alex's six thousand are exactly that.
--
-- So the guard narrows to what it was built for, live message ingestion, and a
-- separate key makes a bulk import safe to re-run.

alter table transactions drop constraint if exists one_per_bank_event;

-- Live ingestion still cannot write the same event twice.
create unique index if not exists transactions_one_per_bank_event
  on transactions (amount, occurred_on, merchant_key, account_tail, direction)
  where pattern_id is distinct from 'bulk-import';

-- A bulk import identifies each row by where it came from and its position in
-- the file, so running the same file again changes nothing.
alter table transactions add column if not exists source_key text;

create unique index if not exists transactions_source_key_idx
  on transactions (source_key)
  where source_key is not null;
