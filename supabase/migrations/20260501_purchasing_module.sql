-- Draft Punk Craft Cafe - Purchasing module
-- Adds purchase_requests and purchase_orders tables for inventory procurement tracking.

create extension if not exists "pgcrypto";

-- Purchase Requests
create table if not exists public.purchase_requests (
  id uuid primary key default gen_random_uuid(),
  ingredient_name text not null,
  quantity numeric not null check (quantity > 0),
  unit text not null default 'pcs',
  urgency text not null default 'normal'
    check (urgency in ('low', 'normal', 'urgent')),
  notes text not null default '',
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists purchase_requests_status_idx
  on public.purchase_requests (status, created_at desc);

create index if not exists purchase_requests_created_idx
  on public.purchase_requests (created_at desc);

-- Purchase Orders
create table if not exists public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  supplier_name text not null,
  expected_date date,
  notes text not null default '',
  status text not null default 'draft'
    check (status in ('draft', 'sent', 'received')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists purchase_orders_status_idx
  on public.purchase_orders (status, created_at desc);

create index if not exists purchase_orders_created_idx
  on public.purchase_orders (created_at desc);

-- Purchase Order Line Items
create table if not exists public.purchase_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.purchase_orders(id) on delete cascade,
  ingredient_name text not null,
  quantity numeric not null check (quantity > 0),
  unit text not null default 'pcs',
  estimated_cost numeric not null default 0 check (estimated_cost >= 0),
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists purchase_order_items_order_idx
  on public.purchase_order_items (order_id);

-- Row Level Security
alter table public.purchase_requests enable row level security;
alter table public.purchase_orders enable row level security;
alter table public.purchase_order_items enable row level security;

-- Allow authenticated users full access
create policy "Authenticated users can manage purchase requests"
  on public.purchase_requests for all
  to authenticated
  using (true)
  with check (true);

create policy "Authenticated users can manage purchase orders"
  on public.purchase_orders for all
  to authenticated
  using (true)
  with check (true);

create policy "Authenticated users can manage purchase order items"
  on public.purchase_order_items for all
  to authenticated
  using (true)
  with check (true);

-- Enable realtime
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'purchase_requests'
  ) then
    alter publication supabase_realtime add table public.purchase_requests;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'purchase_orders'
  ) then
    alter publication supabase_realtime add table public.purchase_orders;
  end if;
end
$$;
