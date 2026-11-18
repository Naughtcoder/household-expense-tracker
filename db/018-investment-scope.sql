-- Investments are money moved, not money spent. A third scope keeps them out
-- of every spending total while still recording them.
--
-- Run the first statement on its own. Postgres will not let a new enum value
-- be used in the same transaction that adds it.

alter type scope add value if not exists 'investment';

-- Zerodha buys arrive as payments to the Indian Clearing Corporation, in two
-- spellings: the email names it in full, the SMS cuts it at 22 characters.
insert into merchant_rules (match_key, merchant, category_id, default_scope)
values ('INDIAN CLEARING CORPORATION', 'Zerodha (ICCL)', null, 'investment'),
       ('INDIAN CLEARING CORPOR',      'Zerodha (ICCL)', null, 'investment')
on conflict (match_key) do update
  set merchant = excluded.merchant, category_id = null, default_scope = 'investment';

update transactions
   set scope = 'investment', status = 'confirmed', category_id = null, merchant = 'Zerodha (ICCL)'
 where merchant_key in ('INDIAN CLEARING CORPORATION', 'INDIAN CLEARING CORPOR')
   and status = 'review';
