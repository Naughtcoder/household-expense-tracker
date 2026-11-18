-- Subcategories. The categories table already had parent_id; this fills it in.
-- Existing top-level rows stay exactly as they are, so nothing already filed
-- gets orphaned. Children are added underneath them.

insert into categories (name, parent_id)
select c.name, p.id from (values
  ('Rent',           'Rent'),
  ('Rent',           'Maintenance'),
  ('Rent',           'Deposit'),

  ('Food',           'Groceries'),
  ('Food',           'Delivery'),
  ('Food',           'Eating out'),
  ('Food',           'Indulgence'),

  ('Household',      'Electronics'),
  ('Household',      'Furniture'),
  ('Household',      'Appliances'),
  ('Household',      'Repairs'),
  ('Household',      'Supplies'),

  ('Transportation', 'Taxi'),
  ('Transportation', 'Fuel'),
  ('Transportation', 'Car'),
  ('Transportation', 'Parking and tolls'),

  ('Utilities',      'Power'),
  ('Utilities',      'Internet'),
  ('Utilities',      'Phone'),
  ('Utilities',      'Gas'),
  ('Utilities',      'Subscriptions'),

  ('Health',         'Pharmacy'),
  ('Health',         'Doctor'),
  ('Health',         'Hospital'),
  ('Health',         'Gym'),
  ('Health',         'Insurance'),

  ('Apparel',        'Clothing'),
  ('Apparel',        'Footwear'),
  ('Apparel',        'Accessories'),

  ('Entertainment',  'Going out'),
  ('Entertainment',  'Events'),
  ('Entertainment',  'Streaming'),

  ('Travel',         'Flights'),
  ('Travel',         'Hotels'),
  ('Travel',         'Local transport'),
  ('Travel',         'Visas'),

  ('Salaries',       'Maid'),
  ('Salaries',       'Cook'),
  ('Salaries',       'Driver'),

  ('Beauty',         'Haircut'),
  ('Beauty',         'Self-care'),

  ('Other',          'Gifts'),
  ('Other',          'Charity')
) as c(parent, name)
join categories p on p.name = c.parent and p.parent_id is null
on conflict do nothing;
