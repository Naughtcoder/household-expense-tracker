-- The rule builder. A rule was one payee key and what to file it as. Now it
-- can also match on part of the payee's name, and only fire for a range of
-- amounts, one person's payments, or money in rather than out.
--
-- Every existing row becomes an "is exactly" rule with no conditions, which
-- is exactly what it did before. No row is changed or removed.
--
-- `merchant` stays the "show it as" name. It may now be empty, so a rule that
-- matches part of many names can leave each payment's own name alone.

alter table merchant_rules add column if not exists match_type text not null default 'exact'
  check (match_type in ('exact', 'contains', 'starts'));

alter table merchant_rules add column if not exists min_amount numeric(12,2);

alter table merchant_rules add column if not exists max_amount numeric(12,2);

alter table merchant_rules add column if not exists paid_by uuid references people(id);

alter table merchant_rules add column if not exists direction text check (direction in ('debit', 'credit'));

alter table merchant_rules alter column merchant drop not null;

-- One text for how a rule matches, so the same payee text can carry an
-- "is exactly" rule and a "contains" rule, or a plain rule and one for big
-- amounts only. A plain rule (exact, no conditions) reads 'exact||||'.
alter table merchant_rules add column if not exists rule_shape text generated always as (
  match_type || '|' || coalesce(min_amount::text, '') || '|' || coalesce(max_amount::text, '')
  || '|' || coalesce(paid_by::text, '') || '|' || coalesce(direction, '')
) stored;

-- Review writes plain rules with upsert on (match_key, rule_shape), so this
-- unique index must exist before the old one goes.
create unique index if not exists merchant_rules_key_shape on merchant_rules (match_key, rule_shape);

-- Run this one only after the website with the rule builder is deployed: the
-- code live before it upserts on (match_key) alone, which needs the old
-- constraint. Until then a second rule on the same payee text is refused
-- with a plain message, and nothing else changes.
alter table merchant_rules drop constraint if exists merchant_rules_match_key_key;

-- The close-match lookup only ever stands in for a plain rule. A rule with
-- conditions, or one that matches part of a name, is never guessed at.
create or replace function closest_merchant(probe text)
returns setof merchant_rules language sql stable as $$
  select * from merchant_rules
  where rule_shape = 'exact||||'
    and similarity(match_key, probe) > 0.45
  order by similarity(match_key, probe) desc
  limit 1;
$$;

-- Past payments whose payee text matches, for the builder's preview and for
-- applying a rule to the past. The other conditions are added by the caller.
-- Plain text comparison, so no character in the payee text acts as a wildcard.
create or replace function rule_text_matches(p_text text, p_type text)
returns setof transactions language sql stable security invoker as $$
  select * from transactions t
  where case p_type
    when 'exact' then t.merchant_key = p_text
    when 'starts' then left(upper(coalesce(t.merchant_key, '')), length(p_text)) = upper(p_text)
                    or left(upper(coalesce(t.merchant_raw, '')), length(p_text)) = upper(p_text)
    when 'contains' then strpos(upper(coalesce(t.merchant_key, '')), upper(p_text)) > 0
                      or strpos(upper(coalesce(t.merchant_raw, '')), upper(p_text)) > 0
    else false
  end
$$;

grant execute on function rule_text_matches(text, text) to authenticated;
