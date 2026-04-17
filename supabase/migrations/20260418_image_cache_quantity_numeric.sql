-- Draft Punk Craft Cafe - Image cache quantity precision fix
-- Issue #10: support decimal and unknown AI quantity estimates in image cache

alter table if exists public.image_cache
  alter column quantity_estimate type numeric(12,3)
  using quantity_estimate::numeric;

alter table if exists public.image_cache
  alter column quantity_estimate set default 0;

alter table if exists public.image_cache
  drop constraint if exists image_cache_quantity_estimate_check;

alter table if exists public.image_cache
  add constraint image_cache_quantity_estimate_check
  check (quantity_estimate >= 0);
