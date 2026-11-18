-- Alarms the website raises when something fails silently: a phone that has
-- stopped sending, a bank text nothing could read. One open row per kind and
-- person; cleared_at is set when the cause goes away. The app shows open
-- ones as a banner; the alarm job notifies the phones when one opens.
create table if not exists alarms (
  id bigserial primary key,
  kind text not null,
  person_id uuid references people(id),
  message text not null,
  raised_at timestamptz not null default now(),
  last_notified_at timestamptz,
  cleared_at timestamptz
);
create unique index if not exists alarms_one_open on alarms (kind, coalesce(person_id, '00000000-0000-4000-8000-dead00000007')) where cleared_at is null;
alter table alarms enable row level security;
create policy read_alarms on alarms for select to authenticated using (is_household());
create policy edit_alarms on alarms for update to authenticated using (is_household());
