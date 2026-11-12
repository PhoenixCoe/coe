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

-- PMC Account: which sites and apps have signed in to this account (shown on the account page, accounts.pmcstudios.uk).
-- Only the owner can see or change their own rows. It holds a site name and two times: nothing else.
create table if not exists app_access (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  app text not null check (app ~ '^[a-z0-9-]{1,32}$'),
  label text not null check (char_length(label) between 1 and 40),
  pmc boolean not null default true,
  first_at timestamptz not null default now(),
  last_at timestamptz not null default now(),
  primary key (user_id, app)
);
alter table app_access enable row level security;
drop policy if exists "own app access" on app_access;
create policy "own app access" on app_access for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ============================================================ Sign in with PMC (the developer portal at accounts.pmcstudios.uk/developers). The same text is in the pmc-accounts repo, sql/sign-in-with-pmc.sql.
-- Sign in with PMC: apps that other people register (accounts.pmcstudios.uk/developers) and the one-time codes that carry a sign-in back to them.
-- Paste this whole file into the Supabase SQL editor and press Run. It is safe to run again.
-- Nothing in here ever hands out a password, a refresh token or a Supabase sign-in key. An app gets a one-time code, swaps it for a short note
-- (a private ID for that app only, a first name, a small picture, and an email only if the person ticks the box), and the code is then gone.

-- 1. Apps: one row for each site a developer registers. The developer can only see and change their own.
create table if not exists dev_apps (
  id text primary key default ('app_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 20)),
  owner uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 40),
  site text not null check (site ~ '^https://([a-z0-9-]+\.)+[a-z]{2,}(:[0-9]{1,5})?$' and char_length(site) <= 100),
  created_at timestamptz not null default now()
);
alter table dev_apps enable row level security;
drop policy if exists "own dev apps" on dev_apps;
create policy "own dev apps" on dev_apps for all to authenticated using (owner = auth.uid()) with check (owner = auth.uid());
revoke all on dev_apps from anon;
grant select, insert, update, delete on dev_apps to authenticated;

create or replace function dev_apps_limit() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from dev_apps where owner = new.owner) >= 10 then raise exception 'You can register up to 10 apps.'; end if;
  return new;
end $$;
drop trigger if exists dev_apps_limit on dev_apps;
create trigger dev_apps_limit before insert on dev_apps for each row execute function dev_apps_limit();

-- 2. One-time codes. Only the hash of a code is kept, nobody can read this table from the website, and a code lives for two minutes.
create table if not exists connect_codes (
  code_hash text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  app_id text not null,
  redirect text not null,
  challenge text not null,
  claims jsonb not null,
  expires timestamptz not null default (now() + interval '2 minutes')
);
alter table connect_codes enable row level security;
revoke all on connect_codes from anon, authenticated;

-- 3. The consent screen asks what an app is called and which site it belongs to. Nothing about its owner.
create or replace function pmc_app_info(p_id text) returns jsonb
  language sql security definer set search_path = public stable
  as $$ select jsonb_build_object('name', name, 'site', site) from dev_apps where id = p_id and p_id ~ '^app_[a-z0-9]{20}$' $$;
revoke all on function pmc_app_info(text) from public;
grant execute on function pmc_app_info(text) to anon, authenticated;

-- 4. "Allow": the signed-in person agrees. Returns a one-time code. The address to go back to must be on the app's own site
--    (or localhost, for testing), and the code is tied to the app's PKCE challenge so only the app that asked can use it.
create or replace function pmc_grant(p_app text, p_redirect text, p_challenge text, p_email boolean, p_name text, p_picture text) returns text
  language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid(); a dev_apps%rowtype; mail text; nm text; pic text; code text; claims jsonb;
begin
  if uid is null then raise exception 'Sign in first.'; end if;
  select * into a from dev_apps where id = p_app;
  if not found then raise exception 'Unknown app.'; end if;
  if p_redirect is null or char_length(p_redirect) > 300 or p_redirect ~ '[\s\\#]' then raise exception 'Bad address.'; end if;
  if not (p_redirect = a.site or left(p_redirect, char_length(a.site) + 1) = a.site || '/' or p_redirect ~ '^http://(localhost|127\.0\.0\.1)(:[0-9]{1,5})?(/|$)') then raise exception 'That address does not belong to this app.'; end if;
  if p_challenge is null or p_challenge !~ '^[A-Za-z0-9_-]{43}$' then raise exception 'Bad challenge.'; end if;
  delete from connect_codes where user_id = uid and expires < now();
  if (select count(*) from connect_codes where user_id = uid) >= 10 then raise exception 'Too many sign-ins at once. Wait a minute.'; end if;
  select email into mail from auth.users where id = uid;
  nm := left(coalesce(nullif(btrim(p_name), ''), split_part(mail, '@', 1)), 40);
  pic := case when p_picture ~ '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$' and char_length(p_picture) <= 40000 then p_picture else null end;
  claims := jsonb_build_object('sub', 'pmc_' || left(encode(sha256(convert_to(uid::text || a.id, 'utf8')), 'hex'), 32), 'name', nm, 'aud', a.id);
  if pic is not null then claims := claims || jsonb_build_object('picture', pic); end if;
  if p_email then claims := claims || jsonb_build_object('email', mail, 'email_verified', true); end if;
  code := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into connect_codes (code_hash, user_id, app_id, redirect, challenge, claims)
    values (encode(sha256(convert_to(code, 'utf8')), 'hex'), uid, a.id, p_redirect, p_challenge, claims);
  -- it shows on the account page, under Sites, as a site that is not a PMC app
  insert into app_access (user_id, app, label, pmc) values (uid, 'x-' || left(encode(sha256(convert_to(a.id, 'utf8')), 'hex'), 16), left(a.name, 40), false)
    on conflict (user_id, app) do update set last_at = now(), label = excluded.label;
  return code;
end $$;
revoke all on function pmc_grant(text, text, text, boolean, text, text) from public, anon;
grant execute on function pmc_grant(text, text, text, boolean, text, text) to authenticated;

-- 5. The app swaps the code for the note. One use only: the row is deleted first, so a second try finds nothing.
create or replace function pmc_redeem(p_code text, p_verifier text, p_redirect text) returns jsonb
  language plpgsql security definer set search_path = public as $$
declare r connect_codes%rowtype;
begin
  if p_code is null or p_code !~ '^[a-f0-9]{64}$' or p_verifier is null or p_verifier !~ '^[A-Za-z0-9._~-]{43,128}$' then return jsonb_build_object('error', 'invalid_grant'); end if;
  delete from connect_codes where code_hash = encode(sha256(convert_to(p_code, 'utf8')), 'hex') returning * into r;
  if not found or r.expires < now() or r.redirect is distinct from p_redirect
     or translate(encode(sha256(convert_to(p_verifier, 'utf8')), 'base64'), '+/=', '-_') <> r.challenge then
    return jsonb_build_object('error', 'invalid_grant');
  end if;
  return r.claims || jsonb_build_object('iss', 'https://accounts.pmcstudios.uk', 'iat', extract(epoch from now())::bigint);
end $$;
revoke all on function pmc_redeem(text, text, text) from public;
grant execute on function pmc_redeem(text, text, text) to anon, authenticated;
