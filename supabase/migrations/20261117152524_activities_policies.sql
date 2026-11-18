-- T-01 (part 2): who reads and writes activities, participants and tasks (spec section 3 matrix),
-- joining and leaving, the lead, and the limited view of activities for non-members (spec
-- section 5). Decisions: docs/adr/0019-activities-and-tasks-data-model.md ("Access"). The rules
-- are repeated in lib/domain/activities.ts; tests/db/activities-rls.test.ts fails if they drift.
--
-- Errors the functions and guards raise, so server actions can map them to typed states:
--   42501 not allowed, P0002 not found (also when the caller may not see the activity),
--   55000 conflict (archived activity or group), 22023 / 23514 invalid input.

-- Activities ---------------------------------------------------------------------------------

-- Members of the group read its activities; archived ones only if they may archive them.
-- Non-members read nothing here: they get list_group_activities below.
create policy activities_select on public.activities
  for select to authenticated
  using (
    (select public.is_admin())
    or (
      public.is_wg_member(group_id)
      and (archived_at is null or public.can_archive_activity(id))
    )
  );

-- Fresh and experienced members, and admins, create activities in an active group, as
-- themselves. The General activity comes only from its trigger; new activities start unarchived.
create policy activities_insert on public.activities
  for insert to authenticated
  with check (
    public.can_create_in_group(group_id)
    and public.is_active_working_group(group_id)
    and created_by = (select auth.uid())
    and not is_general
    and type <> 'general'
    and archived_at is null
  );

-- guard_activity_update narrows this: archiving needs can_archive_activity, the creator stays.
create policy activities_update on public.activities
  for update to authenticated
  using (public.can_edit_activity(id))
  with check (public.can_edit_activity(id));

-- No delete policy: members archive activities; the service role deletes if ever needed.

-- Column rules on top of the update policy, for members (functions and the service role are
-- trusted). Archiving and restoring need can_archive_activity. Nobody, admins included, rewrites
-- the creator: it decides who may archive.
create function public.guard_activity_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;
  if (new.created_by, new.created_at) is distinct from (old.created_by, old.created_at) then
    raise exception 'an activity keeps its creator' using errcode = '42501';
  end if;
  if new.archived_at is distinct from old.archived_at and not public.can_archive_activity(old.id) then
    raise exception 'only the creator, experienced members and admins archive an activity'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_activity_update() from public, anon, authenticated;

create trigger guard_activity_update before update on public.activities
  for each row execute function public.guard_activity_update();

-- Participants -------------------------------------------------------------------------------

-- Members of the activity's group and admins see who takes part. Writes go through
-- join_activity and leave_activity only (no insert, update or delete grant for members).
create policy activity_participants_select on public.activity_participants
  for select to authenticated
  using ((select public.is_admin()) or public.is_wg_member(public.activity_group(activity_id)));

-- Tasks --------------------------------------------------------------------------------------

create policy tasks_select on public.tasks
  for select to authenticated
  using ((select public.is_admin()) or public.is_wg_member(group_id));

-- Fresh and experienced members, and admins, create tasks; a new volunteer cannot. group_id is
-- already the activity's group here (sync_task_group runs before the check).
create policy tasks_insert on public.tasks
  for insert to authenticated
  with check (
    public.can_create_in_group(group_id)
    and public.is_active_working_group(group_id)
    and created_by = (select auth.uid())
  );

-- Any member of the group may update a task as far as the policy goes; guard_task_write decides
-- which columns each person may change.
create policy tasks_update on public.tasks
  for update to authenticated
  using ((select public.is_admin()) or public.is_wg_member(group_id))
  with check ((select public.is_admin()) or public.is_wg_member(group_id));

-- No delete policy: tasks stay as the trail of the work.

-- The task rules (spec section 3, plan decisions), for members; functions and the service role
-- are trusted.
--   * The assignee is always an active member of the task's group (admins too).
--   * Admins change anything else.
--   * A member creates a task that is not done yet.
--   * Nobody but an admin moves a task to another activity or rewrites its creator.
--   * The creator, the assignee and experienced members of the group ("editors") change the
--     title, description, due date, assignee and the open / in progress status.
--   * Any other member may only take an unassigned task (assignee null -> themselves), and change
--     nothing else in the same write.
--   * Only the assignee moves a task to done, with the completion note or link, and only the
--     assignee changes those two fields.
--   * A done task keeps its status, assignee and completion: only an admin reopens it.
create function public.guard_task_write()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_me uuid;
  v_group uuid;
  v_editor boolean;
begin
  if current_user <> 'authenticated' then
    return new;
  end if;
  v_me := (select auth.uid());
  -- The activity's group: on insert this trigger runs before sync_task_group sets group_id.
  v_group := public.activity_group(new.activity_id);

  if new.assignee_id is not null
    and (tg_op = 'INSERT' or new.assignee_id is distinct from old.assignee_id)
    and not coalesce(public.is_wg_member(v_group, new.assignee_id), false)
  then
    raise exception 'the assignee must be a member of the group' using errcode = '23514';
  end if;

  if public.is_admin() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.status = 'done' then
      raise exception 'a new task is not done yet' using errcode = '42501';
    end if;
    return new;
  end if;

  if (new.id, new.activity_id, new.created_by, new.created_at)
    is distinct from (old.id, old.activity_id, old.created_by, old.created_at)
  then
    raise exception 'only admins move a task or change its creator' using errcode = '42501';
  end if;

  v_editor := coalesce(old.created_by = v_me, false)
    or coalesce(old.assignee_id = v_me, false)
    or coalesce(public.wg_member_level(old.group_id) = 'experienced', false);

  if not v_editor then
    if old.assignee_id is null
      and new.assignee_id = v_me
      and (new.title, new.description, new.due_on, new.status, new.completion_note, new.completion_url)
        is not distinct from
        (old.title, old.description, old.due_on, old.status, old.completion_note, old.completion_url)
    then
      return new;
    end if;
    raise exception 'only the creator, the assignee and experienced members edit this task'
      using errcode = '42501';
  end if;

  if old.status = 'done' then
    if (new.status, new.assignee_id, new.completion_note, new.completion_url)
      is distinct from (old.status, old.assignee_id, old.completion_note, old.completion_url)
    then
      raise exception 'only an admin reopens or reassigns a done task' using errcode = '42501';
    end if;
    return new;
  end if;

  if (new.completion_note, new.completion_url) is distinct from (old.completion_note, old.completion_url)
    and not coalesce(old.assignee_id = v_me, false)
  then
    raise exception 'only the assignee records the completion' using errcode = '42501';
  end if;

  if new.status = 'done'
    and not (coalesce(old.assignee_id = v_me, false) and coalesce(new.assignee_id = v_me, false))
  then
    raise exception 'only the assignee completes a task' using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.guard_task_write() from public, anon, authenticated;

create trigger guard_task_write before insert or update on public.tasks
  for each row execute function public.guard_task_write();

-- Functions ----------------------------------------------------------------------------------

-- Joins the caller to an activity, or changes their role. Active members of the group and admins
-- only; a new volunteer only observes (spec section 3). The General activity can be joined too.
create function public.join_activity(p_activity uuid, p_role public.participant_role)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_activity public.activities;
  v_level public.user_level;
  v_admin boolean := public.is_admin();
begin
  if p_activity is null or p_role is null then
    raise exception 'activity and role are required' using errcode = '22023';
  end if;

  select * into v_activity from public.activities a where a.id = p_activity;
  if not found then
    raise exception 'activity not found' using errcode = 'P0002';
  end if;

  v_level := public.wg_member_level(v_activity.group_id);
  -- "Not allowed" reads as "not found" for people outside the group.
  if not v_admin and v_level is null then
    raise exception 'activity not found' using errcode = 'P0002';
  end if;
  if v_activity.archived_at is not null or not public.is_active_working_group(v_activity.group_id) then
    raise exception 'the activity is archived' using errcode = '55000';
  end if;
  if not v_admin and v_level = 'new' and p_role <> 'observer' then
    raise exception 'new volunteers join as observers' using errcode = '42501';
  end if;

  insert into public.activity_participants (activity_id, user_id, role)
  values (p_activity, (select auth.uid()), p_role)
  on conflict (activity_id, user_id) do update set role = excluded.role;
end;
$$;

-- Removes the caller from an activity. Anyone may leave; a lead who leaves stops being the lead
-- (clear_lead_of_departed_participant). Returns whether the caller was taking part.
create function public.leave_activity(p_activity uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_removed integer;
begin
  if not public.is_active_member() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  delete from public.activity_participants p
  where p.activity_id = p_activity and p.user_id = (select auth.uid());
  get diagnostics v_removed = row_count;
  return v_removed > 0;
end;
$$;

-- Sets or clears (null) the lead of an activity. The caller must be allowed to edit it; the lead
-- must be an active member of the group taking part with the role 'participant'.
create function public.set_activity_lead(p_activity uuid, p_user uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_activity public.activities;
begin
  if p_activity is null then
    raise exception 'activity is required' using errcode = '22023';
  end if;

  select * into v_activity from public.activities a where a.id = p_activity;
  if not found
    or not (public.is_admin() or public.wg_member_level(v_activity.group_id) is not null)
  then
    raise exception 'activity not found' using errcode = 'P0002';
  end if;
  if not public.can_edit_activity(p_activity) then
    raise exception 'not allowed to edit this activity' using errcode = '42501';
  end if;
  if v_activity.archived_at is not null or not public.is_active_working_group(v_activity.group_id) then
    raise exception 'the activity is archived' using errcode = '55000';
  end if;
  if p_user is not null and not (
    coalesce(public.is_wg_member(v_activity.group_id, p_user), false)
    and exists (
      select 1 from public.activity_participants p
      where p.activity_id = p_activity and p.user_id = p_user and p.role = 'participant'
    )
  ) then
    raise exception 'the lead must be a participant of the activity' using errcode = '22023';
  end if;

  update public.activities a set lead_id = p_user where a.id = p_activity;
end;
$$;

-- The limited view of a group's activities (spec section 5), for every active member: titles,
-- status, type, key flag and whether it is the General activity. No description, details, links,
-- participants, tasks or postmortem. Non-archived activities of an active group; admins also get
-- archived activities and archived groups (archived = true).
create function public.list_group_activities(p_group uuid)
returns table (
  id uuid,
  title text,
  status public.activity_status,
  type text,
  key_activity boolean,
  is_general boolean,
  archived boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select a.id, a.title, a.status, a.type, a.key_activity, a.is_general,
    a.archived_at is not null or g.archived_at is not null
  from public.activities a
  join public.working_groups g on g.id = a.group_id
  where a.group_id = list_group_activities.p_group
    and public.is_active_member()
    and (public.is_admin() or (g.archived_at is null and a.archived_at is null))
  order by a.is_general desc, a.created_at, a.id;
$$;

revoke all on function public.join_activity(uuid, public.participant_role) from public, anon;
revoke all on function public.leave_activity(uuid) from public, anon;
revoke all on function public.set_activity_lead(uuid, uuid) from public, anon;
revoke all on function public.list_group_activities(uuid) from public, anon;
grant execute on function public.join_activity(uuid, public.participant_role)
  to authenticated, service_role;
grant execute on function public.leave_activity(uuid) to authenticated, service_role;
grant execute on function public.set_activity_lead(uuid, uuid) to authenticated, service_role;
grant execute on function public.list_group_activities(uuid) to authenticated, service_role;
