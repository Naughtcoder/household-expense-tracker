-- The Month screen was labelling everything Uncategorised while 58 categories
-- sat in the table, which means the signed-in session could not read them.
--
-- Rebuilding the policy rather than guessing at why. is_household() is marked
-- security definer so it can see the people table regardless of policy, and
-- it is granted to authenticated explicitly here.

grant execute on function is_household() to authenticated;
grant select on categories, people, settings, recurring, tags to authenticated;
grant select, insert, update on merchant_rules to authenticated;
grant select, insert, update, delete on transactions, transaction_tags to authenticated;
grant select, update on unparsed to authenticated;
grant usage, select on all sequences in schema public to authenticated;

drop policy if exists read_cats on categories;
create policy read_cats on categories for select to authenticated using (is_household());

-- Prove it from here: this should return 58 rows, not 0.
select count(*) as categories_visible_to_the_app from categories;
