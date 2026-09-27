-- GoesHere: practical reminders, project context fields, recurring exceptions.
-- New migration only — do not edit prior migrations.
-- Columns inherit existing is_family_member() RLS on items / projects.

-- ---------------------------------------------------------------------------
-- Items: reminder timing (UI-surfaced; no push/email delivery yet)
-- ---------------------------------------------------------------------------
alter table public.items
  add column if not exists reminder_offset text
    check (
      reminder_offset is null
      or reminder_offset in ('at_time', '15m', '1h', 'morning')
    ),
  add column if not exists reminder_dismissed_at timestamptz,
  add column if not exists recurring_exceptions text[] not null default '{}';

comment on column public.items.reminder_offset is
  'When to surface a reminder relative to scheduled date/time: at_time | 15m | 1h | morning. Stored only — no push delivery.';
comment on column public.items.reminder_dismissed_at is
  'When the user cleared this item from Due reminders in the UI.';
comment on column public.items.recurring_exceptions is
  'YYYY-MM-DD day keys to skip when virtually expanding a recurring series.';

-- ---------------------------------------------------------------------------
-- Projects: owner, target date, explicit next action
-- ---------------------------------------------------------------------------
alter table public.projects
  add column if not exists owner_name text,
  add column if not exists target_date date,
  add column if not exists next_action text;

comment on column public.projects.owner_name is 'Person responsible for the project overall.';
comment on column public.projects.target_date is 'Optional target / due date for the project.';
comment on column public.projects.next_action is 'Short note for the next concrete step.';
