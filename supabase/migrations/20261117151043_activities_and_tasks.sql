-- T-01 (part 1): activities, activity participants and tasks (spec sections 2 and 5), the General
-- activity of every working group, the data constraints and the policy helpers.
-- Decisions: docs/adr/0019-activities-and-tasks-data-model.md (refines ADR-0003).
-- RLS is enabled here with no policies, so the tables are closed to members until the
-- activities_policies migration (T-01 part 2) adds them. The permission rules are repeated in
-- lib/domain/activities.ts; the database tests fail if the two drift.

create type public.activity_status as enum ('planned', 'active', 'done', 'cancelled');
create type public.participant_role as enum ('participant', 'observer');
create type public.task_status as enum ('open', 'in_progress', 'done');

create table public.activities (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.working_groups (id) on delete cascade,
  -- Defined in code with its details schema (ADR-0003), so a new type needs no migration.
  type text not null check (char_length(type) between 1 and 40),
  title text not null check (char_length(trim(title)) between 1 and 120),
  description text check (char_length(description) <= 2000),
  status public.activity_status not null default 'planned',
  starts_on date,
  due_on date check (due_on is null or starts_on is null or due_on >= starts_on),
  -- Must be a participant (not an observer) of this activity: see guard_activity_lead.
  lead_id uuid references public.users (id) on delete set null,
  key_activity boolean not null default false,
  links jsonb not null default '[]'
    check (jsonb_typeof(links) = 'array' and jsonb_array_length(links) <= 20),
  details jsonb not null default '{}' check (jsonb_typeof(details) = 'object'),
  -- The standing activity every group has (spec section 2); created by a trigger below.
  is_general boolean not null default false,
  postmortem_went_well text check (char_length(postmortem_went_well) <= 4000),
  postmortem_improvements text check (char_length(postmortem_improvements) <= 4000),
  postmortem_learnings text check (char_length(postmortem_learnings) <= 4000),
  -- Archived activities are kept and hidden from default lists; separate from the status.
  archived_at timestamptz,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One General activity per group.
create unique index activities_one_general_per_group
  on public.activities (group_id)
  where is_general;
create index activities_group_id_status_idx on public.activities (group_id, status);
create index activities_lead_id_idx on public.activities (lead_id);
create index activities_created_by_idx on public.activities (created_by);

create trigger set_updated_at before update on public.activities
  for each row execute function public.set_updated_at();

create table public.activity_participants (
  activity_id uuid not null references public.activities (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  role public.participant_role not null default 'participant',
  joined_at timestamptz not null default now(),
  primary key (activity_id, user_id)
);

create index activity_participants_user_id_idx on public.activity_participants (user_id);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities (id) on delete cascade,
  -- Always the activity's group (set by sync_task_group), so policies need no join.
  group_id uuid not null references public.working_groups (id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 120),
  description text check (char_length(description) <= 2000),
  assignee_id uuid references public.users (id) on delete set null,
  status public.task_status not null default 'open',
  due_on date,
  completion_note text check (char_length(completion_note) <= 2000),
  completion_url text check (completion_url is null or completion_url ~ '^https://'),
  -- Set and cleared by set_task_completed_at.
  completed_at timestamptz,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Spec section 5: the note or the link is the visible trail of the work.
  constraint tasks_done_needs_note_or_link check (
    status <> 'done'
    or nullif(trim(coalesce(completion_note, '')), '') is not null
    or completion_url is not null
  )
);

create index tasks_group_id_status_idx on public.tasks (group_id, status);
create index tasks_assignee_id_status_idx on public.tasks (assignee_id, status);
create index tasks_activity_id_idx on public.tasks (activity_id);
create index tasks_created_by_idx on public.tasks (created_by);

create trigger set_updated_at before update on public.tasks
  for each row execute function public.set_updated_at();

-- Triggers that keep the data consistent for every role, the service role included.

-- The General activity keeps its identity: no new title or type, never cancelled or archived.
-- No activity moves to another group or changes whether it is the General one.
create function public.guard_activity_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.group_id is distinct from old.group_id or new.is_general is distinct from old.is_general then
    raise exception 'an activity keeps its group and General flag' using errcode = '23514';
  end if;
  if old.is_general and (
    new.title is distinct from old.title
    or new.type is distinct from old.type
    or new.status = 'cancelled'
    or new.archived_at is not null
  ) then
    raise exception 'the General activity cannot be renamed, retyped, cancelled or archived'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_activity_identity() from public, anon, authenticated;

create trigger guard_activity_identity before update on public.activities
  for each row execute function public.guard_activity_identity();

-- The General activity goes only with its group. A group delete removes the group row first and
-- then cascades to its activities, so when the group row is gone this delete is that cascade.
create function public.guard_general_activity_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.is_general and exists (select 1 from public.working_groups g where g.id = old.group_id) then
    raise exception 'the General activity cannot be deleted' using errcode = '23514';
  end if;
  return old;
end;
$$;

revoke all on function public.guard_general_activity_delete() from public, anon, authenticated;

create trigger guard_general_activity_delete before delete on public.activities
  for each row execute function public.guard_general_activity_delete();

-- The lead is a participant of the activity with the role 'participant', never an observer.
-- A new activity has no participants yet, so it starts without a lead.
create function public.guard_activity_lead()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.lead_id is not null
    and (tg_op = 'INSERT' or new.lead_id is distinct from old.lead_id)
    and not exists (
      select 1 from public.activity_participants p
      where p.activity_id = new.id and p.user_id = new.lead_id and p.role = 'participant'
    )
  then
    raise exception 'the lead must be a participant of the activity' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_activity_lead() from public, anon, authenticated;

create trigger guard_activity_lead before insert or update on public.activities
  for each row execute function public.guard_activity_lead();

-- A lead who leaves the activity or becomes an observer stops being its lead.
create function public.clear_lead_of_departed_participant()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' or new.role <> 'participant' or new.user_id <> old.user_id
    or new.activity_id <> old.activity_id
  then
    update public.activities a set lead_id = null
    where a.id = old.activity_id and a.lead_id = old.user_id;
  end if;
  return null;
end;
$$;

revoke all on function public.clear_lead_of_departed_participant() from public, anon, authenticated;

create trigger clear_lead_of_departed_participant after update or delete on public.activity_participants
  for each row execute function public.clear_lead_of_departed_participant();

-- A task always sits in its activity's group. Security definer: it reads the activity whatever
-- the caller may see; policies then check the group it sets.
create function public.sync_task_group()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.group_id := (select a.group_id from public.activities a where a.id = new.activity_id);
  return new;
end;
$$;

revoke all on function public.sync_task_group() from public, anon, authenticated;

create trigger sync_task_group before insert or update of activity_id, group_id on public.tasks
  for each row execute function public.sync_task_group();

-- completed_at is set when a task becomes done, kept while it stays done and cleared when it is
-- reopened. Nobody writes it directly.
create function public.set_task_completed_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status <> 'done' then
    new.completed_at = null;
  elsif tg_op = 'INSERT' or old.status <> 'done' then
    new.completed_at = now();
  else
    new.completed_at = old.completed_at;
  end if;
  return new;
end;
$$;

revoke all on function public.set_task_completed_at() from public, anon, authenticated;

create trigger set_task_completed_at before insert or update on public.tasks
  for each row execute function public.set_task_completed_at();

-- Every group gets its General activity when it is created.
create function public.create_general_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.activities (group_id, type, title, description, status, is_general)
  values (
    new.id, 'general', 'General', 'Standing activity for tasks that belong to no other activity.',
    'active', true
  );
  return null;
end;
$$;

revoke all on function public.create_general_activity() from public, anon, authenticated;

create trigger create_general_activity after insert on public.working_groups
  for each row execute function public.create_general_activity();

-- Backfill: groups created before activities existed (Lobbying).
insert into public.activities (group_id, type, title, description, status, is_general)
select g.id, 'general', 'General', 'Standing activity for tasks that belong to no other activity.',
  'active', true
from public.working_groups g
where not exists (
  select 1 from public.activities a where a.group_id = g.id and a.is_general
);

-- Policy helpers for the T-01 part 2 policies. Security definer over the W-01 helpers: only active
-- people in groups that are not archived count; admins pass.

-- The group of an activity, or null. Group ids are not secret (list functions return them).
create function public.activity_group(p_activity uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select a.group_id from public.activities a where a.id = p_activity;
$$;

-- Spec section 3: activities and tasks are created by fresh or experienced members, or admins.
create function public.can_create_in_group(p_group uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_admin()
    or coalesce(public.wg_member_level(p_group) in ('fresh', 'experienced'), false);
$$;

-- Admins; or an active member of the group who created the activity, leads it, or is experienced.
create function public.can_edit_activity(p_activity uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.activities a
    cross join lateral (select public.wg_member_level(a.group_id) as level) m
    where a.id = p_activity
      and (
        public.is_admin()
        or (
          m.level is not null
          and (
            a.created_by = (select auth.uid())
            or a.lead_id = (select auth.uid())
            or m.level = 'experienced'
          )
        )
      )
  );
$$;

-- Admins; or an active member of the group who created the activity or is experienced.
create function public.can_archive_activity(p_activity uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.activities a
    cross join lateral (select public.wg_member_level(a.group_id) as level) m
    where a.id = p_activity
      and (
        public.is_admin()
        or (m.level is not null and (a.created_by = (select auth.uid()) or m.level = 'experienced'))
      )
  );
$$;

revoke all on function public.activity_group(uuid) from public, anon;
revoke all on function public.can_create_in_group(uuid) from public, anon;
revoke all on function public.can_edit_activity(uuid) from public, anon;
revoke all on function public.can_archive_activity(uuid) from public, anon;
grant execute on function public.activity_group(uuid) to authenticated, service_role;
grant execute on function public.can_create_in_group(uuid) to authenticated, service_role;
grant execute on function public.can_edit_activity(uuid) to authenticated, service_role;
grant execute on function public.can_archive_activity(uuid) to authenticated, service_role;

-- Start from nothing and grant only what the policies of part 2 will filter.
revoke all on public.activities, public.activity_participants, public.tasks
  from public, anon, authenticated, service_role;

-- No member delete: activities are archived, tasks stay as the trail of the work.
grant select, insert, update on public.activities, public.tasks to authenticated;
-- Joining and leaving go through functions (part 2).
grant select on public.activity_participants to authenticated;
grant select, insert, update, delete on public.activities, public.activity_participants, public.tasks
  to service_role;

alter table public.activities enable row level security;
alter table public.activity_participants enable row level security;
alter table public.tasks enable row level security;
