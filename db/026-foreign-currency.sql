-- Money in another currency is stored in rupees, so every total stays right,
-- with the original amount and currency kept beside it. Rates are the
-- European Central Bank's for the payment's day, cached here.
alter table transactions add column if not exists original_amount numeric(14,2);
alter table transactions add column if not exists original_currency text;
create table if not exists fx_rates (
  day date not null,
  currency text not null,
  inr numeric(12,5) not null,
  primary key (day, currency)
);
alter table fx_rates enable row level security;
grant select on fx_rates to authenticated;
drop policy if exists read_fx on fx_rates;
create policy read_fx on fx_rates for select to authenticated using (true);
