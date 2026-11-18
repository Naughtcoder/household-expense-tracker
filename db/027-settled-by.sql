-- Which repayment paid back which claim. A Employer payout on 30 Sep can
-- repay spending from July; with this link the payout lists exactly the
-- claims it covered, and each claim says which payout covered it.
alter table transactions add column if not exists settled_by uuid references transactions(id) on delete set null;
create index if not exists transactions_settled_by on transactions(settled_by);

-- Backfill: a claim marked settled on the day a Employer payout arrived (a day
-- either side, for how the dates were recorded) was settled by that payout.
update transactions c set settled_by = r.id
from transactions r
where r.scope = 'claimable' and r.direction = 'credit' and r.merchant = 'Employer claims repaid'
  and r.status not in ('duplicate', 'ignored')
  and c.scope = 'claimable' and c.direction = 'debit' and c.status not in ('duplicate', 'ignored')
  and c.paid_by = r.paid_by and coalesce(c.account_tail, '') <> '5555'
  and c.claim_settled_on between r.occurred_on - 1 and r.occurred_on + 1
  and c.settled_by is null;
