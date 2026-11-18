-- A tax view needs the tax payments sorted by kind. Tax (61) gains Income Tax
-- (advance and self-assessment challans) and Filing Fees (ClearTax). The
-- ClearTax fees of 2023 and 2025 had been filed under Utilities.
begin;
insert into categories (name, parent_id) values ('Income Tax', 61), ('Filing Fees', 61) on conflict do nothing;
update transactions set category_id = (select id from categories where name = 'Income Tax' and parent_id = 61)
  where category_id = 61 and merchant in ('Tax pay', 'TAX', 'CBDT TIN 2 0');
update transactions set category_id = (select id from categories where name = 'Filing Fees' and parent_id = 61)
  where merchant = 'Clear tax' and category_id in (61, 4);
commit;
