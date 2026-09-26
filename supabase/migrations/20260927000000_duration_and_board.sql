-- Place: duration estimates + family kanban board status.
-- New migration only — do not edit 20260925000000_init.sql.
-- Columns on public.items inherit the existing is_family_member() RLS policy.

alter table public.items
  add column if not exists duration_minutes integer,
  add column if not exists duration_source text
    check (duration_source is null or duration_source in ('manual', 'ai', 'family_avg', 'type_default')),
  add column if not exists actual_duration_minutes integer,
  add column if not exists board_status text not null default 'backlog'
    check (board_status in ('backlog', 'ready', 'doing', 'done'));

-- Backfill board_status from completed flag.
update public.items
set board_status = case when completed then 'done' else 'backlog' end
where board_status = 'backlog' and completed = true;

comment on column public.items.duration_minutes is 'Planned length in minutes (authoritative).';
comment on column public.items.duration_source is 'How duration_minutes was set: manual | ai | family_avg | type_default.';
comment on column public.items.actual_duration_minutes is 'Elapsed/actual minutes when completed; feeds family averages.';
comment on column public.items.board_status is 'Family-shared kanban column: backlog | ready | doing | done.';
