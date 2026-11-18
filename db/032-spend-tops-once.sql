-- spend_by_category called cat_root() once per payment, a recursive walk each
-- time: 88 ms for two years. Working out every category's top once per query
-- and joining it is 17 ms.
create or replace function spend_by_category(p_from date, p_to date)
returns table(month text, category_id int, top_id int, n int, total numeric)
language sql stable security invoker as $$
  with recursive tops as (
    select id, id as top from categories where parent_id is null
    union all
    select c.id, tops.top from categories c join tops on c.parent_id = tops.id
  )
  select to_char(t.occurred_on, 'YYYY-MM'), t.category_id, coalesce(tops.top, t.category_id),
         count(*)::int, sum(t.amount)
  from transactions t left join tops on tops.id = t.category_id
  where t.occurred_on between p_from and p_to
    and t.status not in ('duplicate', 'ignored')
    and t.direction = 'debit'
    and t.scope not in ('claimable', 'investment', 'transfer')
    and t.category_id is distinct from 18
  group by 1, 2, 3
$$;
