-- A monthly limit per top-level category. The Month screen draws each
-- category's spend against its limit and turns amber at 80%.
create table if not exists budgets (
  category_id int primary key references categories(id) on delete cascade,
  monthly     numeric(12,2) not null check (monthly > 0),
  updated_at  timestamptz not null default now()
);
alter table budgets enable row level security;
grant select, insert, update, delete on budgets to authenticated;
drop policy if exists read_budgets on budgets;
drop policy if exists write_budgets on budgets;
drop policy if exists edit_budgets on budgets;
drop policy if exists drop_budgets on budgets;
create policy read_budgets  on budgets for select to authenticated using (is_household());
create policy write_budgets on budgets for insert to authenticated with check (is_household());
create policy edit_budgets  on budgets for update to authenticated using (is_household());
create policy drop_budgets  on budgets for delete to authenticated using (is_household());
