-- A rule can file a payment under a broad category and still ask which exact
-- one. Swiggy is always Food in Alex's history, but sometimes Groceries,
-- sometimes Indulgence, sometimes Eating out; only he knows which.
alter table merchant_rules add column if not exists ask boolean not null default false;
