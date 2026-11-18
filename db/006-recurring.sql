-- Make recurring entries actually fire.
--
-- Rent, maintenance and household salaries are the three largest numbers in
-- the month, and none of them reliably generates a bank SMS. Rent goes out by
-- transfer. Until these post themselves, the monthly total understates by
-- roughly Rs 1.2L and no amount of message capture fixes it.

alter table recurring add column if not exists last_amount numeric(12,2);
alter table recurring add column if not exists paid_by uuid references people(id);
alter table recurring add column if not exists note text;

alter table transactions add column if not exists recurring_id int references recurring(id);
alter table transactions add column if not exists recurring_period text;   -- 'YYYY-MM'

-- One posting per recurring entry per month, enforced by the database so a
-- retried or double-fired job cannot duplicate rent.
create unique index if not exists transactions_one_per_recurring_period
  on transactions (recurring_id, recurring_period)
  where recurring_id is not null;

-- Attach the seeded entries to sensible categories and to Alex, who pays them.
update recurring r set category_id = c.id
from categories c
where c.name = 'Rent' and c.parent_id is not null and r.label = 'Rent' and r.category_id is null;

update recurring r set category_id = c.id
from categories c
where c.name = 'Maintenance' and r.label = 'Maintenance' and r.category_id is null;

update recurring r set category_id = c.id
from categories c
where c.name = 'Salaries' and c.parent_id is null and r.label like 'Maid%' and r.category_id is null;

update recurring set paid_by = (select id from people where name = 'Alex') where paid_by is null;

alter table recurring enable row level security;
revoke all on recurring from anon;
drop policy if exists read_recurring on recurring;
create policy read_recurring  on recurring for select to authenticated using (is_household());
create policy write_recurring on recurring for insert to authenticated with check (is_household());
create policy edit_recurring  on recurring for update to authenticated using (is_household());
create policy drop_recurring  on recurring for delete to authenticated using (is_household());
