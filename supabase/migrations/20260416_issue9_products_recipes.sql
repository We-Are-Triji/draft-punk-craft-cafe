-- Draft Punk Craft Cafe - Products and recipe ingredients
-- Issue #9: persist recipes/products in Supabase with editable ingredients

create extension if not exists "pgcrypto";

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null default 'Food',
  description text,
  is_active boolean not null default true,
  properties jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint products_name_unique unique (name)
);

create table if not exists public.product_ingredients (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  name text not null,
  quantity numeric not null default 0,
  unit text not null default 'pcs',
  sort_order int not null default 0,
  properties jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists product_ingredients_product_sort_idx
  on public.product_ingredients (product_id, sort_order, name);

create or replace function public.set_updated_at_timestamp()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists set_products_updated_at on public.products;
create trigger set_products_updated_at
before update on public.products
for each row
execute function public.set_updated_at_timestamp();

drop trigger if exists set_product_ingredients_updated_at on public.product_ingredients;
create trigger set_product_ingredients_updated_at
before update on public.product_ingredients
for each row
execute function public.set_updated_at_timestamp();

-- Enable realtime updates used by React hooks.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'products'
  ) then
    alter publication supabase_realtime add table public.products;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'product_ingredients'
  ) then
    alter publication supabase_realtime add table public.product_ingredients;
  end if;
end
$$;

-- Seed initial products only when table is empty so existing prod data is never overwritten.
do $$
begin
  if not exists (select 1 from public.products limit 1) then
    insert into public.products (name, category)
    values
      ('Arroz Chaufa Fried Rice', 'Food'),
      ('Chicken Skin', 'Food'),
      ('Crispy Pork Belly', 'Food'),
      ('Hawaiian Pizza', 'Food'),
      ('Mahi-Mahi', 'Food'),
      ('Potato Wedges', 'Food'),
      ('Punked Out Sisig', 'Food'),
      ('Salt and Peppa Wings', 'Food'),
      ('Spicy Garlic Noodles', 'Food'),
      ('Coke', 'Drinks'),
      ('Sprite', 'Drinks'),
      ('Root Beer', 'Drinks'),
      ('Soda Water', 'Drinks'),
      ('Gin', 'Drinks'),
      ('Rum', 'Drinks'),
      ('Tequila', 'Drinks'),
      ('Vodka', 'Drinks'),
      ('Whiskey', 'Drinks'),
      ('White Wine', 'Drinks'),
      ('Wine', 'Drinks'),
      ('Honey Ale (Mango Nation)', 'Drinks'),
      ('Tonic Water (Schweppes)', 'Drinks');

    with seed(product_name, ingredient_name, quantity, unit, sort_order) as (
      values
        ('Arroz Chaufa Fried Rice', 'Rice', 190, 'g', 1),
        ('Arroz Chaufa Fried Rice', 'Eggs', 3, 'large', 2),
        ('Arroz Chaufa Fried Rice', 'Boneless Pork Chop', 450, 'g', 3),
        ('Arroz Chaufa Fried Rice', 'Vegetable Oil', 3, 'tbsp', 4),
        ('Arroz Chaufa Fried Rice', 'Scallions', 60, 'g', 5),
        ('Arroz Chaufa Fried Rice', 'Red Bell Peppers', 150, 'g', 6),
        ('Arroz Chaufa Fried Rice', 'Fresh Ginger', 1, 'tbsp', 7),
        ('Arroz Chaufa Fried Rice', 'Garlic', 15, 'g', 8),
        ('Arroz Chaufa Fried Rice', 'Soy Sauce', 4, 'tbsp', 9),
        ('Arroz Chaufa Fried Rice', 'Oyster Sauce', 1, 'tbsp', 10),
        ('Chicken Skin', 'Fresh chicken skin', 250, 'g', 1),
        ('Chicken Skin', 'Water', 250, 'mL', 2),
        ('Chicken Skin', 'Fine sea salt', 5, 'g', 3),
        ('Chicken Skin', 'Black pepper', 2, 'g', 4),
        ('Crispy Pork Belly', 'Pork Belly', 1, 'kg', 1),
        ('Crispy Pork Belly', 'Salt', 30, 'g', 2),
        ('Crispy Pork Belly', 'Black Peppercorns', 10, 'g', 3),
        ('Crispy Pork Belly', 'Garlic', 15, 'g', 4),
        ('Hawaiian Pizza', 'All-purpose Flour', 165, 'g', 1),
        ('Hawaiian Pizza', 'Yeast', 4, 'g', 2),
        ('Hawaiian Pizza', 'Fine Sea Salt', 4, 'g', 3),
        ('Hawaiian Pizza', 'Extra Virgin Olive Oil', 8, 'mL', 4),
        ('Mahi-Mahi', 'Mahi-Mahi fillet', 180, 'g', 1),
        ('Mahi-Mahi', 'Rice', 200, 'g', 2),
        ('Mahi-Mahi', 'Green cabbage', 100, 'g', 3),
        ('Mahi-Mahi', 'Fresh Calamansi', 1, 'piece', 4),
        ('Potato Wedges', 'Russet potatoes', 500, 'g', 1),
        ('Potato Wedges', 'Salt', 10, 'g', 2),
        ('Potato Wedges', 'All-purpose flour', 60, 'g', 3),
        ('Potato Wedges', 'Cornstarch', 40, 'g', 4),
        ('Punked Out Sisig', 'Pork', 400, 'g', 1),
        ('Punked Out Sisig', 'Chicken liver', 50, 'g', 2),
        ('Punked Out Sisig', 'White onion', 100, 'g', 3),
        ('Punked Out Sisig', 'Ginger', 10, 'g', 4),
        ('Salt and Peppa Wings', 'Chicken wings', 350, 'g', 1),
        ('Salt and Peppa Wings', 'Cornstarch', 40, 'g', 2),
        ('Salt and Peppa Wings', 'All-purpose flour', 20, 'g', 3),
        ('Salt and Peppa Wings', 'Baking powder', 3, 'g', 4),
        ('Spicy Garlic Noodles', 'Dry bihon', 100, 'g', 1),
        ('Spicy Garlic Noodles', 'Chicken broth', 200, 'mL', 2),
        ('Spicy Garlic Noodles', 'Soy sauce', 15, 'mL', 3),
        ('Spicy Garlic Noodles', 'Fish sauce', 5, 'mL', 4),
        ('Coke', 'Coke', 355, 'mL', 1),
        ('Sprite', 'Sprite', 320, 'mL', 1),
        ('Root Beer', 'A&W Root Beer', 355, 'mL', 1),
        ('Soda Water', 'Schweppes Sparkling Soda Water', 325, 'mL', 1),
        ('Gin', 'Tanqueray London Dry Gin', 750, 'mL', 1),
        ('Rum', 'Don Papa rum', 700, 'mL', 1),
        ('Tequila', 'Cazadores Reposado Tequila', 750, 'mL', 1),
        ('Vodka', 'Kanto Vodka Salted Caramel', 700, 'mL', 1),
        ('Whiskey', 'Chivas Regal 12 Year Old', 700, 'mL', 1),
        ('White Wine', 'Liboll Spumante Rose Extra Dry', 750, 'mL', 1),
        ('Wine', 'Casillero del Diablo Reserva Chardonnay', 750, 'mL', 1),
        ('Honey Ale (Mango Nation)', 'Engkanto High Hive Honey Ale', 330, 'mL', 1),
        ('Tonic Water (Schweppes)', 'Schweppes Sparkling Tonic Water', 320, 'mL', 1)
    )
    insert into public.product_ingredients (product_id, name, quantity, unit, sort_order)
    select p.id, s.ingredient_name, s.quantity, s.unit, s.sort_order
    from seed s
    join public.products p on p.name = s.product_name;
  end if;
end
$$;
