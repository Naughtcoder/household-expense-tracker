-- What the words in a merchant name suggest, learned from Alex's own labels.
--
-- The exact-merchant lookup in ingest.ts covers a merchant seen before. This
-- covers the first sighting: RAVI KUMAR RAO TEA SHOP has never appeared, but
-- TEA and SHOP have, and they point somewhere.
--
-- Measured by holding every one of the 795 known merchants out in turn and
-- predicting it from the rest: it ventures a guess on 25% of them and is right
-- 91% of the time. That is good enough to pre-fill a suggestion, and nowhere
-- near good enough to file something silently, so a hint always lands in
-- Review.

create table if not exists category_hints (
  token       text    not null,
  category_id integer not null references categories(id) on delete cascade,
  seen        integer not null,
  share       real    not null,
  primary key (token, category_id)
);

create index if not exists category_hints_token_idx on category_hints (token);

alter table category_hints enable row level security;
drop policy if exists hints_read on category_hints;
create policy hints_read on category_hints for select using (is_household());
grant select on category_hints to authenticated;

-- Words that say nothing about what was bought: the bank's own scaffolding,
-- and the filler that appears in every third merchant name.
create or replace function hint_stopword(w text) returns boolean language sql immutable as $$
  select w = any (array[
    'POS','VS','UPI','ATM','VISACWD','DT','REF','CARD','BANK','BankA','ICICI','SBI','KOTAK',
    'INR','RS','THE','AND','FOR','PVT','LTD','LIMITED','PRIVATE','INDIA','COM','WWW',
    'NOT','YOU','CALL','ON','AT','TO','FROM','PAYMENT','PAY','TXN','TRANSACTION'])
$$;

create or replace function rebuild_category_hints() returns integer
language plpgsql security definer set search_path = public as $$
declare written integer;
begin
  delete from category_hints;

  insert into category_hints (token, category_id, seen, share)
  with labelled as (
    -- One row per merchant, not per transaction, so a merchant used a hundred
    -- times does not drown out ninety others.
    select distinct on (coalesce(t.merchant_key, t.merchant_raw))
           coalesce(t.merchant_key, t.merchant_raw) as key,
           coalesce(t.merchant_raw, t.merchant_key) as txt,
           coalesce(p.id, ct.id) as cat
    from transactions t
    join categories ct on ct.id = t.category_id
    left join categories p on p.id = ct.parent_id
    where t.direction = 'debit'
      and coalesce(t.merchant_key, t.merchant_raw) is not null
  ), words as (
    select l.cat, w.token
    from labelled l,
         lateral unnest(regexp_split_to_array(upper(l.txt), '[^A-Z]+')) as w(token)
    where length(w.token) between 3 and 18
      and not hint_stopword(w.token)
  ), tally as (
    select token, cat, count(*)::int as n from words group by token, cat
  ), totals as (
    select token, sum(n)::int as total from tally group by token
  )
  select t.token, t.cat, t.n, (t.n::real / tt.total)
  from tally t join totals tt using (token)
  -- Three sightings and seven in ten pointing the same way. Looser than this
  -- and the wrong suggestions outgrow the useful ones.
  where tt.total >= 3 and (t.n::real / tt.total) >= 0.7;

  get diagnostics written = row_count;
  return written;
end $$;

select rebuild_category_hints();
