-- Phone notifications for payments that need a category.
--
-- push_config holds the app's signing keys. It has row level security and no
-- policies, so only the server, with the service key, can read it.
create table if not exists push_config (
  key   text primary key,
  value text not null
);
alter table push_config enable row level security;
revoke all on push_config from anon, authenticated;

-- One row per phone or browser that said yes to notifications.
create table if not exists push_subscriptions (
  endpoint   text primary key,
  person_id  uuid not null references people(id) on delete cascade,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now()
);
alter table push_subscriptions enable row level security;
revoke all on push_subscriptions from anon, authenticated;
