-- A receipt for every message the app is handed.
--
-- On 28 September a Rs 280 payment never arrived and nothing anywhere could say
-- whether the phone failed to send it or the app failed to keep it. This table
-- is that missing record. It holds counts and a fingerprint, never the message
-- itself, because the phone posts some texts that are nobody's business.

create table if not exists intake_log (
  id          bigserial primary key,
  at          timestamptz not null default now(),
  person_id   uuid references people(id),
  source      text not null,          -- sms-auto, sms-hand, email:<inbox>
  sender      text,                   -- the email's From, null for SMS
  saved       int not null default 0,
  duplicates  int not null default 0,
  refused     int not null default 0,
  unreadable  int not null default 0,
  error       text,
  text_sha    text
);
create index if not exists intake_log_source_at on intake_log (source, at desc);

alter table intake_log enable row level security;
revoke all on intake_log from anon;
create policy read_intake on intake_log for select to authenticated using (is_household());
