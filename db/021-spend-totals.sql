-- Spending totals worked out in the database.
--
-- The pages used to fetch every row and add them up, and PostgREST stops at
-- 1,000 rows without saying so. Seven months is about 1,300 rows now, so the
-- Insights chart was quietly adding up an arbitrary 1,000 of them. These
-- return one row per month and category instead, and apply the same rule as
-- countsAsSpend in lib/scope.ts: money out, not claimable, not invested, not a
-- transfer between his own accounts, not a deposit (category 18).
create or replace function spend_by_category(p_from date, p_to date)
returns table(month text, category_id int, top_id int, n int, total numeric)
language sql stable security invoker as $$
  select to_char(t.occurred_on, 'YYYY-MM'), t.category_id, coalesce(c.parent_id, c.id),
         count(*)::int, sum(t.amount)
  from transactions t left join categories c on c.id = t.category_id
  where t.occurred_on between p_from and p_to
    and t.status not in ('duplicate', 'ignored')
    and t.direction = 'debit'
    and t.scope not in ('claimable', 'investment', 'transfer')
    and t.category_id is distinct from 18
  group by 1, 2, 3
$$;

create or replace function spend_by_top(p_from date, p_to date)
returns table(month text, top_id int, n int, total numeric)
language sql stable security invoker as $$
  select month, top_id, sum(n)::int, sum(total) from spend_by_category(p_from, p_to) group by 1, 2
$$;

grant execute on function spend_by_category(date, date), spend_by_top(date, date) to authenticated;
