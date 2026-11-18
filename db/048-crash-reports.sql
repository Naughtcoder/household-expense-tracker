-- Android's own crash reports for the phone app (app/api/crash-report, CrashReports.java).
-- One row per native crash or freeze: the tombstone (native) or trace (freeze)
-- Android stored on the phone, gzipped, decoded on the Mac when needed.
-- 26 Oct 2026: the app crashed in native code at 21:51 on Sam's phone and the
-- exit record alone could not say where.
create table if not exists crash_reports (
  id           bigint generated always as identity primary key,
  person_id    uuid not null references people(id),
  crashed_at   timestamptz not null,
  reason       int not null,
  app_version  text,
  bytes        int not null,
  body         bytea not null,
  received_at  timestamptz not null default now(),
  unique (person_id, crashed_at)
);
alter table crash_reports enable row level security;
revoke all on crash_reports from anon, authenticated;
