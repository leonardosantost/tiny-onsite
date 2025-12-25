create table if not exists public.manifests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  status text not null default 'open',
  logistic_type text,
  carrier_name text,
  cutoff_at timestamptz
);

create table if not exists public.manifest_items (
  id uuid primary key default gen_random_uuid(),
  manifest_id uuid not null references public.manifests(id) on delete cascade,
  pack_id text,
  order_id text,
  buyer_name text,
  item_id text,
  title text,
  sku text,
  quantity integer not null default 0,
  color text,
  fabric_design text,
  created_at timestamptz not null default now()
);

create index if not exists manifest_items_manifest_id_idx on public.manifest_items (manifest_id);
