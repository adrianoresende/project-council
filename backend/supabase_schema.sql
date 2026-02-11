-- Supabase schema for secure per-user conversations.

create table if not exists public.conversations (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null default 'New Conversation',
  created_at timestamptz not null default now()
);

create table if not exists public.messages (
  id bigint generated always as identity primary key,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text,
  stage1 jsonb,
  stage2 jsonb,
  stage3 jsonb,
  created_at timestamptz not null default now(),
  constraint messages_payload_check check (
    (role = 'user' and content is not null and stage1 is null and stage2 is null and stage3 is null)
    or
    (role = 'assistant' and content is null and stage1 is not null and stage2 is not null and stage3 is not null)
  )
);

create index if not exists conversations_user_id_created_at_idx
  on public.conversations (user_id, created_at desc);

create index if not exists messages_conversation_id_created_at_idx
  on public.messages (conversation_id, created_at asc, id asc);

alter table public.conversations enable row level security;
alter table public.messages enable row level security;

drop policy if exists conversations_owner_select on public.conversations;
drop policy if exists conversations_owner_insert on public.conversations;
drop policy if exists conversations_owner_update on public.conversations;
drop policy if exists conversations_owner_delete on public.conversations;

create policy conversations_owner_select
  on public.conversations
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy conversations_owner_insert
  on public.conversations
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy conversations_owner_update
  on public.conversations
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy conversations_owner_delete
  on public.conversations
  for delete
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists messages_owner_select on public.messages;
drop policy if exists messages_owner_insert on public.messages;
drop policy if exists messages_owner_update on public.messages;
drop policy if exists messages_owner_delete on public.messages;

create policy messages_owner_select
  on public.messages
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.conversations c
      where c.id = messages.conversation_id and c.user_id = auth.uid()
    )
  );

create policy messages_owner_insert
  on public.messages
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.conversations c
      where c.id = messages.conversation_id and c.user_id = auth.uid()
    )
  );

create policy messages_owner_update
  on public.messages
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.conversations c
      where c.id = messages.conversation_id and c.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.conversations c
      where c.id = messages.conversation_id and c.user_id = auth.uid()
    )
  );

create policy messages_owner_delete
  on public.messages
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.conversations c
      where c.id = messages.conversation_id and c.user_id = auth.uid()
    )
  );

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.conversations to authenticated;
grant select, insert, update, delete on public.messages to authenticated;
grant usage, select on sequence public.messages_id_seq to authenticated;
