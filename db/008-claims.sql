-- Claimable spend is money owed back, and until now there was no way to say
-- when it came back. Without that the outstanding figure only ever grows.

alter table transactions add column if not exists claim_settled_on date;

create index if not exists transactions_open_claims_idx
  on transactions (occurred_on desc)
  where scope = 'claimable' and claim_settled_on is null;
