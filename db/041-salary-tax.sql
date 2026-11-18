-- Tax taken out of a salary before it reaches the bank. No bank message ever
-- shows it, so it is kept as a monthly rate per person from a month onward.
-- The tax view counts it for every month that person's salary arrived (a
-- credit filed under Income > Salary), using the latest rate on or before it.
create table if not exists salary_tax_rates (
  id bigserial primary key,
  person_id uuid not null references people(id),
  from_month text not null check (from_month ~ '^\d{4}-\d{2}$'),
  monthly_tax numeric not null,
  basis text not null,
  unique (person_id, from_month)
);
alter table salary_tax_rates enable row level security;
create policy read_salary_tax  on salary_tax_rates for select to authenticated using (is_household());
create policy write_salary_tax on salary_tax_rates for insert to authenticated with check (is_household());
create policy edit_salary_tax  on salary_tax_rates for update to authenticated using (is_household());

-- Sample rows. Real rates are entered in the app per person.
insert into salary_tax_rates (person_id, from_month, monthly_tax, basis) values
  ('00000000-0000-4000-8000-dead00000001', '2026-04', 10000, 'Sample payslip TDS'),
  ('00000000-0000-4000-8000-dead00000002', '2026-04', 9000, 'Sample estimate')
on conflict (person_id, from_month) do nothing;
