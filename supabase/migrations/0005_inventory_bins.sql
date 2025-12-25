create table if not exists public.inventory_bins (
  id uuid primary key default gen_random_uuid(),
  sku text not null,
  bin text not null,
  quantity integer not null default 0,
  item_id text,
  created_at timestamptz not null default now()
);
