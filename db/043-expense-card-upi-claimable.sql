-- Pine Labs PlusPay texts name the payee "XXXPAY": that is ExpenseCard, Alex's
-- Employer UPI card. Every payment from it is claimable (Alex, 8 Oct 2026).
insert into merchant_rules (match_key, merchant, category_id, default_scope, ask, match_type)
select 'XXXPAY', 'ExpenseCard UPI', null, 'claimable', false, 'exact'
where not exists (select 1 from merchant_rules where match_key = 'XXXPAY');

update transactions set merchant = 'ExpenseCard UPI', scope = 'claimable', status = 'confirmed'
  where pattern_id = 'pinelabs-pluspay-upi' and merchant_key = 'XXXPAY' and scope = 'household';
