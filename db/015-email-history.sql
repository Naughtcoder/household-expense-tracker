-- Bank emails from before the tracker existed, read but never booked.
--
-- Money Manager already holds these months with Alex's own categories, so
-- booking the emails would count every payment twice. They are kept here to be
-- matched against Money Manager on amount and day: the email gives the real
-- vendor, Money Manager gives the category he chose, and the pairs are what
-- merchant rules get built and checked from.
create table if not exists email_history (
  source_key   text primary key,
  inbox        text not null,
  occurred_on  date,
  amount       numeric,
  direction    text,
  account_tail text,
  bank         text,
  pattern_id   text,
  merchant_raw text,
  merchant_key text,
  raw_text     text,
  at           timestamptz not null default now()
);
create index if not exists email_history_match on email_history (amount, occurred_on);
alter table email_history enable row level security;
revoke all on email_history from anon;
