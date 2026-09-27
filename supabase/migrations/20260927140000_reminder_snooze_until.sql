-- GoesHere: reminder snooze until (reappear after snooze ends).
-- Clear still uses reminder_dismissed_at; snooze uses this column only.

alter table public.items
  add column if not exists reminder_snooze_until timestamptz;

comment on column public.items.reminder_snooze_until is
  'Hide Due reminder in UI until this instant; null means not snoozed.';
