-- Color hierarchy: ensure projects.color exists for project accents.
-- Column was created in 20260925000000_init.sql; this migration is idempotent
-- for environments that may have been provisioned without it.

alter table public.projects
  add column if not exists color text default '#4f46e5';

comment on column public.projects.color is
  'Accent hex for Projects pages (hierarchy rank 4). Snap to shared palette in the app.';

-- people.color already exists from init; document intended use.
comment on column public.people.color is
  'Accent hex for Calendar time-blocking by assignee (hierarchy rank 2). Snap to shared palette in the app.';
