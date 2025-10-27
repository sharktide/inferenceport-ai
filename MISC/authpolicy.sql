create table profiles (
  id uuid references auth.users on delete cascade primary key,
  username text unique not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);
alter table profiles enable row level security;
create policy "Public profiles are viewable by everyone"
on profiles
for select
using (true);
create policy "Users can insert their own profile"
on profiles
for insert
with check (auth.uid() = id);
create policy "Users can update their own profile"
on profiles
for update
using (auth.uid() = id)
with check (auth.uid() = id);
create policy "Users can delete their own profile"
on profiles
for delete
using (auth.uid() = id);
alter table profiles add constraint unique_username unique (username);

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();
