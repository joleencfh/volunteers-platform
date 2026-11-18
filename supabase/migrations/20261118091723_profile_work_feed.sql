-- T-06 (part 2): the "latest and planned activities and tasks" of a profile (spec section 7: same
-- working group, only items in groups the viewer can fully see; profiles never show more than the
-- viewer's access to the underlying working group allows). Filtered here, in the database, so the
-- profile pages never read another person's work with more rights than the viewer has.
--
-- Rules:
-- - The caller must be an active member; the owner must be active. Otherwise no rows.
-- - A row is returned only when its group is not archived and the caller is a member of that
--   group or an active admin. The same rule covers the owner looking at their own profile: they
--   see every item in all their groups.
-- - Activities: the owner takes part (participant or observer) or leads; planned, active, or done
--   in the last 90 days; never cancelled, archived or the General activity.
-- - Tasks: assigned to the owner; open, in progress, or done in the last 90 days; tasks of the
--   General activity included, tasks of archived activities not.
-- - Current items first (planned and active activities, open and in-progress tasks), then the most
--   recently updated; at most 30 rows.
-- No names of other people are returned. Security definer because the owner's participation and
-- assignments are not all visible to the caller through RLS; the visibility rules above replace it.

create function public.get_profile_work(p_owner uuid)
returns table (
  kind text,
  id uuid,
  title text,
  status text,
  due_on date,
  group_id uuid,
  group_name text,
  group_slug text,
  activity_id uuid,
  activity_title text,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  with
    me as (
      select u.id, u.is_admin from public.users u
      where u.id = (select auth.uid()) and u.status = 'active'
    ),
    owner_row as (
      select u.id from public.users u
      where u.id = get_profile_work.p_owner and u.status = 'active'
    ),
    -- Groups the caller can fully see: not archived, and the caller is an admin or a member.
    visible_groups as (
      select g.id, g.name, g.slug
      from public.working_groups g
      cross join me
      where g.archived_at is null
        and (
          me.is_admin
          or exists (
            select 1 from public.wg_members m
            where m.group_id = g.id and m.user_id = me.id
          )
        )
    ),
    owner_activities as (
      select
        'activity'::text as kind,
        a.id,
        a.title,
        a.status::text as status,
        a.due_on,
        g.id as group_id,
        g.name as group_name,
        g.slug as group_slug,
        a.id as activity_id,
        null::text as activity_title,
        a.updated_at,
        a.status in ('planned', 'active') as is_current
      from public.activities a
      join visible_groups g on g.id = a.group_id
      cross join owner_row o
      where not a.is_general
        and a.archived_at is null
        and (
          a.status in ('planned', 'active')
          or (a.status = 'done' and a.updated_at >= now() - interval '90 days')
        )
        and (
          a.lead_id = o.id
          or exists (
            select 1 from public.activity_participants p
            where p.activity_id = a.id and p.user_id = o.id
          )
        )
    ),
    owner_tasks as (
      select
        'task'::text as kind,
        t.id,
        t.title,
        t.status::text as status,
        t.due_on,
        g.id as group_id,
        g.name as group_name,
        g.slug as group_slug,
        a.id as activity_id,
        a.title as activity_title,
        t.updated_at,
        t.status in ('open', 'in_progress') as is_current
      from public.tasks t
      join public.activities a on a.id = t.activity_id and a.archived_at is null
      join visible_groups g on g.id = t.group_id
      cross join owner_row o
      where t.assignee_id = o.id
        and (
          t.status in ('open', 'in_progress')
          or (t.status = 'done' and t.completed_at >= now() - interval '90 days')
        )
    ),
    feed as (
      select * from owner_activities
      union all
      select * from owner_tasks
    )
  select
    f.kind, f.id, f.title, f.status, f.due_on, f.group_id, f.group_name, f.group_slug,
    f.activity_id, f.activity_title, f.updated_at
  from feed f
  order by f.is_current desc, f.updated_at desc, f.id
  limit 30;
$$;

revoke all on function public.get_profile_work(uuid) from public, anon;
grant execute on function public.get_profile_work(uuid) to authenticated, service_role;
