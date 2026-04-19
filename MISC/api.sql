create extension if not exists pgcrypto with schema extensions;

create table if not exists public.lightning_api_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  key_hash text not null unique,
  key_prefix text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  last_used_at timestamp with time zone,
  expires_at timestamp with time zone,
  revoked_at timestamp with time zone,
  constraint lightning_api_keys_name_length check (char_length(trim(name)) between 1 and 64),
  constraint lightning_api_keys_hash_length check (char_length(key_hash) = 64),
  constraint lightning_api_keys_prefix_length check (char_length(key_prefix) between 8 and 32)
);

create index if not exists lightning_api_keys_user_id_idx
  on public.lightning_api_keys (user_id, created_at desc);

create index if not exists lightning_api_keys_lookup_idx
  on public.lightning_api_keys (key_hash);

alter table public.lightning_api_keys enable row level security;

grant select, insert, update, delete on public.lightning_api_keys to authenticated;

create policy "Users can read their own Lightning API keys"
on public.lightning_api_keys
for select
using (auth.uid() = user_id);

create policy "Users can create their own Lightning API keys"
on public.lightning_api_keys
for insert
with check (auth.uid() = user_id);

create policy "Users can update their own Lightning API keys"
on public.lightning_api_keys
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can delete their own Lightning API keys"
on public.lightning_api_keys
for delete
using (auth.uid() = user_id);
