-- The hard constraint refuses an exact repeat: same amount, day, merchant,
-- account and direction. Three things slip past it.
--
--   The same purchase reported by two senders. Pine Labs sends one, the bank
--   sends another, with different wording and a different merchant string.
--   The same purchase you both log, one from the SMS and one by hand.
--   A pre-authorisation followed by the final charge, where hotels and fuel
--   stations settle at a slightly different amount a day or two later.
--
-- A soft check flags these rather than refusing them. A false merge quietly
-- loses a real transaction; a duplicate is visible and one tap to fix. So the
-- app never decides, it only asks.

alter table transactions add column if not exists possible_duplicate_of uuid references transactions(id);

create index if not exists transactions_possible_dupe_idx
  on transactions (possible_duplicate_of)
  where possible_duplicate_of is not null;

-- Candidates for a new row: close in time, close in amount, and sharing either
-- the account or the merchant. Same direction, and never itself.
create or replace function possible_duplicates(
  p_amount   numeric,
  p_date     date,
  p_account  text,
  p_merchant text,
  p_direction text
)
returns setof transactions
language sql stable security invoker as $$
  select *
  from transactions t
  where t.direction = p_direction::direction
    and t.status not in ('duplicate', 'ignored')
    and t.occurred_on between p_date - 2 and p_date + 2
    and abs(t.amount - p_amount) <= greatest(p_amount * 0.01, 1)
    and (
      (p_account  is not null and t.account_tail = p_account)
      or (p_merchant is not null and t.merchant_key = p_merchant)
    )
  order by t.created_at desc
  limit 3;
$$;

grant execute on function possible_duplicates(numeric, date, text, text, text) to authenticated, service_role;
