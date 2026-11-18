-- Run this after db/schema.sql.
--
-- The first policies let any signed-in user read everything. With sign-ups
-- open, a stranger who found the URL could create an account and see the
-- household's finances. These replace "is signed in" with "is one of the two
-- people in the people table".
--
-- Someone who signs up but is not linked now sees an empty app instead.

create or replace function is_household()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from people where auth_uid = auth.uid());
$$;

drop policy if exists read_people    on people;
drop policy if exists read_cats      on categories;
drop policy if exists read_settings  on settings;
drop policy if exists read_recurring on recurring;
drop policy if exists read_rules     on merchant_rules;
drop policy if exists write_rules    on merchant_rules;
drop policy if exists edit_rules     on merchant_rules;
drop policy if exists read_txns      on transactions;
drop policy if exists write_txns     on transactions;
drop policy if exists edit_txns      on transactions;
drop policy if exists read_unparsed  on unparsed;
drop policy if exists edit_unparsed  on unparsed;

create policy read_people    on people         for select to authenticated using (is_household());
create policy read_cats      on categories     for select to authenticated using (is_household());
create policy read_settings  on settings       for select to authenticated using (is_household());
create policy read_recurring on recurring      for select to authenticated using (is_household());

create policy read_rules     on merchant_rules for select to authenticated using (is_household());
create policy write_rules    on merchant_rules for insert to authenticated with check (is_household());
create policy edit_rules     on merchant_rules for update to authenticated using (is_household());

create policy read_txns      on transactions   for select to authenticated using (is_household());
create policy write_txns     on transactions   for insert to authenticated with check (is_household());
create policy edit_txns      on transactions   for update to authenticated using (is_household());

create policy read_unparsed  on unparsed       for select to authenticated using (is_household());
create policy edit_unparsed  on unparsed       for update to authenticated using (is_household());
