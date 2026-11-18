-- What each linked Android phone says about its payment readers: when the
-- screen reader starts or stops, when it hits an error, and once an hour.
-- 13 Oct 2026: Sam's screen reader kept turning itself off every day and
-- nothing noticed until she opened the app. The alarm job reads the latest
-- report per person and raises reader_off.
create table if not exists reader_status (
  id bigserial primary key,
  person_id uuid not null references people(id),
  at timestamptz not null default now(),
  received_at timestamptz not null default now(),
  event text not null,
  screen_reader boolean,
  notification_reader boolean,
  sms boolean,
  errors integer,
  detail text,
  app_version text
);
create index if not exists reader_status_person_at on reader_status (person_id, at desc);
alter table reader_status enable row level security;
create policy read_reader_status on reader_status for select to authenticated using (is_household());
