-- The yearly salary behind a rate, when it was worked out from one, so the
-- tax view can show it and a person can update it.
alter table salary_tax_rates add column if not exists annual_salary numeric;
