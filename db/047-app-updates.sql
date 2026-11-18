-- Over-the-air updates for the phone app (app/api/updates, native/scripts/publish-update.mjs).
-- Each row is one published JavaScript bundle for one platform and native runtime.
-- The files themselves sit in the public storage bucket app-updates and never change.
create table if not exists app_updates (
  id              uuid primary key,
  runtime_version text not null,
  platform        text not null check (platform in ('android', 'ios')),
  manifest        jsonb not null,
  commit_sha      text,
  created_at      timestamptz not null default now()
);
create index if not exists app_updates_latest on app_updates (runtime_version, platform, created_at desc);
alter table app_updates enable row level security;
revoke all on app_updates from anon, authenticated;
