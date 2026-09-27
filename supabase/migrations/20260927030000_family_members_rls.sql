-- Family member allowlist: let existing family members manage emails in-app.
-- Previously family_members had RLS enabled with no policies (app-invisible).
-- Membership checks still use security-definer is_family_member().
-- Only authenticated users who already pass is_family_member() may select/insert/delete.
-- Not open signup: you must already be on the list to add others.

grant select, insert, delete on public.family_members to authenticated;

create policy "Family members can read allowlist"
  on public.family_members
  for select
  to authenticated
  using (public.is_family_member());

create policy "Family members can add allowlist emails"
  on public.family_members
  for insert
  to authenticated
  with check (public.is_family_member());

create policy "Family members can remove allowlist emails"
  on public.family_members
  for delete
  to authenticated
  using (public.is_family_member());
