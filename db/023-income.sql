-- Money in gets its own categories. Until now the books only held spending
-- properly: salary, bank interest, insurance refunds and friends paying back
-- arrived by email and were never booked.
insert into categories (name, parent_id) select 'Income', null
where not exists (select 1 from categories where name = 'Income' and parent_id is null);
insert into categories (name, parent_id)
select n, (select id from categories where name = 'Income' and parent_id is null)
from unnest(array['Salary', 'Interest', 'Refunds', 'Paid back', 'Other income']) n
where not exists (select 1 from categories c where c.name = n and c.parent_id = (select id from categories where name = 'Income' and parent_id is null));
