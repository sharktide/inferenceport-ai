-- ============================================================
-- Extensions
-- ============================================================
create extension if not exists pgcrypto with schema extensions;

-- ============================================================
-- Table: lightning_api_keys
-- ============================================================
create table if not exists public.lightning_api_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  key_hash text not null unique,
  key_prefix text not null,
  created_at timestamptz not null default timezone('utc', now()),
  last_used_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,

  constraint lightning_api_keys_name_length check (char_length(trim(name)) between 1 and 64),
  constraint lightning_api_keys_hash_length check (char_length(key_hash) = 64),
  constraint lightning_api_keys_prefix_length check (char_length(key_prefix) between 8 and 32)
);

-- ============================================================
-- Indexes
-- ============================================================
create index if not exists lightning_api_keys_user_id_idx
  on public.lightning_api_keys (user_id, created_at desc);

create index if not exists lightning_api_keys_lookup_idx
  on public.lightning_api_keys (key_hash);

-- ============================================================
-- Row Level Security
-- ============================================================
alter table public.lightning_api_keys enable row level security;
DROP POLICY IF EXISTS "Users can read their own Lightning API keys" ON public.lightning_api_keys;
DROP POLICY IF EXISTS "Users can create their own Lightning API keys" ON public.lightning_api_keys;
DROP POLICY IF EXISTS "Users can update their own Lightning API keys" ON public.lightning_api_keys;
DROP POLICY IF EXISTS "Users can delete their own Lightning API keys" ON public.lightning_api_keys;
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

-- ============================================================
-- Column-level SELECT permissions
-- ============================================================
revoke select on public.lightning_api_keys from authenticated;

grant select (
  id,
  user_id,
  name,
  key_prefix,
  created_at,
  last_used_at,
  expires_at,
  revoked_at
) on public.lightning_api_keys to authenticated;

-- ============================================================
-- Trigger Function: auto-delete AFTER update
-- ============================================================
create or replace function public.delete_lightning_key_on_revocation()
returns trigger as $$
begin
  if new.revoked_at is not null then
    delete from public.lightning_api_keys where id = new.id;
    return null;
  end if;

  if new.expires_at is not null and new.expires_at <= now() then
    delete from public.lightning_api_keys where id = new.id;
    return null;
  end if;

  return new;
end;
$$ language plpgsql security definer;

-- ============================================================
-- Trigger (AFTER UPDATE so SELECT works)
-- ============================================================
drop trigger if exists lightning_key_auto_delete on public.lightning_api_keys;

create trigger lightning_key_auto_delete
after update on public.lightning_api_keys
for each row
execute function public.delete_lightning_key_on_revocation();