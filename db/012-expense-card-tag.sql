-- The ExpenseCard tag says where a claim goes.
--
-- Card 5555 (the Pine Labs prepaid card) is his Employer expense card, issued
-- through ExpenseCard. A claimable spend on it is settled by attaching the bill in
-- ExpenseCard. A claimable spend anywhere else is claimed through XPayroll. The tag
-- is what tells the two apart at a glance, so it is applied by the database
-- and never left to memory.

insert into tags (name) values ('ExpenseCard') on conflict do nothing;

create or replace function tag_expensecard() returns trigger
language plpgsql security definer set search_path = public as $$
declare expensecard int := (select id from tags where name = 'ExpenseCard');
begin
  if new.account_tail = '5555' and new.scope = 'claimable' then
    insert into transaction_tags (transaction_id, tag_id)
    values (new.id, expensecard) on conflict do nothing;
  else
    -- Moved out of claimable, so it no longer needs claiming anywhere.
    delete from transaction_tags where transaction_id = new.id and tag_id = expensecard;
  end if;
  return new;
end $$;

drop trigger if exists tag_expensecard on transactions;
create trigger tag_expensecard after insert or update of scope, account_tail on transactions
  for each row execute function tag_expensecard();

-- Backfill what is already there.
insert into transaction_tags (transaction_id, tag_id)
select t.id, (select id from tags where name = 'ExpenseCard')
from transactions t where t.account_tail = '5555' and t.scope = 'claimable'
on conflict do nothing;
