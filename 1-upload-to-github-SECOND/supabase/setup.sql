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


-- 4. What Coe remembers about the person (notes they can edit in Coe), so it follows their account
create table if not exists profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated timestamptz not null default now()
);
alter table profiles enable row level security;
drop policy if exists "own profile" on profiles;
create policy "own profile" on profiles for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Shared chats: a read-only link to a copy of one chat. The owner can make and withdraw their own links.
-- Nobody can list the table: the shared page reads one row, by its long random id, through get_share().
create table if not exists shares (
  id text primary key check (char_length(id) between 12 and 40),
  user_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null check (octet_length(data::text) < 800000),
  created timestamptz not null default now()
);
alter table shares enable row level security;
drop policy if exists "own shares" on shares;
create policy "own shares" on shares for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create or replace function get_share(share_id text) returns jsonb
  language sql security definer set search_path = public stable
  as $$ select data from shares where id = share_id limit 1 $$;
revoke all on function get_share(text) from public;
grant execute on function get_share(text) to anon, authenticated;
