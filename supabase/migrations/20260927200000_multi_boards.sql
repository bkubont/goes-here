-- Multi-board kanban: boards, columns, swimlanes + item placement.
-- New migration only. Family-scoped via is_family_member() RLS.
-- Migrates existing single-board board_status into a default "Family tasks" board.

-- ---------------------------------------------------------------------------
-- boards
-- ---------------------------------------------------------------------------
create table if not exists public.boards (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null default 'blank'
    check (kind in ('blank', 'task_workflow', 'project')),
  project_id uuid references public.projects (id) on delete set null,
  filter_json jsonb,
  swimlane_mode text not null default 'none'
    check (swimlane_mode in ('none', 'person', 'project', 'custom')),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null
);

create index if not exists boards_position_idx on public.boards (position, created_at);

alter table public.boards enable row level security;

drop policy if exists "Family members have full access" on public.boards;
create policy "Family members have full access" on public.boards
  for all to authenticated
  using (public.is_family_member())
  with check (public.is_family_member());

grant select, insert, update, delete on public.boards to authenticated;

-- ---------------------------------------------------------------------------
-- board_columns (maps to items.board_status via status_key)
-- ---------------------------------------------------------------------------
create table if not exists public.board_columns (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards (id) on delete cascade,
  name text not null,
  position integer not null default 0,
  status_key text not null,
  is_done boolean not null default false,
  unique (board_id, status_key)
);

create index if not exists board_columns_board_position_idx
  on public.board_columns (board_id, position);

alter table public.board_columns enable row level security;

drop policy if exists "Family members have full access" on public.board_columns;
create policy "Family members have full access" on public.board_columns
  for all to authenticated
  using (public.is_family_member())
  with check (public.is_family_member());

grant select, insert, update, delete on public.board_columns to authenticated;

-- ---------------------------------------------------------------------------
-- board_swimlanes (custom labels; person/project modes are dynamic)
-- ---------------------------------------------------------------------------
create table if not exists public.board_swimlanes (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards (id) on delete cascade,
  name text not null,
  position integer not null default 0,
  lane_key text not null,
  unique (board_id, lane_key)
);

create index if not exists board_swimlanes_board_position_idx
  on public.board_swimlanes (board_id, position);

alter table public.board_swimlanes enable row level security;

drop policy if exists "Family members have full access" on public.board_swimlanes;
create policy "Family members have full access" on public.board_swimlanes
  for all to authenticated
  using (public.is_family_member())
  with check (public.is_family_member());

grant select, insert, update, delete on public.board_swimlanes to authenticated;

-- ---------------------------------------------------------------------------
-- items: one board at a time (v1)
-- ---------------------------------------------------------------------------
alter table public.items
  add column if not exists board_id uuid references public.boards (id) on delete set null,
  add column if not exists board_column_id uuid references public.board_columns (id) on delete set null,
  add column if not exists swimlane_key text;

create index if not exists items_board_id_idx on public.items (board_id);
create index if not exists items_board_column_id_idx on public.items (board_column_id);

-- Allow custom status_key values (was locked to backlog|ready|doing|done).
do $$
begin
  if exists (
    select 1 from information_schema.check_constraints
    where constraint_schema = 'public'
      and constraint_name = 'items_board_status_check'
  ) then
    alter table public.items drop constraint items_board_status_check;
  end if;
exception
  when undefined_object then null;
end $$;

-- Also drop inline-named variants if Postgres auto-named differently.
do $$
declare
  cname text;
begin
  for cname in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'items'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%board_status%'
  loop
    execute format('alter table public.items drop constraint %I', cname);
  end loop;
end $$;

comment on column public.items.board_id is 'Kanban board this item sits on (one board at a time for v1).';
comment on column public.items.board_column_id is 'Column (status) on the board.';
comment on column public.items.swimlane_key is 'Optional swimlane key (person name, project name, or custom lane_key).';
comment on column public.items.board_status is 'Denormalized column status_key for filters and completion sync.';

-- ---------------------------------------------------------------------------
-- Seed default "Family tasks" board + migrate existing board_status
-- ---------------------------------------------------------------------------
do $$
declare
  bid uuid;
  col_backlog uuid;
  col_ready uuid;
  col_doing uuid;
  col_done uuid;
begin
  if exists (select 1 from public.boards limit 1) then
    return;
  end if;

  insert into public.boards (name, kind, swimlane_mode, position)
  values ('Family tasks', 'task_workflow', 'none', 0)
  returning id into bid;

  insert into public.board_columns (board_id, name, position, status_key, is_done)
  values (bid, 'Backlog', 0, 'backlog', false)
  returning id into col_backlog;

  insert into public.board_columns (board_id, name, position, status_key, is_done)
  values (bid, 'Ready', 1, 'ready', false)
  returning id into col_ready;

  insert into public.board_columns (board_id, name, position, status_key, is_done)
  values (bid, 'Doing', 2, 'doing', false)
  returning id into col_doing;

  insert into public.board_columns (board_id, name, position, status_key, is_done)
  values (bid, 'Done', 3, 'done', true)
  returning id into col_done;

  update public.items
  set
    board_id = bid,
    board_column_id = case coalesce(board_status, 'backlog')
      when 'ready' then col_ready
      when 'doing' then col_doing
      when 'done' then col_done
      else col_backlog
    end,
    board_status = case
      when completed and coalesce(board_status, 'backlog') <> 'done' then 'done'
      else coalesce(board_status, 'backlog')
    end
  where board_id is null;
end $$;

-- ---------------------------------------------------------------------------
-- Realtime for board tables
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'boards'
  ) then
    alter publication supabase_realtime add table public.boards;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'board_columns'
  ) then
    alter publication supabase_realtime add table public.board_columns;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'board_swimlanes'
  ) then
    alter publication supabase_realtime add table public.board_swimlanes;
  end if;
end $$;
