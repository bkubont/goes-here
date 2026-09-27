-- Realtime sync for multi-device refresh + updated_at for Recent activity.
-- Safe to re-run: publication adds are gated; column/trigger use IF NOT EXISTS patterns.

-- ---------------------------------------------------------------------------
-- updated_at on items (Recent sorts by this; Lists already preferred updated_*)
-- ---------------------------------------------------------------------------
alter table public.items
  add column if not exists updated_at timestamptz not null default now();

update public.items
set updated_at = coalesce(updated_at, created_date, now())
where updated_at is null;

create index if not exists items_updated_at_idx on public.items (updated_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists items_set_updated_at on public.items;
create trigger items_set_updated_at
  before update on public.items
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Enable Supabase Realtime on household tables (idempotent)
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'items'
  ) then
    alter publication supabase_realtime add table public.items;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'people'
  ) then
    alter publication supabase_realtime add table public.people;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'projects'
  ) then
    alter publication supabase_realtime add table public.projects;
  end if;
end $$;
