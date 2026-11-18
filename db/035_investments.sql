-- Investments get a category of their own, so a Zerodha payment shows an
-- icon and a name instead of "No category". Ruled by Alex, 5 Oct 2026.
--
-- One group, no subcategories: which platform the money went to is already
-- the payment's payee (Zerodha (ICCL), SBI fixed deposit), so it is not
-- repeated as a category.
--
-- The scope stays 'investment', so spending and income totals do not move.
-- Run 5 Oct 2026 against production; month_totals for Jul to Oct 2026 were
-- the same before and after.

insert into categories (name, parent_id)
select 'Investments', null
where not exists (select 1 from categories where lower(name) = 'investments');

-- File every investment payment there.
update transactions
set category_id = (select id from categories where name = 'Investments' and parent_id is null)
where scope = 'investment' and category_id is null;

-- Zerodha payments file themselves to Investments, scope investment. The
-- two rules already existed (ids 65 and 66) with no category.
update merchant_rules
set category_id = (select id from categories where name = 'Investments' and parent_id is null),
    default_scope = 'investment', ask = false
where match_key in ('INDIAN CLEARING CORPORATION', 'INDIAN CLEARING CORPOR');

-- 5 Oct 2026, Alex: a new fixed deposit files itself to Investments.
-- Money out only; the closing credit ("DEP TFR OF MRS ...") is too generic to match safely.
insert into merchant_rules (match_key, match_type, merchant, category_id, default_scope, ask, direction, created_by)
values ('FIXED DEPOSIT', 'contains', 'SBI fixed deposit', 79, 'investment', false, 'debit', '00000000-0000-4000-8000-dead00000001');
