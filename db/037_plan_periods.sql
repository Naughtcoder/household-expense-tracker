-- How many months one payment covers, by the name a plan shows as. A yearly
-- plan paid once counts one twelfth in each of the twelve months it covers on
-- the Subscriptions screen. Anything not listed covers its own month.
create table if not exists plan_periods (
  merchant text primary key,
  months   int  not null check (months between 1 and 36),
  created_at timestamptz not null default now()
);
alter table plan_periods enable row level security;
revoke all on plan_periods from anon;
grant select, insert, update, delete on plan_periods to authenticated;
drop policy if exists read_plan_periods on plan_periods;
create policy read_plan_periods  on plan_periods for select to authenticated using ((select is_household()));
drop policy if exists write_plan_periods on plan_periods;
create policy write_plan_periods on plan_periods for all to authenticated using ((select is_household())) with check ((select is_household()));

insert into plan_periods (merchant, months) values
  ('Crunchyroll', 12), ('Chess.com', 12), ('Sony LIV', 12), ('The Athletic', 12), ('Apple Developer', 12)
on conflict (merchant) do nothing;
