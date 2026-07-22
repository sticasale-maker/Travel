-- ============================================================================
-- Outback Loop — travel notes backend setup
-- Run this in the Supabase SQL editor (Project → SQL Editor → New query → Run).
-- Then do the two dashboard steps noted at the bottom.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- C.9  Database: table, indexes, Row Level Security
-- ---------------------------------------------------------------------------
create extension if not exists pgcrypto;

create table if not exists public.travel_notes (
  id           uuid primary key default gen_random_uuid(),
  day_key      text not null,                     -- matches a day card's data-date, e.g. '2026-08-06'
  author       text not null,                     -- display name
  user_id      uuid not null default auth.uid(),  -- owner (anonymous auth uid)
  body         text default '',
  photo_paths  text[] default '{}',               -- storage object paths
  captured_at  timestamptz not null,              -- client capture time (ordering within a day)
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Bilingual columns: author's language + per-language bodies (auto-translated).
-- `body` keeps the original text; body_en / body_it hold the two versions.
alter table public.travel_notes
  add column if not exists lang    text not null default 'en',
  add column if not exists body_en text default '',
  add column if not exists body_it text default '';

-- Author avatar carried on each entry, so one phone can post as different people:
alter table public.travel_notes
  add column if not exists avatar_path text default '';

create index if not exists travel_notes_day_idx  on public.travel_notes (day_key, captured_at);
create index if not exists travel_notes_user_idx on public.travel_notes (user_id);

alter table public.travel_notes enable row level security;

-- Anyone (including unauthenticated readers) may READ:
drop policy if exists "read all" on public.travel_notes;
create policy "read all" on public.travel_notes
  for select using (true);

-- Only an authenticated (anonymous-auth) session may INSERT, and only as itself:
drop policy if exists "insert own" on public.travel_notes;
create policy "insert own" on public.travel_notes
  for insert to authenticated
  with check (user_id = auth.uid());

-- Only the owner may UPDATE / DELETE:
drop policy if exists "update own" on public.travel_notes;
create policy "update own" on public.travel_notes
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "delete own" on public.travel_notes;
create policy "delete own" on public.travel_notes
  for delete to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Profiles: one per person (per anonymous uid) — display name + avatar.
-- Avatars are stored in the travel-photos bucket under {uid}/avatar/...
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  user_id     uuid primary key default auth.uid(),
  name        text,
  avatar_path text,
  updated_at  timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Anyone may read profiles (so readers see names + avatars):
drop policy if exists "profiles read all" on public.profiles;
create policy "profiles read all" on public.profiles for select using (true);

-- A signed-in person may create / update only their own profile:
drop policy if exists "profiles insert own" on public.profiles;
create policy "profiles insert own" on public.profiles
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "profiles update own" on public.profiles;
create policy "profiles update own" on public.profiles
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- C.10  Storage: public photo bucket + policies
-- ---------------------------------------------------------------------------
-- Create the bucket (public read). If it already exists this is a no-op.
insert into storage.buckets (id, name, public)
values ('travel-photos', 'travel-photos', true)
on conflict (id) do update set public = true;

-- Public read of this bucket:
drop policy if exists "public read travel-photos" on storage.objects;
create policy "public read travel-photos" on storage.objects
  for select using ( bucket_id = 'travel-photos' );

-- Authenticated users may upload only under their own uid folder:
drop policy if exists "upload own travel-photos" on storage.objects;
create policy "upload own travel-photos" on storage.objects
  for insert to authenticated
  with check ( bucket_id = 'travel-photos'
               and (storage.foldername(name))[1] = auth.uid()::text );

-- Authenticated users may delete only their own objects:
drop policy if exists "delete own travel-photos" on storage.objects;
create policy "delete own travel-photos" on storage.objects
  for delete to authenticated
  using ( bucket_id = 'travel-photos'
          and (storage.foldername(name))[1] = auth.uid()::text );

-- ============================================================================
-- STILL TO DO in the dashboard (not SQL):
--   Authentication → Providers (or Sign In / Providers) → enable
--   "Anonymous sign-ins".  Without it the poster app can't get a session,
--   so notes stay queued as "Pending sync".
-- ============================================================================
