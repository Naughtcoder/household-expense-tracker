-- The time of a payment, not only the day. From the bank email's sent time
-- (usually within a minute of the payment) or, for a text, when it arrived.
-- Null where nothing says, such as Money Manager imports and hand entries.
alter table transactions add column if not exists occurred_at timestamptz;

-- Payments that came in live from a bank email or text were stored within a
-- few minutes of arriving, so the time they were stored is a close stand-in.
-- Only where that time falls on the payment's own day (in India time), which
-- leaves out everything filled in later by a backfill.
update transactions
set occurred_at = created_at
where occurred_at is null
  and (flags && array['email', 'sms'])
  and not ('history-backfill' = any(flags))
  and (created_at at time zone 'Asia/Kolkata')::date = occurred_on;
