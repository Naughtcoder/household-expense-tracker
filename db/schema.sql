-- Household tracker. Run this once in the Supabase SQL editor.
create extension if not exists pg_trgm;

create type scope       as enum ('household', 'personal', 'claimable');
create type txn_status  as enum ('confirmed', 'review', 'duplicate', 'ignored');
create type direction   as enum ('debit', 'credit');

-- Two rows. Each person's Shortcut sends a key; only its hash is stored.
create table people (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  auth_uid    uuid unique,                 -- links to the Supabase login
  key_hash    text not null                -- sha256 of the Shortcut key
);

-- One shared list. Nothing may be typed in at entry time.
create table categories (
  id        serial primary key,
  name      text not null,
  parent_id int references categories(id),
  unique (name, parent_id)
);

-- Learned merchant rules. Every review-queue decision writes one of these.
create table merchant_rules (
  id           serial primary key,
  match_key    text not null unique,       -- the cleaned descriptor, e.g. ZEPTO
  merchant     text not null,              -- display name, e.g. Zepto
  category_id  int references categories(id),
  default_scope scope not null default 'household',
  created_by   uuid references people(id),
  created_at   timestamptz not null default now()
);
create index on merchant_rules using gin (match_key gin_trgm_ops);

create table transactions (
  id            uuid primary key default gen_random_uuid(),
  amount        numeric(12,2) not null,
  direction     direction not null default 'debit',
  occurred_on   date not null,
  merchant_raw  text,                      -- exactly as the bank wrote it
  merchant_key  text,                      -- cleaned, joins to merchant_rules
  merchant      text,                      -- display name
  category_id   int references categories(id),
  paid_by       uuid not null references people(id),
  entered_by    uuid not null references people(id),
  scope         scope not null default 'household',
  status        txn_status not null default 'confirmed',
  bank          text,
  account_tail  text,                      -- last four only, never the full number
  pattern_id    text,                      -- which rule read it, for debugging
  flags         text[] not null default '{}',
  raw_text      text,
  duplicate_of  uuid references transactions(id),
  created_at    timestamptz not null default now(),
  -- A bank never sends the same amount, day, merchant and account twice
  -- except when it sends the same transaction twice.
  constraint one_per_bank_event unique nulls not distinct
    (amount, occurred_on, merchant_key, account_tail, direction)
);
create index on transactions (occurred_on desc);
create index on transactions (status) where status = 'review';

-- Rent, maintenance, the maid, cook, driver, subscriptions.
create table recurring (
  id           serial primary key,
  label        text not null,
  amount       numeric(12,2),              -- null when it varies
  day_of_month int not null check (day_of_month between 1 and 28),
  category_id  int references categories(id),
  paid_by      uuid references people(id),
  scope        scope not null default 'household',
  active       boolean not null default true
);

-- Anything the parser could not read. Never thrown away.
create table unparsed (
  id         uuid primary key default gen_random_uuid(),
  raw_text   text not null,
  entered_by uuid references people(id),
  created_at timestamptz not null default now(),
  resolved   boolean not null default false
);



-- Closest-match merchant lookup. Used only when there is no exact rule.
create or replace function closest_merchant(probe text)
returns setof merchant_rules language sql stable as $$
  select * from merchant_rules
  where similarity(match_key, probe) > 0.45
  order by similarity(match_key, probe) desc
  limit 1;
$$;

-- Small key-value store. Holds the combined take-home that Insights divides by.
create table settings (
  key   text primary key,
  value text not null
);

-- ---------------------------------------------------------------------------
-- Access control.
--
-- The anon key ships to every browser that loads the app, so it must reach
-- nothing. Signed-in people see the whole household, because that is the point
-- of a shared tracker. The only real secret in here is people.key_hash, and a
-- column grant keeps it out of reach even for them.
-- ---------------------------------------------------------------------------

alter table people          enable row level security;
alter table categories      enable row level security;
alter table merchant_rules  enable row level security;
alter table transactions    enable row level security;
alter table recurring       enable row level security;
alter table unparsed        enable row level security;
alter table settings        enable row level security;

-- Nothing at all for an unauthenticated caller.
revoke all on people, categories, merchant_rules, transactions, recurring, unparsed, settings from anon;

-- Names are needed to render "who paid". The key hash is not.
revoke select (key_hash) on people from authenticated;

create or replace function is_household()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from people where auth_uid = auth.uid());
$$;

create policy read_people    on people         for select to authenticated using (is_household());
create policy read_cats      on categories     for select to authenticated using (is_household());
create policy read_settings  on settings       for select to authenticated using (is_household());
create policy read_recurring on recurring      for select to authenticated using (is_household());

create policy read_rules     on merchant_rules for select to authenticated using (is_household());
create policy write_rules    on merchant_rules for insert to authenticated with check (is_household());
create policy edit_rules     on merchant_rules for update to authenticated using (is_household());

create policy read_txns      on transactions   for select to authenticated using (is_household());
create policy write_txns     on transactions   for insert to authenticated with check (is_household());
create policy edit_txns      on transactions   for update to authenticated using (is_household());

create policy read_unparsed  on unparsed       for select to authenticated using (is_household());
create policy edit_unparsed  on unparsed       for update to authenticated using (is_household());

-- The ingest endpoint runs as service_role, which bypasses all of the above by
-- design. That is why its key must never carry a NEXT_PUBLIC_ prefix.
