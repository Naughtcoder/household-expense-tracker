-- Categories at any depth, and the household can add and move them.
--
-- Until now the tree was two levels and the totals took coalesce(parent_id, id)
-- as "the top". Transportation > Car > Toll is three, so the top is found by
-- walking up instead.

create or replace function cat_root(p int) returns int
language sql stable security invoker as $$
  with recursive up as (
    select id, parent_id, 0 as d from categories where id = p
    union all
    select c.id, c.parent_id, up.d + 1 from categories c join up on c.id = up.parent_id where up.d < 12
  )
  select id from up where parent_id is null limit 1
$$;
grant execute on function cat_root(int) to authenticated;

create or replace function spend_by_category(p_from date, p_to date)
returns table(month text, category_id int, top_id int, n int, total numeric)
language sql stable security invoker as $$
  select to_char(t.occurred_on, 'YYYY-MM'), t.category_id, cat_root(t.category_id),
         count(*)::int, sum(t.amount)
  from transactions t
  where t.occurred_on between p_from and p_to
    and t.status not in ('duplicate', 'ignored')
    and t.direction = 'debit'
    and t.scope not in ('claimable', 'investment', 'transfer')
    and t.category_id is distinct from 18
  group by 1, 2, 3
$$;

-- A category may not sit under itself or under anything below it.
create or replace function categories_no_loop() returns trigger
language plpgsql as $$
begin
  if new.parent_id is null then return new; end if;
  if new.parent_id = new.id or exists (
    with recursive up as (
      select id, parent_id from categories where id = new.parent_id
      union all
      select c.id, c.parent_id from categories c join up on c.id = up.parent_id
    ) select 1 from up where id = new.id
  ) then
    raise exception 'A category cannot sit under itself or under one of its own subcategories';
  end if;
  return new;
end $$;
drop trigger if exists categories_no_loop on categories;
create trigger categories_no_loop before insert or update of parent_id on categories
  for each row execute function categories_no_loop();

drop policy if exists add_cats on categories;
create policy add_cats on categories for insert to authenticated with check ((select is_household()));
drop policy if exists edit_cats on categories;
create policy edit_cats on categories for update to authenticated using ((select is_household())) with check ((select is_household()));
-- No delete policy on purpose: a category with history is renamed or moved,
-- never removed.

-- Car gets Parking and Toll under it (Alex, 4 Oct 2026).
update categories set name = 'Parking', parent_id = 30 where id = 31;
insert into categories (name, parent_id) select 'Toll', 30
  where not exists (select 1 from categories where name = 'Toll' and parent_id = 30);
-- Books, under Culture.
insert into categories (name, parent_id) select 'Books', 13
  where not exists (select 1 from categories where name = 'Books' and parent_id = 13);
