-- Place: initial schema.
-- Run once in the Supabase SQL Editor (or with `supabase db push`).

-- ---------------------------------------------------------------------------
-- Family access list
-- Everyone whose email is in this table shares all items, people and projects.
-- Add members from the SQL Editor or Table Editor; the app itself cannot write
-- to this table.
-- ---------------------------------------------------------------------------
create table public.family_members (
  email text primary key,
  added_at timestamptz not null default now()
);

alter table public.family_members enable row level security;
-- No policies: the table is invisible to the app. Membership is checked only
-- through is_family_member() below.

create or replace function public.is_family_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.family_members
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

revoke execute on function public.is_family_member() from public, anon;
grant execute on function public.is_family_member() to authenticated;

-- ---------------------------------------------------------------------------
-- Items
-- ---------------------------------------------------------------------------
create table public.items (
  id uuid primary key default gen_random_uuid(),
  content text not null,
  type text not null default 'todo' check (type in (
    'todo', 'grocery', 'shopping', 'bill', 'event', 'to_schedule', 'idea',
    'note', 'research', 'errand', 'gift', 'project_item', 'household'
  )),
  person_name text,
  responsible_name text,
  project_name text,
  date timestamptz,
  due_date date,
  time text,
  recurring text,
  completed boolean not null default false,
  completed_date timestamptz,
  priority text default 'medium' check (priority in ('low', 'medium', 'high')),
  notes text,
  category text,
  amount numeric,
  budget numeric,
  purchased boolean not null default false,
  wrapped boolean not null default false,
  payment_status text default 'unpaid' check (payment_status in ('unpaid', 'paid')),
  store text,
  location text,
  tags text[] not null default '{}',
  inbox boolean not null default false,
  list_name text,
  created_date timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null
);

create index items_created_date_idx on public.items (created_date desc);

-- ---------------------------------------------------------------------------
-- People
-- ---------------------------------------------------------------------------
create table public.people (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  role text,
  color text default '#0f766e',
  birthday date,
  notes text,
  created_date timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null
);

-- ---------------------------------------------------------------------------
-- Projects
-- ---------------------------------------------------------------------------
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  color text default '#4f46e5',
  category text,
  created_date timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null
);

-- ---------------------------------------------------------------------------
-- Access: signed-in family members can read and write everything.
-- ---------------------------------------------------------------------------
alter table public.items enable row level security;
alter table public.people enable row level security;
alter table public.projects enable row level security;

create policy "Family members have full access" on public.items
  for all to authenticated
  using (public.is_family_member())
  with check (public.is_family_member());

create policy "Family members have full access" on public.people
  for all to authenticated
  using (public.is_family_member())
  with check (public.is_family_member());

create policy "Family members have full access" on public.projects
  for all to authenticated
  using (public.is_family_member())
  with check (public.is_family_member());

grant select, insert, update, delete on public.items, public.people, public.projects to authenticated;
