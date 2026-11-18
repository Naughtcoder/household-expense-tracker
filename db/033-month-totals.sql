-- Money out or money in per month, for one person or the household, by the
-- same rules as countsAsSpend and countsAsIncome in lib/scope.ts. The
-- Insights year chart uses it to scroll back three years without fetching
-- every payment.
create or replace function month_totals(p_from date, p_to date, p_who uuid, p_in boolean)
returns table(month text, total numeric)
language sql stable security invoker as $$
  select to_char(occurred_on, 'YYYY-MM'), sum(amount)
  from transactions
  where occurred_on between p_from and p_to
    and status not in ('duplicate', 'ignored')
    and direction::text = case when p_in then 'credit' else 'debit' end
    and scope not in ('claimable', 'investment', 'transfer')
    and category_id is distinct from 18
    and (p_who is null or paid_by = p_who)
  group by 1
$$;
grant execute on function month_totals(date, date, uuid, boolean) to authenticated;
