-- A gap alarm remembers the stretch a phone recorded nothing (lib/alarms.ts),
-- so its counts can be refreshed and its payments matched to those days.
alter table alarms add column if not exists gap_from timestamptz;
alter table alarms add column if not exists gap_to timestamptz;
