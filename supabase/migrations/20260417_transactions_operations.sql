-- Draft Punk Craft Cafe - Transaction operations and manual sale flow
-- Adds operation-level transaction records and atomic sale processing with stock checks.

create extension if not exists "pgcrypto";

create table if not exists public.transaction_operations (
  id uuid primary key default gen_random_uuid(),
  operation_type text not null
    check (operation_type in ('sale', 'scan', 'manual_stock_in', 'manual_stock_out', 'adjustment')),
  product_id uuid references public.products(id) on delete set null,
  product_name text,
  quantity numeric not null default 1 check (quantity > 0),
  unit_price numeric check (unit_price is null or unit_price >= 0),
  total_amount numeric check (total_amount is null or total_amount >= 0),
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists transaction_operations_created_idx
  on public.transaction_operations (created_at desc);

create index if not exists transaction_operations_type_created_idx
  on public.transaction_operations (operation_type, created_at desc);

alter table public.stock_transactions
  add column if not exists operation_id uuid references public.transaction_operations(id) on delete set null;

create index if not exists stock_transactions_operation_idx
  on public.stock_transactions (operation_id);

create or replace function public.create_sale_operation(
  p_product_id uuid,
  p_quantity numeric,
  p_unit_price numeric default null,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_operation_id uuid;
  v_product_name text;
  v_required_qty numeric;
  v_inventory_item_id uuid;
  v_inventory_stock numeric;
  v_inventory_name text;
  v_inventory_unit text;
  v_ingredient record;
  v_ingredient_count int;
  v_total_amount numeric;
begin
  if p_product_id is null then
    raise exception 'Product is required.';
  end if;

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Quantity must be greater than zero.';
  end if;

  if p_unit_price is not null and p_unit_price < 0 then
    raise exception 'Unit price cannot be negative.';
  end if;

  select name
  into v_product_name
  from public.products
  where id = p_product_id
    and is_active = true
  limit 1;

  if v_product_name is null then
    raise exception 'Selected product is unavailable.';
  end if;

  select count(*)
  into v_ingredient_count
  from public.product_ingredients
  where product_id = p_product_id;

  if v_ingredient_count = 0 then
    raise exception 'Selected product has no recipe ingredients configured.';
  end if;

  -- Validate every required ingredient before creating operation records.
  for v_ingredient in
    select name, quantity, unit
    from public.product_ingredients
    where product_id = p_product_id
    order by sort_order asc, created_at asc
  loop
    v_required_qty := v_ingredient.quantity * p_quantity;

    if v_required_qty <= 0 then
      continue;
    end if;

    v_inventory_item_id := null;
    v_inventory_stock := null;
    v_inventory_name := null;
    v_inventory_unit := null;

    select id, current_stock, name, unit
    into v_inventory_item_id, v_inventory_stock, v_inventory_name, v_inventory_unit
    from public.inventory_items
    where lower(name) = lower(v_ingredient.name)
      and lower(unit) = lower(v_ingredient.unit)
    limit 1
    for update;

    if v_inventory_item_id is null then
      select id, current_stock, name, unit
      into v_inventory_item_id, v_inventory_stock, v_inventory_name, v_inventory_unit
      from public.inventory_items
      where lower(name) = lower(v_ingredient.name)
      limit 1
      for update;
    end if;

    if v_inventory_item_id is null then
      raise exception
        'Missing inventory item for ingredient: % (%).',
        v_ingredient.name,
        v_ingredient.unit;
    end if;

    if coalesce(v_inventory_stock, 0) < v_required_qty then
      raise exception
        'Insufficient stock for % (%). Required %, available %.',
        v_inventory_name,
        v_inventory_unit,
        v_required_qty,
        coalesce(v_inventory_stock, 0);
    end if;
  end loop;

  v_total_amount := case
    when p_unit_price is null then null
    else p_unit_price * p_quantity
  end;

  insert into public.transaction_operations (
    operation_type,
    product_id,
    product_name,
    quantity,
    unit_price,
    total_amount,
    notes,
    metadata
  )
  values (
    'sale',
    p_product_id,
    v_product_name,
    p_quantity,
    p_unit_price,
    v_total_amount,
    p_notes,
    jsonb_build_object('source', 'manual')
  )
  returning id into v_operation_id;

  -- Apply stock deductions and log ingredient-level movements.
  for v_ingredient in
    select name, quantity, unit
    from public.product_ingredients
    where product_id = p_product_id
    order by sort_order asc, created_at asc
  loop
    v_required_qty := v_ingredient.quantity * p_quantity;

    if v_required_qty <= 0 then
      continue;
    end if;

    v_inventory_item_id := null;
    v_inventory_stock := null;
    v_inventory_name := null;
    v_inventory_unit := null;

    select id, current_stock, name, unit
    into v_inventory_item_id, v_inventory_stock, v_inventory_name, v_inventory_unit
    from public.inventory_items
    where lower(name) = lower(v_ingredient.name)
      and lower(unit) = lower(v_ingredient.unit)
    limit 1
    for update;

    if v_inventory_item_id is null then
      select id, current_stock, name, unit
      into v_inventory_item_id, v_inventory_stock, v_inventory_name, v_inventory_unit
      from public.inventory_items
      where lower(name) = lower(v_ingredient.name)
      limit 1
      for update;
    end if;

    if v_inventory_item_id is null then
      raise exception
        'Missing inventory item for ingredient: % (%).',
        v_ingredient.name,
        v_ingredient.unit;
    end if;

    update public.inventory_items
    set current_stock = greatest(0, coalesce(v_inventory_stock, 0) - v_required_qty)
    where id = v_inventory_item_id;

    insert into public.stock_transactions (
      item_id,
      transaction_type,
      quantity,
      image_url,
      detected_by_ai,
      notes,
      operation_id
    )
    values (
      v_inventory_item_id,
      'stock_out',
      v_required_qty,
      null,
      false,
      format('Sale: %s x%s', v_product_name, p_quantity),
      v_operation_id
    );
  end loop;

  return v_operation_id;
end;
$$;

grant execute on function public.create_sale_operation(uuid, numeric, numeric, text)
  to anon, authenticated, service_role;

-- Enable realtime updates used by React hooks.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'transaction_operations'
  ) then
    alter publication supabase_realtime add table public.transaction_operations;
  end if;
end
$$;
