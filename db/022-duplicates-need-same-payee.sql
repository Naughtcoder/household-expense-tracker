-- A possible duplicate now needs the same payee, not just the same account.
--
-- The old check matched on account alone, so ₹25 to the tea shop and ₹25 to
-- a different stall a day later, both from account 2222, were shown as "might
-- be the same purchase". Most of the pairs in Review on 3 Oct 2026 were that.
--
-- Payees are compared as letters only, so "..BOMBAY BRASSERIE_" and
-- "BOMBAY BRASSERIE" match, and one name inside the other matches ("AIRTEL
-- PAYMENTS BANK" in "AIRTEL PAYMENTS BANK LIMITED"). A payee the bank gave
-- only as a handle ("@PTYES") or not at all is treated as unknown, and then
-- the same account, amount and exact day is still enough.
create or replace function payee_letters(k text) returns text
language sql immutable as $$
  select nullif(regexp_replace(upper(coalesce(case when k like '@%' then null else k end, '')), '[^A-Z]', '', 'g'), '')
$$;

create or replace function same_payee(a text, b text) returns boolean
language sql immutable as $$
  select case
    when payee_letters(a) is null or payee_letters(b) is null then null
    else payee_letters(a) = payee_letters(b)
      or strpos(payee_letters(a), payee_letters(b)) > 0
      or strpos(payee_letters(b), payee_letters(a)) > 0
      or (length(payee_letters(a)) >= 6 and left(payee_letters(a), 6) = left(payee_letters(b), 6))
  end
$$;

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
      same_payee(t.merchant_key, p_merchant) is true
      or (same_payee(t.merchant_key, p_merchant) is null
          and p_account is not null and t.account_tail = p_account
          and t.occurred_on = p_date and t.amount = p_amount)
    )
  order by t.created_at desc
  limit 3;
$$;

grant execute on function possible_duplicates(numeric, date, text, text, text) to authenticated, service_role;

-- Clear the pairs already waiting that the new rule would not have made.
update transactions t set possible_duplicate_of = null
from transactions d
where d.id = t.possible_duplicate_of and t.status = 'review'
  and not coalesce(same_payee(t.merchant_key, d.merchant_key),
                   t.account_tail = d.account_tail and t.occurred_on = d.occurred_on and t.amount = d.amount);
