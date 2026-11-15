-- W-01 (part 2): the limited view of working groups (spec section 5). Non-members never read the
-- base tables (ADR-0018); these functions return what every active member may see about a group:
-- name, description and this week's lead. Members, meetings and tasks are never returned here, and
-- the Signal and docs links only to members of that group and admins. Activity titles arrive in T-01.

-- Every group the caller may know about, one row each, ordered by name. Nothing unless the caller
-- is an active member. Admins also get archived groups (archived = true), for the admin screens.
-- The lead is the wg_leads row of the current week (Monday, UTC), shown only while that person is
-- active; display names are visible to all members.
create function public.list_working_groups()
returns table (
  id uuid,
  slug text,
  name text,
  description text,
  is_member boolean,
  archived boolean,
  lead_user_id uuid,
  lead_display_name text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    g.id,
    g.slug,
    g.name,
    g.description,
    g.archived_at is null and exists (
      select 1 from public.wg_members m where m.group_id = g.id and m.user_id = me.id
    ),
    g.archived_at is not null,
    lu.id,
    lu.display_name
  from public.working_groups g
  join public.users me on me.id = (select auth.uid()) and me.status = 'active'
  left join public.wg_leads l
    on l.group_id = g.id and l.week_start = date_trunc('week', now() at time zone 'utc')::date
  left join public.users lu on lu.id = l.user_id and lu.status = 'active'
  where g.archived_at is null or me.is_admin
  order by g.name, g.slug;
$$;

-- One group by slug, with the same columns plus the two links, which stay null unless the caller
-- is an active admin or a member of the group. No row when the group does not exist, is archived
-- and the caller is not an admin, or the caller is not an active member.
create function public.get_working_group(p_slug text)
returns table (
  id uuid,
  slug text,
  name text,
  description text,
  is_member boolean,
  archived boolean,
  lead_user_id uuid,
  lead_display_name text,
  signal_url text,
  docs_url text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    v.id,
    v.slug,
    v.name,
    v.description,
    v.is_member,
    v.archived,
    v.lead_user_id,
    v.lead_display_name,
    case when v.is_member or public.is_admin() then g.signal_url end,
    case when v.is_member or public.is_admin() then g.docs_url end
  from public.list_working_groups() v
  join public.working_groups g on g.id = v.id
  where v.slug = get_working_group.p_slug;
$$;

revoke all on function public.list_working_groups() from public, anon;
revoke all on function public.get_working_group(text) from public, anon;
grant execute on function public.list_working_groups() to authenticated, service_role;
grant execute on function public.get_working_group(text) to authenticated, service_role;
