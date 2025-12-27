create table if not exists public.tiny_tokens (
  account_id text primary key,
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  scope text,
  token_type text,
  created_at timestamptz not null default now()
);
