-- Draft Punk Craft Cafe - Inventory + Imaging AI prototype schema
-- Issue #8: scan flow with confirmable deductions

create extension if not exists "pgcrypto";

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'transaction_type'
  ) then
    create type public.transaction_type as enum ('stock_in', 'stock_out', 'sample', 'wastage');
  end if;
end
$$;

create table if not exists public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null default 'Uncategorized',
  unit text not null default 'pcs',
  current_stock numeric not null default 0,
  reorder_threshold numeric not null default 10,
  created_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists inventory_items_name_unit_unique
  on public.inventory_items (lower(name), lower(unit));

create table if not exists public.stock_transactions (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.inventory_items(id) on delete cascade,
  transaction_type public.transaction_type not null,
  quantity numeric not null check (quantity > 0),
  image_url text,
  detected_by_ai boolean not null default false,
  notes text,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists stock_transactions_item_idx
  on public.stock_transactions (item_id);

create index if not exists stock_transactions_created_idx
  on public.stock_transactions (created_at desc);

create table if not exists public.image_cache (
  id uuid primary key default gen_random_uuid(),
  image_hash text not null,
  item_name text not null,
  category text not null,
  confidence text not null check (confidence in ('high', 'medium', 'low')),
  quantity_estimate int not null check (quantity_estimate > 0),
  unit text not null,
  created_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists image_cache_hash_unique
  on public.image_cache (image_hash);

-- Enable realtime updates for dashboard hooks.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'inventory_items'
  ) then
    alter publication supabase_realtime add table public.inventory_items;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'stock_transactions'
  ) then
    alter publication supabase_realtime add table public.stock_transactions;
  end if;
end
$$;
