-- O-01: onboarding checklist definition and per-member progress (spec section 8).
-- Decisions behind the trigger and who writes which step are in docs/adr/0015-onboarding-steps-and-progress.md.

create type public.onboarding_confirmer as enum ('self', 'auto', 'admin');

-- The checklist definition lives in a table so steps can be reordered or reworded without code.
-- title_key points to the message key onboarding.steps.<key> in messages/*.json.
create table public.onboarding_steps (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (char_length(trim(key)) > 0),
  title_key text not null check (char_length(trim(title_key)) > 0),
  confirmed_by public.onboarding_confirmer not null,
  position int not null,
  active boolean not null default true
);

-- A row means the step is done. A null completed_by means the system completed it.
create table public.user_onboarding (
  user_id uuid not null references public.users (id) on delete cascade,
  step_id uuid not null references public.onboarding_steps (id),
  completed_at timestamptz not null default now(),
  completed_by uuid references public.users (id) on delete set null,
  primary key (user_id, step_id)
);

create index user_onboarding_step_id_idx on public.user_onboarding (step_id);
create index user_onboarding_completed_by_idx on public.user_onboarding (completed_by);

insert into public.onboarding_steps (key, title_key, confirmed_by, position) values
  ('added_to_platform', 'onboarding.steps.added_to_platform', 'auto', 1),
  ('signal_group', 'onboarding.steps.signal_group', 'admin', 2),
  ('read_welcome_document', 'onboarding.steps.read_welcome_document', 'self', 3),
  ('looked_at_activities', 'onboarding.steps.looked_at_activities', 'self', 4),
  ('joined_working_group', 'onboarding.steps.joined_working_group', 'auto', 5),
  ('first_group_call', 'onboarding.steps.first_group_call', 'admin', 6),
  ('first_contribution', 'onboarding.steps.first_contribution', 'auto', 7),
  ('one_to_one_checkin', 'onboarding.steps.one_to_one_checkin', 'admin', 8);

-- Step 1 completes when a member row is created, wherever it comes from: the approval action, the
-- seeded first admin or a fixture user. Steps 5 and 7 are written by O-04 later.
create function public.complete_added_to_platform()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.user_onboarding (user_id, step_id, completed_by)
  select new.id, s.id, null
  from public.onboarding_steps s
  where s.key = 'added_to_platform'
  on conflict do nothing;
  return new;
end;
$$;

revoke all on function public.complete_added_to_platform() from public, anon, authenticated;

create trigger complete_added_to_platform after insert on public.users
  for each row execute function public.complete_added_to_platform();

-- Members that exist already.
insert into public.user_onboarding (user_id, step_id, completed_by)
select u.id, s.id, null
from public.users u
cross join public.onboarding_steps s
where u.status = 'active' and s.key = 'added_to_platform'
on conflict do nothing;

revoke all on public.onboarding_steps, public.user_onboarding
  from public, anon, authenticated, service_role;
grant select, insert, update, delete on public.onboarding_steps to authenticated, service_role;
-- Progress is never updated: a step is either done or not. Members only ever insert.
grant select, insert, delete on public.user_onboarding to authenticated, service_role;

alter table public.onboarding_steps enable row level security;
alter table public.user_onboarding enable row level security;

create policy onboarding_steps_select_members on public.onboarding_steps
  for select to authenticated
  using ((select public.is_active_member()));

create policy onboarding_steps_admin_all on public.onboarding_steps
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy user_onboarding_select_own on public.user_onboarding
  for select to authenticated
  using (user_id = (select auth.uid()) and (select public.is_active_member()));

create policy user_onboarding_select_admin on public.user_onboarding
  for select to authenticated
  using ((select public.is_admin()));

-- A member confirms their own self-confirmed steps. Auto steps are written by the system only and
-- admin steps by admins; there is no member delete or update policy.
create policy user_onboarding_insert_self on public.user_onboarding
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and completed_by = (select auth.uid())
    and (select public.is_active_member())
    and exists (
      select 1 from public.onboarding_steps s
      where s.id = step_id and s.confirmed_by = 'self' and s.active
    )
  );

-- Admins tick and untick any step for anyone.
create policy user_onboarding_insert_admin on public.user_onboarding
  for insert to authenticated
  with check ((select public.is_admin()) and completed_by = (select auth.uid()));

create policy user_onboarding_delete_admin on public.user_onboarding
  for delete to authenticated
  using ((select public.is_admin()));
