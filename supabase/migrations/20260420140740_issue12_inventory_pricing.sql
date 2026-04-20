-- Draft Punk Craft Cafe - Inventory ingredient pricing metadata
-- Issue #12: add editable ingredient price with measurement basis

alter table if exists public.inventory_items
  add column if not exists price_amount numeric(12,2) not null default 0;

alter table if exists public.inventory_items
  add column if not exists price_basis_quantity numeric(12,3) not null default 1;

alter table if exists public.inventory_items
  add column if not exists price_basis_unit text not null default 'unit';

update public.inventory_items
set price_basis_unit = coalesce(nullif(trim(unit), ''), 'unit')
where coalesce(nullif(trim(price_basis_unit), ''), '') = '';

alter table if exists public.inventory_items
  drop constraint if exists inventory_items_price_amount_check;

alter table if exists public.inventory_items
  add constraint inventory_items_price_amount_check
  check (price_amount >= 0);

alter table if exists public.inventory_items
  drop constraint if exists inventory_items_price_basis_quantity_check;

alter table if exists public.inventory_items
  add constraint inventory_items_price_basis_quantity_check
  check (price_basis_quantity > 0);
