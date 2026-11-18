-- Foreign spend and running balances.
--
-- Indian cards report overseas purchases in the original currency, so an
-- amount without a currency is a guess. And most Indian banks put the account
-- balance in the same message; keeping it gives an Accounts view for free, and
-- a way to tell whether the tracker saw everything.

alter table transactions add column if not exists currency text not null default 'INR';
alter table transactions add column if not exists balance numeric(14,2);

-- Finding the newest balance per account is the only query that needs it.
create index if not exists transactions_account_balance_idx
  on transactions (bank, account_tail, occurred_on desc)
  where balance is not null;
