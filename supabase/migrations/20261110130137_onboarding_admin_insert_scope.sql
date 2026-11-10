-- O-01 review follow-up: narrow what an admin may insert into user_onboarding.
-- Admins tick admin-confirmed, active steps for active members, and may still untick any row.
-- Self steps are the member's to confirm and auto steps belong to the system (service role).

drop policy user_onboarding_insert_admin on public.user_onboarding;

create policy user_onboarding_insert_admin on public.user_onboarding
  for insert to authenticated
  with check (
    (select public.is_admin())
    and completed_by = (select auth.uid())
    and exists (
      select 1 from public.onboarding_steps s
      where s.id = step_id and s.confirmed_by = 'admin' and s.active
    )
    and exists (
      select 1 from public.users u
      where u.id = user_id and u.status = 'active'
    )
  );
