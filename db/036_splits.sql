-- Splitting one payment into parts, and planning a split before the payment
-- arrives. Asked for by Alex, 5 Oct 2026: one Rs 90,000 transfer to the
-- landlords is October rent, society maintenance, and the landlords paying
-- back repairs and electricity.
--
-- HOW A SPLIT IS STORED
-- The payment's own row becomes the first part: its amount drops to that
-- part's amount and it takes that part's category, scope and note. Each other
-- part is a new row pointing at it (split_of). The bank's amount stays on the
-- first row as split_total, and what the row was before is kept in
-- split_restore, so undoing a split puts it back exactly.
--
-- Why this way round, rather than keeping the payment whole and leaving it out
-- of the totals: about sixty queries on the website and the phone add up
-- payments, many with no status filter at all. Every one of them would have
-- had to learn a new "leave the whole payment out" rule, and any one missed
-- would count the payment twice. Stored this way, the parts add up to the
-- payment, so every existing total, and month_totals and spend_by_category,
-- stays right with no change. Only the code that recognises a payment the
-- bank sends twice has to know, and it is changed below and in lib/ingest.ts.
--
-- Run 5 Oct 2026 against production, one statement at a time.

alter table transactions add column if not exists split_of uuid references transactions(id) on delete cascade;

alter table transactions add column if not exists split_total numeric(12,2);

alter table transactions add column if not exists split_restore jsonb;

create index if not exists transactions_split_of on transactions (split_of) where split_of is not null;

-- The same bank payment twice is refused by this index. A split payment's
-- first row now carries a part's amount, so the index reads the bank's amount
-- (split_total) instead, and the other parts, which are not bank payments,
-- are left out of it. Built under a new name first so there is never a
-- moment without one.
create unique index if not exists transactions_one_per_bank_event_v2 on transactions
  ((coalesce(split_total, amount)), occurred_on, merchant_key, account_tail, direction)
  where pattern_id is distinct from 'bulk-import' and split_of is null;

drop index if exists transactions_one_per_bank_event;

alter index transactions_one_per_bank_event_v2 rename to transactions_one_per_bank_event;

-- Near-duplicates: compare the bank's amount, and never offer a part as the
-- twin of a new payment.
create or replace function possible_duplicates(
  p_amount   numeric,
  p_date     date,
  p_account  text,
  p_merchant text,
  p_direction text
)
returns setof transactions
language sql stable security invoker as $$
  select *
  from transactions t
  where t.direction = p_direction::direction
    and t.status not in ('duplicate', 'ignored')
    and t.split_of is null
    and t.occurred_on between p_date - 2 and p_date + 2
    and abs(coalesce(t.split_total, t.amount) - p_amount) <= greatest(p_amount * 0.01, 1)
    and (
      same_payee(t.merchant_key, p_merchant) is true
      or (same_payee(t.merchant_key, p_merchant) is null
          and p_account is not null and t.account_tail = p_account
          and t.occurred_on = p_date and coalesce(t.split_total, t.amount) = p_amount)
    )
  order by t.created_at desc
  limit 3;
$$;

grant execute on function possible_duplicates(numeric, date, text, text, text) to authenticated, service_role;

-- Split a payment, or change an existing split. p_parts is a list of
-- {amount, category_id, scope, note}; the first part stays on the payment's
-- own row. The parts must add up to the bank's amount to the paisa.
create or replace function split_payment(p_id uuid, p_parts jsonb)
returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  t transactions%rowtype;
  total numeric(12,2);
  n int;
  part jsonb;
  i int;
  child uuid;
begin
  select * into t from transactions where id = p_id for update;
  if not found then raise exception 'That payment was not found.'; end if;
  if t.split_of is not null then raise exception 'That is one part of a split payment. Open the whole payment to change it.'; end if;
  if t.direction <> 'debit' then raise exception 'Only money out can be split.'; end if;
  if jsonb_typeof(p_parts) <> 'array' then raise exception 'The parts must be a list.'; end if;
  n := jsonb_array_length(p_parts);
  if n < 2 then raise exception 'A split needs at least two parts.'; end if;
  total := coalesce(t.split_total, t.amount);
  if (select sum(round((x->>'amount')::numeric, 2)) from jsonb_array_elements(p_parts) x) <> total then
    raise exception 'The parts add up to %, not the payment''s %.',
      (select sum(round((x->>'amount')::numeric, 2)) from jsonb_array_elements(p_parts) x), total;
  end if;
  for i in 0 .. n - 1 loop
    part := p_parts->i;
    if coalesce(round((part->>'amount')::numeric, 2), 0) = 0 then raise exception 'Part % has no amount.', i + 1; end if;
    if coalesce(part->>'scope', 'household') not in ('household', 'claimable', 'investment', 'transfer') then
      raise exception 'Part % has an unknown "for".', i + 1;
    end if;
    if part->>'category_id' is null and coalesce(part->>'scope', 'household') not in ('transfer', 'investment') then
      raise exception 'Part % needs a category.', i + 1;
    end if;
  end loop;

  perform set_config('splits.busy', '1', true);

  -- Changing an existing split: the old parts go, the new ones replace them.
  delete from transactions where split_of = t.id;

  part := p_parts->0;
  update transactions set
    amount = round((part->>'amount')::numeric, 2),
    category_id = (part->>'category_id')::int,
    scope = coalesce(part->>'scope', 'household')::scope,
    note = nullif(part->>'note', ''),
    split_total = total,
    split_restore = coalesce(t.split_restore, jsonb_build_object(
      'amount', t.amount, 'category_id', t.category_id, 'scope', t.scope, 'note', t.note)),
    status = case when t.status = 'review' then 'confirmed'::txn_status else t.status end,
    flags = array_remove(t.flags, 'planned-split')
  where id = t.id;

  for i in 1 .. n - 1 loop
    part := p_parts->i;
    insert into transactions (amount, currency, direction, occurred_on, occurred_at, merchant_raw, merchant_key,
      merchant, category_id, paid_by, entered_by, scope, status, bank, account_tail, pattern_id, flags, note,
      split_of, covered_by)
    values (round((part->>'amount')::numeric, 2), t.currency, t.direction, t.occurred_on, t.occurred_at,
      t.merchant_raw, t.merchant_key, t.merchant, (part->>'category_id')::int, t.paid_by, t.entered_by,
      coalesce(part->>'scope', 'household')::scope,
      case when t.status in ('duplicate', 'ignored') then t.status else 'confirmed'::txn_status end,
      t.bank, t.account_tail, 'split', array['split'], nullif(part->>'note', ''), t.id, t.covered_by)
    returning id into child;
    -- A part of a trip payment is on the trip too.
    insert into transaction_tags (transaction_id, tag_id)
      select child, tag_id from transaction_tags where transaction_id = t.id
      on conflict do nothing;
  end loop;

  perform set_config('splits.busy', '', true);
  return t.id;
end $$;

grant execute on function split_payment(uuid, jsonb) to authenticated, service_role;

-- Put a split payment back as one. Takes the payment or any of its parts.
create or replace function unsplit_payment(p_id uuid)
returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  root uuid;
  t transactions%rowtype;
begin
  select coalesce(split_of, id) into root from transactions where id = p_id;
  if root is null then raise exception 'That payment was not found.'; end if;
  select * into t from transactions where id = root for update;
  if t.split_total is null then raise exception 'That payment is not split.'; end if;
  perform set_config('splits.busy', '1', true);
  delete from transactions where split_of = root;
  update transactions set
    amount = t.split_total,
    category_id = (t.split_restore->>'category_id')::int,
    scope = coalesce(t.split_restore->>'scope', t.scope::text)::scope,
    note = t.split_restore->>'note',
    split_total = null,
    split_restore = null
  where id = root;
  -- A plan that was applied here is open again, so it can be used once more.
  update planned_splits set status = 'open', applied_to = null, applied_at = null where applied_to = root;
  perform set_config('splits.busy', '', true);
  return root;
end $$;

grant execute on function unsplit_payment(uuid) to authenticated, service_role;

-- The parts of a split are one payment. The amount of any of them can only
-- change through split_payment, or the parts would stop adding up to what the
-- bank took. The date, who paid, the payee, and being a duplicate or ignored
-- belong to the payment, so a change to one part is made to all of them.
create or replace function split_guard()
returns trigger language plpgsql as $$
begin
  if coalesce(current_setting('splits.busy', true), '') = '1' then return new; end if;
  if (old.split_of is not null or old.split_total is not null)
     and (new.amount is distinct from old.amount or new.direction is distinct from old.direction
          or new.split_of is distinct from old.split_of or new.split_total is distinct from old.split_total) then
    raise exception 'This payment is split into parts. Change the amounts with Edit the split.';
  end if;
  return new;
end $$;

drop trigger if exists split_guard on transactions;

create trigger split_guard before update on transactions
  for each row execute function split_guard();

create or replace function split_keep_together()
returns trigger language plpgsql as $$
declare
  root uuid;
  gone_old boolean := old.status in ('duplicate', 'ignored');
  gone_new boolean := new.status in ('duplicate', 'ignored');
begin
  if pg_trigger_depth() > 1 then return null; end if;
  if coalesce(current_setting('splits.busy', true), '') = '1' then return null; end if;
  if new.split_of is null and new.split_total is null then return null; end if;
  root := coalesce(new.split_of, new.id);
  if (new.occurred_on, new.occurred_at, new.paid_by, new.merchant, new.merchant_key, new.covered_by)
       is distinct from (old.occurred_on, old.occurred_at, old.paid_by, old.merchant, old.merchant_key, old.covered_by)
     or gone_old <> gone_new then
    update transactions set
      occurred_on = new.occurred_on, occurred_at = new.occurred_at, paid_by = new.paid_by,
      merchant = new.merchant, merchant_key = new.merchant_key, covered_by = new.covered_by,
      status = case when gone_old <> gone_new then new.status else status end
    where (id = root or split_of = root) and id <> new.id;
  end if;
  return null;
end $$;

drop trigger if exists split_keep_together on transactions;

create trigger split_keep_together after update on transactions
  for each row execute function split_keep_together();

-- One part of a split cannot be deleted on its own: the others would no
-- longer add up to what the bank took. Deleting the whole payment deletes
-- every part (on delete cascade), which this lets through.
create or replace function split_part_delete_guard()
returns trigger language plpgsql as $$
begin
  if coalesce(current_setting('splits.busy', true), '') = '1' then return old; end if;
  if old.split_of is not null and exists (select 1 from transactions where id = old.split_of) then
    raise exception 'This is one part of a split payment. Delete the whole payment, or put it back as one first.';
  end if;
  return old;
end $$;

drop trigger if exists split_part_delete_guard on transactions;

create trigger split_part_delete_guard before delete on transactions
  for each row execute function split_part_delete_guard();

-- A split planned before the payment happens. When a payment from the same
-- person arrives inside the window, to the payee named (any of the words
-- between | match) or for exactly the expected amount, and the amount is
-- within the tolerance, the plan is applied by itself. A payee match at a
-- different amount waits in Review for a person to decide.
create table if not exists planned_splits (
  id              uuid primary key default gen_random_uuid(),
  paid_by         uuid not null references people(id),
  payee_hint      text,
  expected_amount numeric(12,2) not null check (expected_amount > 0),
  tolerance       numeric(12,2) not null default 0 check (tolerance >= 0),
  window_from     date not null,
  window_to       date not null,
  parts           jsonb not null check (jsonb_typeof(parts) = 'array' and jsonb_array_length(parts) >= 2),
  note            text,
  status          text not null default 'open' check (status in ('open', 'applied', 'cancelled')),
  applied_to      uuid references transactions(id) on delete set null,
  applied_at      timestamptz,
  created_by      uuid references people(id),
  created_at      timestamptz not null default now(),
  check (window_to >= window_from)
);

-- One plan, one payment: a plan can never be applied twice, and a payment
-- never takes two plans.
create unique index if not exists planned_splits_applied_once on planned_splits (applied_to) where applied_to is not null;

create index if not exists planned_splits_open on planned_splits (paid_by, window_from, window_to) where status = 'open';

alter table planned_splits enable row level security;

drop policy if exists plans_all on planned_splits;

create policy plans_all on planned_splits for all using ((select is_household())) with check ((select is_household()));

grant select, insert, update, delete on planned_splits to authenticated;

-- Applies a plan to a payment, with the plan's parts or edited ones, and
-- marks it used, in one step. Refuses a plan already used or cancelled.
create or replace function apply_planned_split(p_plan uuid, p_txn uuid, p_parts jsonb default null)
returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  pl planned_splits%rowtype;
begin
  select * into pl from planned_splits where id = p_plan for update;
  if not found then raise exception 'That plan was not found.'; end if;
  if pl.status <> 'open' then raise exception 'That plan has already been used or was cancelled.'; end if;
  perform split_payment(p_txn, coalesce(p_parts, pl.parts));
  update planned_splits set status = 'applied', applied_to = p_txn, applied_at = now() where id = p_plan;
  return p_txn;
end $$;

grant execute on function apply_planned_split(uuid, uuid, jsonb) to authenticated, service_role;
