create table if not exists public.pick_lists (
  id uuid primary key default gen_random_uuid(),
  list_code text not null unique,
  cutoff_at timestamptz,
  status text not null default 'active',
  orders jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.pick_list_items (
  id uuid primary key default gen_random_uuid(),
  pick_list_id uuid not null references public.pick_lists(id) on delete cascade,
  order_id text not null,
  item_id text,
  title text,
  sku text,
  quantity integer not null default 0,
  packed_at timestamptz
);
