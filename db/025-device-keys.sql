-- One key per linked phone, so the Android app can send bank texts without
-- a password stored in it. Only the hash is kept; the key itself is shown to
-- the phone once, at linking. Revoking a phone is deleting its row.
create table if not exists device_keys (
  id          bigint generated always as identity primary key,
  person_id   uuid not null references people(id) on delete cascade,
  key_hash    text not null unique,
  label       text,
  created_at  timestamptz not null default now(),
  last_used   timestamptz
);
alter table device_keys enable row level security;
-- No policies: only the server, with the service key, reads or writes these.
