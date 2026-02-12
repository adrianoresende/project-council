-- Supabase schema for secure per-user conversations.

create table if not exists public.conversations (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null default 'New Conversation',
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.conversations
  add column if not exists archived boolean not null default false;

create table if not exists public.messages (
  id bigint generated always as identity primary key,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text,
  stage1 jsonb,
  stage2 jsonb,
  stage3 jsonb,
  cost numeric(20,8) not null default 0,
  total_tokens integer not null default 0 check (total_tokens >= 0),
  created_at timestamptz not null default now(),
  constraint messages_payload_check check (
    (role = 'user' and content is not null and stage1 is null and stage2 is null and stage3 is null)
    or
    (role = 'assistant' and content is null and stage1 is not null and stage2 is not null and stage3 is not null)
  )
);

alter table public.messages
  add column if not exists cost numeric(20,8) not null default 0;

alter table public.messages
  add column if not exists total_tokens integer not null default 0;

create table if not exists public.account_credits (
  user_id uuid primary key references auth.users (id) on delete cascade,
  credits integer not null default 0 check (credits >= 0),
  updated_at timestamptz not null default now()
);

create index if not exists conversations_user_id_created_at_idx
  on public.conversations (user_id, created_at desc);

create index if not exists messages_conversation_id_created_at_idx
  on public.messages (conversation_id, created_at asc, id asc);

alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.account_credits enable row level security;

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

drop policy if exists account_credits_owner_select on public.account_credits;
drop policy if exists account_credits_owner_insert on public.account_credits;
drop policy if exists account_credits_owner_update on public.account_credits;
drop policy if exists account_credits_owner_delete on public.account_credits;

create policy account_credits_owner_select
  on public.account_credits
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy account_credits_owner_insert
  on public.account_credits
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy account_credits_owner_update
  on public.account_credits
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy account_credits_owner_delete
  on public.account_credits
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

create or replace function public.get_account_credits(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_credits integer;
begin
  if auth.role() <> 'service_role' and auth.uid() is distinct from p_user_id then
    raise exception 'FORBIDDEN';
  end if;

  select credits
    into v_credits
  from public.account_credits
  where user_id = p_user_id;

  return coalesce(v_credits, 0);
end;
$$;

create or replace function public.add_account_credits(p_user_id uuid, p_amount integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_credits integer;
begin
  if auth.role() <> 'service_role' and auth.uid() is distinct from p_user_id then
    raise exception 'FORBIDDEN';
  end if;

  if p_amount <= 0 then
    raise exception 'INVALID_CREDIT_AMOUNT';
  end if;

  insert into public.account_credits (user_id, credits)
  values (p_user_id, p_amount)
  on conflict (user_id)
  do update set
    credits = public.account_credits.credits + excluded.credits,
    updated_at = now()
  returning credits into v_credits;

  return v_credits;
end;
$$;

create or replace function public.consume_account_credit(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_credits integer;
begin
  if auth.role() <> 'service_role' and auth.uid() is distinct from p_user_id then
    raise exception 'FORBIDDEN';
  end if;

  insert into public.account_credits (user_id, credits)
  values (p_user_id, 0)
  on conflict (user_id) do nothing;

  update public.account_credits
    set credits = credits - 1,
        updated_at = now()
  where user_id = p_user_id
    and credits > 0
  returning credits into v_credits;

  if v_credits is null then
    raise exception 'INSUFFICIENT_CREDITS';
  end if;

  return v_credits;
end;
$$;

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.conversations to authenticated;
grant select, insert, update, delete on public.messages to authenticated;
grant select, insert, update, delete on public.account_credits to authenticated;
grant usage, select on sequence public.messages_id_seq to authenticated;
grant execute on function public.get_account_credits(uuid) to authenticated, service_role;
grant execute on function public.add_account_credits(uuid, integer) to authenticated, service_role;
grant execute on function public.consume_account_credit(uuid) to authenticated, service_role;
