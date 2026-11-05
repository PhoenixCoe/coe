-- Run this once in Supabase: SQL editor > New query > paste > Run.

-- 1. Saved chats (one row per chat, only the owner can see them)
create table if not exists chats (
  user_id uuid not null default auth.uid(),
  id text not null,
  title text not null default '',
  updated bigint not null default 0,
  pinned boolean not null default false,
  data jsonb not null,
  primary key (user_id, id)
);
alter table chats enable row level security;
drop policy if exists "own chats" on chats;
create policy "own chats" on chats for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 2. Who has Pro (written only by the Worker, readable by the owner)
create table if not exists subs (
  user_id uuid primary key references auth.users on delete cascade,
  plan text not null default 'pro',
  status text not null,
  customer text,
  sub text,
  period_end timestamptz
);
alter table subs enable row level security;
drop policy if exists "read own plan" on subs;
create policy "read own plan" on subs for select using (user_id = auth.uid());

-- 3. Credits used each day (only the Worker touches this)
create table if not exists usage (
  subject text not null,
  day date not null default (now() at time zone 'utc')::date,
  used int not null default 0,
  primary key (subject, day)
);
alter table usage enable row level security;

-- Spend credits in one step. Returns the new total, or -1 when there is not enough left.
create or replace function spend(p_subject text, p_cost int, p_limit int) returns int
language plpgsql security definer set search_path = public as $$
declare d date := (now() at time zone 'utc')::date; n int;
begin
  insert into usage (subject, day, used) values (p_subject, d, 0) on conflict do nothing;
  update usage set used = greatest(0, used + p_cost)
    where subject = p_subject and day = d and used + p_cost <= p_limit
    returning used into n;
  return coalesce(n, -1);
end $$;
revoke all on function spend(text, int, int) from public, anon, authenticated;
