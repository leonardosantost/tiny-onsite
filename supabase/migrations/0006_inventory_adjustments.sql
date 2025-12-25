create table if not exists public.inventory_adjustments (
  id uuid primary key default gen_random_uuid(),
  sku text not null,
  action text not null,
  quantity integer not null default 0,
  from_bin text,
  to_bin text,
  note text,
  created_at timestamptz not null default now()
);
