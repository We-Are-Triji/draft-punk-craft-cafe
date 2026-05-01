-- Link purchase requests to purchase orders.
-- Adds order_id FK on purchase_requests and an "ordered" status.

-- Add order_id column to link requests to orders
alter table public.purchase_requests
  add column if not exists order_id uuid references public.purchase_orders(id) on delete set null;

create index if not exists purchase_requests_order_idx
  on public.purchase_requests (order_id);

-- Expand status check to include "ordered"
alter table public.purchase_requests drop constraint if exists purchase_requests_status_check;
alter table public.purchase_requests
  add constraint purchase_requests_status_check
  check (status in ('pending', 'approved', 'rejected', 'ordered'));
