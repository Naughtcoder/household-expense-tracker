-- One name per place in the category tree.
-- The old unique (name, parent_id) let top-level names repeat, because NULL
-- never equals NULL, and the phone's category sheet inserted without checking.
-- That left four stray top-level groups (Utilities x2, Utility x2) holding the
-- 7 Oct Jio and Bharat Connect payments. Move those back and drop the strays.

begin;

update transactions set category_id = 34 where id = '00000000-0000-4000-8000-dead00000008'; -- Jio Rs 349 -> Utilities > Phone
update transactions set category_id = 4  where category_id in (80, 81, 82, 83);              -- Bharat Connect -> Utilities
delete from categories where id in (80, 81, 82, 83) and parent_id is null;

-- Case-blind, and a top-level name counts as being under "0".
create unique index if not exists categories_one_name_per_place
  on categories (lower(name), coalesce(parent_id, 0));

commit;
