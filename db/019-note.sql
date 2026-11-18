-- A line of his own on any payment: what it was for, who it was with.
alter table transactions add column if not exists note text;
