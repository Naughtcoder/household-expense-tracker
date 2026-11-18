-- Tags, a second axis alongside categories.
--
-- A category answers what kind of spend it was. A tag answers which thing it
-- belonged to. The Goa trip crossed Food, Travel, Hotel and Transportation;
-- no category tree can hold that without distorting itself.

create table if not exists tags (
  id       serial primary key,
  name     text not null unique,
  colour   text not null default '#4704E9',
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists transaction_tags (
  transaction_id uuid not null references transactions(id) on delete cascade,
  tag_id         int  not null references tags(id) on delete cascade,
  primary key (transaction_id, tag_id)
);
create index if not exists transaction_tags_tag_idx on transaction_tags (tag_id);

alter table tags enable row level security;
alter table transaction_tags enable row level security;
revoke all on tags, transaction_tags from anon;

create policy read_tags   on tags for select to authenticated using (is_household());
create policy write_tags  on tags for insert to authenticated with check (is_household());
create policy edit_tags   on tags for update to authenticated using (is_household());

create policy read_ttags  on transaction_tags for select to authenticated using (is_household());
create policy write_ttags on transaction_tags for insert to authenticated with check (is_household());
create policy drop_ttags  on transaction_tags for delete to authenticated using (is_household());

-- Rules and transactions both need deleting now that they are editable.
create policy drop_rules on merchant_rules for delete to authenticated using (is_household());
create policy drop_txns  on transactions   for delete to authenticated using (is_household());

insert into tags (name) values ('Goa 2026'), ('Holiday'), ('Moving house') on conflict do nothing;
