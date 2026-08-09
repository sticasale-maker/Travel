-- supabase-usage-audit.sql
-- Paste into Supabase Studio → SQL Editor. Read-only: nothing is modified.
-- Answers "what is eating my free-tier allocation?"

-- Run this in BOTH projects — you have two:
--   jvcijeecbpzylzwoutch  → Travel (travel-photos) + Sapporo (sapporo-photos)
--   gkspukabnfbzrvjoewpc  → Manly swim (board-images, intro-photos,
--                            announce-images), Forecast App (announce-images),
--                            Godiving (no storage)

-- ---------------------------------------------------------------------------
-- 1. Bytes per bucket = bytes per app (free tier = 1 GB). This is the query
--    that tells you which app is consuming more.
-- ---------------------------------------------------------------------------
select
  bucket_id,
  count(*)                                          as objects,
  pg_size_pretty(sum((metadata->>'size')::bigint))  as total_size
from storage.objects
group by bucket_id
order by sum((metadata->>'size')::bigint) desc;

-- ---------------------------------------------------------------------------
-- 2. Same, split by media type. Expect video in travel-photos to dominate —
--    Travel is the only app that uploads video, and it uploads it raw.
-- ---------------------------------------------------------------------------
select
  bucket_id,
  case
    when name ~* '\.(mp4|m4v|mov|webm|ogv)$'      then 'video'
    when name ~* '\.(m4a|mp3|aac|ogg|oga)$'       then 'audio'
    when name ~* 'avatar'                          then 'avatar'
    else 'photo'
  end                                              as kind,
  count(*)                                         as files,
  pg_size_pretty(sum((metadata->>'size')::bigint)) as bytes,
  pg_size_pretty(avg((metadata->>'size')::bigint)::bigint) as avg_file
from storage.objects
group by 1, 2
order by sum((metadata->>'size')::bigint) desc;

-- ---------------------------------------------------------------------------
-- 3. The 30 biggest single files. Each one is re-downloaded in full by every
--    viewer, every time it is opened (video/audio bypass the service worker).
--    egress ≈ file size x views.
-- ---------------------------------------------------------------------------
select
  bucket_id,
  name,
  pg_size_pretty((metadata->>'size')::bigint) as size,
  metadata->>'mimetype'                       as mime,
  created_at
from storage.objects
order by (metadata->>'size')::bigint desc
limit 30;

-- ---------------------------------------------------------------------------
-- 4. Orphans: files still in storage that no note references any more.
--    Deleting these is free space with zero user-visible impact.
--    TRAVEL PROJECT ONLY (jvcijeecbpzylzwoutch) — skip in the other project.
-- ---------------------------------------------------------------------------
with referenced as (
  select unnest(photo_paths) as path from public.travel_notes
  union
  select audio_path  from public.travel_notes where coalesce(audio_path, '')  <> ''
  union
  select avatar_path from public.travel_notes where coalesce(avatar_path, '') <> ''
  union
  select avatar_path from public.profiles     where coalesce(avatar_path, '') <> ''
  union
  select avatar_path from public.people       where coalesce(avatar_path, '') <> ''
)
select
  o.name,
  pg_size_pretty((o.metadata->>'size')::bigint) as size,
  o.created_at
from storage.objects o
where o.bucket_id = 'travel-photos'
  and o.name not in (select path from referenced where path is not null)
order by (o.metadata->>'size')::bigint desc;

-- Total reclaimable from orphans:
with referenced as (
  select unnest(photo_paths) as path from public.travel_notes
  union select audio_path  from public.travel_notes where coalesce(audio_path, '')  <> ''
  union select avatar_path from public.travel_notes where coalesce(avatar_path, '') <> ''
  union select avatar_path from public.profiles     where coalesce(avatar_path, '') <> ''
  union select avatar_path from public.people       where coalesce(avatar_path, '') <> ''
)
select pg_size_pretty(coalesce(sum((o.metadata->>'size')::bigint), 0)) as reclaimable
from storage.objects o
where o.bucket_id = 'travel-photos'
  and o.name not in (select path from referenced where path is not null);

-- ---------------------------------------------------------------------------
-- 5. Database size (free tier = 500 MB). Should be tiny — media lives in
--    storage, the tables only hold paths. If this is large, something is wrong.
-- ---------------------------------------------------------------------------
select
  c.relname                                        as table_name,
  pg_size_pretty(pg_total_relation_size(c.oid))    as total_size,
  s.n_live_tup                                     as live_rows
from pg_class c
join pg_namespace ns on ns.oid = c.relnamespace
left join pg_stat_user_tables s on s.relid = c.oid
where ns.nspname = 'public' and c.relkind = 'r'
order by pg_total_relation_size(c.oid) desc;

-- ---------------------------------------------------------------------------
-- 6. Row counts on the tables the app polls every 60s with select('*').
--    Every open tab pulls all of these rows, in full, once a minute.
--    TRAVEL PROJECT ONLY (jvcijeecbpzylzwoutch) — these table names do not
--    exist in the Manly swim / Forecast / Godiving project.
-- ---------------------------------------------------------------------------
select 'travel_notes' as table_name, count(*) as rows from public.travel_notes
union all select 'reactions',    count(*) from public.reactions
union all select 'note_replies', count(*) from public.note_replies
union all select 'reply_likes',  count(*) from public.reply_likes
union all select 'profiles',     count(*) from public.profiles
union all select 'people',       count(*) from public.people
union all select 'trip_flags',   count(*) from public.trip_flags;

-- ---------------------------------------------------------------------------
-- 7. Anonymous auth users. ensureAuth() calls signInAnonymously() whenever a
--    poster has no session — a new row here per phone per storage wipe. These
--    count toward MAU.
-- ---------------------------------------------------------------------------
select
  count(*)        as anon_users,
  min(created_at) as first_seen,
  max(created_at) as latest_seen
from auth.users;

-- ---------------------------------------------------------------------------
-- 8. Session churn → duplicated storage.
--    Every object is stored under "<uid>/...", so a phone that loses its
--    session and mints a new uid re-uploads its avatars into a fresh folder
--    while the old copies stay behind forever. This shows how many distinct
--    uid folders exist, how many actually own notes, and what the abandoned
--    ones are costing. TRAVEL PROJECT ONLY.
-- ---------------------------------------------------------------------------
with folders as (
  select
    split_part(name, '/', 1)      as uid,
    (metadata->>'size')::bigint   as bytes,
    name
  from storage.objects
  where bucket_id = 'travel-photos'
)
select
  count(distinct uid)                                       as uid_folders,
  count(distinct uid) filter (
    where uid in (select user_id::text from public.travel_notes)
  )                                                          as uids_with_notes,
  pg_size_pretty(sum(bytes) filter (
    where uid not in (select user_id::text from public.travel_notes)
  ))                                                         as bytes_in_abandoned_folders,
  count(*) filter (where name ~ '/avatar/')                  as avatar_files
from folders;

-- The same, broken out per uid — the tail of one-avatar-only folders is the
-- fingerprint of a phone that re-authenticated and re-uploaded from scratch.
with folders as (
  select
    split_part(name, '/', 1)    as uid,
    (metadata->>'size')::bigint as bytes,
    name
  from storage.objects
  where bucket_id = 'travel-photos'
)
select
  uid,
  count(*)                        as files,
  count(*) filter (where name ~ '/avatar/') as avatars,
  pg_size_pretty(sum(bytes))      as size,
  (uid in (select user_id::text from public.travel_notes)) as still_owns_notes
from folders
group by uid
order by sum(bytes) desc;
