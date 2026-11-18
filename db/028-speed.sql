-- Speed. The row rules called is_household() once per row read. Wrapped in a
-- select, Postgres runs it once per query and reuses the answer.
alter policy read_people on people using ((select is_household()));
alter policy read_settings on settings using ((select is_household()));
alter policy read_rules on merchant_rules using ((select is_household()));
alter policy write_rules on merchant_rules  with check ((select is_household()));
alter policy edit_rules on merchant_rules using ((select is_household()));
alter policy read_txns on transactions using ((select is_household()));
alter policy write_txns on transactions  with check ((select is_household()));
alter policy edit_txns on transactions using ((select is_household()));
alter policy read_unparsed on unparsed using ((select is_household()));
alter policy edit_unparsed on unparsed using ((select is_household()));
alter policy read_tags on tags using ((select is_household()));
alter policy write_tags on tags  with check ((select is_household()));
alter policy edit_tags on tags using ((select is_household()));
alter policy read_ttags on transaction_tags using ((select is_household()));
alter policy write_ttags on transaction_tags  with check ((select is_household()));
alter policy drop_ttags on transaction_tags using ((select is_household()));
alter policy drop_rules on merchant_rules using ((select is_household()));
alter policy drop_txns on transactions using ((select is_household()));
alter policy read_recurring on recurring using ((select is_household()));
alter policy write_recurring on recurring  with check ((select is_household()));
alter policy edit_recurring on recurring using ((select is_household()));
alter policy drop_recurring on recurring using ((select is_household()));
alter policy read_cats on categories using ((select is_household()));
alter policy hints_read on category_hints using ((select is_household()));
alter policy read_intake on intake_log using ((select is_household()));
alter policy read_budgets on budgets using ((select is_household()));
alter policy write_budgets on budgets  with check ((select is_household()));
alter policy edit_budgets on budgets using ((select is_household()));
alter policy drop_budgets on budgets using ((select is_household()));

-- The filters the drill-down screens use: by person, by category, by payee.
create index if not exists transactions_paid_by_on on transactions(paid_by, occurred_on desc);
create index if not exists transactions_category_on on transactions(category_id, occurred_on desc);
create index if not exists transactions_merchant_key on transactions(merchant_key);
