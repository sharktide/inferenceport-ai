create policy "User reads own messages"
on chat_messages for select
using (auth.uid() = user_id);

create policy "User inserts own messages"
on chat_messages for insert
with check (auth.uid() = user_id);

create policy "User updates own messages"
on chat_messages for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "User deletes own messages"
on chat_messages for delete
using (auth.uid() = user_id);
