-- Categories, taken from the ones Alex already uses in Money Manager.
insert into categories (name) values
  ('Rent'), ('Food'), ('Transportation'), ('Utilities'), ('Household'),
  ('Health'), ('Apparel'), ('Entertainment'), ('Travel'), ('Hotel'),
  ('Salaries'), ('Beauty'), ('Culture'), ('Consulting tools'), ('Other')
on conflict do nothing;

-- Recurring entries, from his real ledger.
-- Rent is Rs 40,000 and he pays all of it. Maintenance is billed separately.
insert into recurring (label, amount, day_of_month, scope) values
  ('Rent', 50000, 1, 'household'),
  ('Maintenance', null, 12, 'household'),
  ('Maid, cook and driver', 10000, 1, 'household')
on conflict do nothing;

-- Combined monthly take-home. Alex 5,00,000 plus Sam 5,00,000.
insert into settings (key, value) values ('monthly_take_home', '1000000')
on conflict (key) do update set value = excluded.value;
