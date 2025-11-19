create policy "User can read own sessions" 
on chat_sessions for select 
using (auth.uid() = user_id);

create policy "User inserts own sessions"
on chat_sessions for insert
with check (auth.uid() = user_id);

create policy "User updates own sessions"
on chat_sessions for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "User deletes own sessions"
on chat_sessions for delete
using (auth.uid() = user_id);
