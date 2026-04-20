-- Draft Punk Craft Cafe - Seed initial ingredient prices from Food-Ingredients-Prices.csv
-- Issue #13: map CSV source-of-truth to existing recipe ingredients only.
-- For ranged prices in the CSV (for example PHP 140-155/kg), the lower bound is used.

with existing_recipe_ingredients as (
  select distinct
    lower(trim(name)) as name_key,
    lower(trim(unit)) as unit_key
  from public.product_ingredients
),
price_seed(name, unit, price_amount, price_basis_quantity, price_basis_unit, source_label) as (
  values
    ('Pork Belly', 'kg', 320, 1, 'kg', 'Pork belly - PHP 320/kg'),
    ('Pork', 'g', 300, 1, 'kg', 'Pork (general) - PHP 300/kg'),
    ('Boneless Pork Chop', 'g', 340, 1, 'kg', 'Boneless pork chop - PHP 340/kg'),
    ('Chicken liver', 'g', 180, 1, 'kg', 'Chicken liver - PHP 180/kg'),
    ('Eggs', 'large', 280, 30, 'pcs', 'Eggs - PHP 280/tray (30pcs)'),
    ('Salt', 'g', 40, 1, 'kg', 'Salt - PHP 40/kg'),
    ('Fine sea salt', 'g', 30, 1, 'kg', 'Coarse sea salt - PHP 30/kg'),
    ('Black pepper', 'g', 600, 1, 'kg', 'Black pepper - PHP 600/kg'),
    ('Black Peppercorns', 'g', 650, 1, 'kg', 'Black peppercorns - PHP 650/kg'),
    ('Baking powder', 'g', 300, 1, 'kg', 'Baking powder - PHP 300/kg'),
    ('Cornstarch', 'g', 120, 1, 'kg', 'Cornstarch - PHP 120/kg'),
    ('All-purpose flour', 'g', 70, 1, 'kg', 'All-purpose flour - PHP 70/kg'),
    ('Garlic', 'g', 155, 1, 'kg', 'Garlic - PHP 155/kg'),
    ('White onion', 'g', 140, 1, 'kg', 'Onion (white/red avg) - PHP 140-155/kg'),
    ('Scallions', 'g', 200, 1, 'kg', 'Scallions - PHP 200/kg'),
    ('Ginger', 'g', 180, 1, 'kg', 'Ginger - PHP 180-200/kg'),
    ('Fresh Ginger', 'tbsp', 180, 1, 'kg', 'Ginger - PHP 180-200/kg'),
    ('Red Bell Peppers', 'g', 220, 1, 'kg', 'Red bell pepper - PHP 220/kg'),
    ('Fresh Calamansi', 'piece', 80, 1, 'kg', 'Calamansi - PHP 80/kg'),
    ('Russet potatoes', 'g', 120, 1, 'kg', 'Potatoes - PHP 120/kg'),
    ('Soy sauce', 'mL', 120, 1, 'L', 'Soy sauce - PHP 120/L'),
    ('Soy Sauce', 'tbsp', 120, 1, 'L', 'Soy sauce - PHP 120/L'),
    ('Oyster Sauce', 'tbsp', 180, 1, 'L', 'Oyster sauce - PHP 180/L'),
    ('Vegetable Oil', 'tbsp', 90, 1, 'L', 'Vegetable oil - PHP 90-160/L'),
    ('Rice', 'g', 2600, 1, 'sack', 'Rice - PHP 2600/sack'),
    ('Tanqueray London Dry Gin', 'mL', 1350, 750, 'mL', 'Tanqueray Gin 750mL - PHP 1350'),
    ('Engkanto High Hive Honey Ale', 'mL', 105, 330, 'mL', 'Engkanto Honey Ale 330mL - PHP 105'),
    ('Coke', 'mL', 30, 355, 'mL', 'Coke 355mL - PHP 30'),
    ('A&W Root Beer', 'mL', 50, 355, 'mL', 'A&W Root Beer 355mL - PHP 50'),
    ('Don Papa rum', 'mL', 1700, 700, 'mL', 'Don Papa Rum 700mL - PHP 1700'),
    ('Schweppes Sparkling Soda Water', 'mL', 30, 325, 'mL', 'Schweppes Soda Water 325mL - PHP 30'),
    ('Sprite', 'mL', 30, 320, 'mL', 'Sprite 320mL - PHP 30'),
    ('Cazadores Reposado Tequila', 'mL', 2500, 750, 'mL', 'Cazadores Reposado Tequila 750mL - PHP 2500'),
    ('Schweppes Sparkling Tonic Water', 'mL', 35, 320, 'mL', 'Schweppes Tonic Water 320mL - PHP 35'),
    ('Kanto Vodka Salted Caramel', 'mL', 380, 700, 'mL', 'Kanto Vodka Salted Caramel 700mL - PHP 380'),
    ('Chivas Regal 12 Year Old', 'mL', 2000, 700, 'mL', 'Chivas Regal 12YO 700mL - PHP 2000'),
    ('Liboll Spumante Rose Extra Dry', 'mL', 420, 750, 'mL', 'Liboll Rose Spumante 750mL - PHP 420'),
    ('Casillero del Diablo Reserva Chardonnay', 'mL', 600, 750, 'mL', 'Casillero del Diablo Chardonnay 750mL - PHP 600')
),
validated_seed as (
  select ps.*
  from price_seed ps
  join existing_recipe_ingredients eri
    on eri.name_key = lower(ps.name)
   and eri.unit_key = lower(ps.unit)
)
insert into public.inventory_items (
  name,
  category,
  unit,
  price_amount,
  price_basis_quantity,
  price_basis_unit
)
select
  vs.name,
  'Recipe',
  vs.unit,
  vs.price_amount,
  vs.price_basis_quantity,
  vs.price_basis_unit
from validated_seed vs
on conflict (lower(name), lower(unit))
do update
set
  price_amount = excluded.price_amount,
  price_basis_quantity = excluded.price_basis_quantity,
  price_basis_unit = excluded.price_basis_unit;
