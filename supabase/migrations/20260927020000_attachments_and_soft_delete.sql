-- GoesHere: item attachments (Storage + metadata) and soft-delete recovery.
-- New migration only — do not edit prior migrations.
-- Apply in the Supabase SQL Editor (or `supabase db push`) before relying on this in production.

-- ---------------------------------------------------------------------------
-- Soft-delete on items (trash + restore)
-- ---------------------------------------------------------------------------
alter table public.items
  add column if not exists deleted_at timestamptz,
  add column if not exists attachment_count integer not null default 0;

create index if not exists items_deleted_at_idx
  on public.items (deleted_at)
  where deleted_at is not null;

create index if not exists items_completed_date_idx
  on public.items (completed_date desc nulls last)
  where completed = true and deleted_at is null;

comment on column public.items.deleted_at is
  'When set, item is in trash and hidden from normal lists. Restore by clearing.';
comment on column public.items.attachment_count is
  'Denormalized count of rows in public.attachments for this item (kept by trigger).';

-- ---------------------------------------------------------------------------
-- Attachments metadata
-- ---------------------------------------------------------------------------
create table if not exists public.attachments (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items (id) on delete cascade,
  storage_path text not null,
  file_name text not null,
  mime_type text not null,
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 10485760),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  constraint attachments_mime_allowed check (
    mime_type like 'image/%' or mime_type = 'application/pdf'
  )
);

create index if not exists attachments_item_id_idx on public.attachments (item_id);
create index if not exists attachments_created_at_idx on public.attachments (created_at desc);

alter table public.attachments enable row level security;

drop policy if exists "Family members have full access" on public.attachments;
create policy "Family members have full access" on public.attachments
  for all to authenticated
  using (public.is_family_member())
  with check (public.is_family_member());

grant select, insert, update, delete on public.attachments to authenticated;

comment on table public.attachments is
  'File metadata for item uploads. Bytes live in storage bucket item-attachments.';

-- Keep items.attachment_count in sync
create or replace function public.sync_item_attachment_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target uuid;
begin
  target := coalesce(new.item_id, old.item_id);
  update public.items
  set attachment_count = (
    select count(*)::integer from public.attachments where item_id = target
  )
  where id = target;
  return coalesce(new, old);
end;
$$;

drop trigger if exists attachments_sync_count on public.attachments;
create trigger attachments_sync_count
  after insert or delete on public.attachments
  for each row execute function public.sync_item_attachment_count();

-- ---------------------------------------------------------------------------
-- Storage bucket (private; family members only via RLS on storage.objects)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'item-attachments',
  'item-attachments',
  false,
  10485760,
  array[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif',
    'application/pdf'
  ]::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Path convention: {item_id}/{attachment_id}-{safe_file_name}
drop policy if exists "Family members read item attachments" on storage.objects;
drop policy if exists "Family members upload item attachments" on storage.objects;
drop policy if exists "Family members update item attachments" on storage.objects;
drop policy if exists "Family members delete item attachments" on storage.objects;

create policy "Family members read item attachments"
  on storage.objects for select to authenticated
  using (bucket_id = 'item-attachments' and public.is_family_member());

create policy "Family members upload item attachments"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'item-attachments' and public.is_family_member());

create policy "Family members update item attachments"
  on storage.objects for update to authenticated
  using (bucket_id = 'item-attachments' and public.is_family_member())
  with check (bucket_id = 'item-attachments' and public.is_family_member());

create policy "Family members delete item attachments"
  on storage.objects for delete to authenticated
  using (bucket_id = 'item-attachments' and public.is_family_member());
