-- What each inbox receives from banks, grouped by sender and kind of message.
-- Filled by survey() in the Gmail script, read when writing new readers.
create table if not exists email_survey (
  inbox  text primary key,
  at     timestamptz not null default now(),
  data   jsonb not null
);
alter table email_survey enable row level security;
revoke all on email_survey from anon;
