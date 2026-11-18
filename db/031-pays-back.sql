-- A friend paying back their share points at the payment it repays (the
-- restaurant bill he paid for the table), so that payment can show what it
-- cost him once everyone settled up.
alter table transactions add column if not exists pays_back uuid references transactions(id) on delete set null;
create index if not exists transactions_pays_back on transactions (pays_back) where pays_back is not null;
