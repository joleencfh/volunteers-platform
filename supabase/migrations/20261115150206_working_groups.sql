-- W-01: working groups, membership, join requests, weekly leads and meetings (spec section 5).
-- Decisions behind the tables, helpers and policies are in
-- docs/adr/0018-working-group-data-model-and-access.md. The permission rules are repeated in
-- lib/domain/groups.ts; tests/db/working-groups-rls.test.ts fails if the two drift.

create type public.join_request_status as enum ('pending', 'approved', 'rejected');

create table public.working_groups (
  id uuid primary key default gen_random_uuid(),
  -- Chosen at creation and never changed, so group URLs stay stable.
  slug text not null unique check (
    slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 60
  ),
  name text not null check (char_length(trim(name)) between 1 and 80),
  description text not null check (char_length(trim(description)) between 1 and 500),
  signal_url text check (signal_url is null or signal_url ~ '^https://'),
  docs_url text check (docs_url is null or docs_url ~ '^https://'),
  -- Archived groups are kept but hidden from everyone except admins.
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_updated_at before update on public.working_groups
  for each row execute function public.set_updated_at();

create table public.wg_members (
  group_id uuid not null references public.working_groups (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  joined_at timestamptz not null default now(),
  added_by uuid references public.users (id) on delete set null,
  primary key (group_id, user_id)
);

create index wg_members_user_id_idx on public.wg_members (user_id);
create index wg_members_added_by_idx on public.wg_members (added_by);

create table public.wg_join_requests (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.working_groups (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  status public.join_request_status not null default 'pending',
  decided_by uuid references public.users (id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  constraint wg_join_requests_decision_matches_status check (
    (status = 'pending' and decided_at is null and decided_by is null)
    or (status <> 'pending' and decided_at is not null)
  )
);

-- One open request per person and group; a rejected person may ask again.
create unique index wg_join_requests_one_pending
  on public.wg_join_requests (group_id, user_id)
  where status = 'pending';
create index wg_join_requests_group_id_idx on public.wg_join_requests (group_id, status);
create index wg_join_requests_user_id_idx on public.wg_join_requests (user_id);
create index wg_join_requests_decided_by_idx on public.wg_join_requests (decided_by);

-- One lead per group and week (Monday, UTC: startOfIsoWeek in lib/domain/week.ts). Reassigning a
-- week replaces its row; past weeks stay as history.
create table public.wg_leads (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.working_groups (id) on delete cascade,
  week_start date not null check (extract(isodow from week_start) = 1),
  user_id uuid not null references public.users (id) on delete cascade,
  assigned_by uuid references public.users (id) on delete set null,
  assigned_at timestamptz not null default now(),
  unique (group_id, week_start)
);

create index wg_leads_user_id_idx on public.wg_leads (user_id);
create index wg_leads_assigned_by_idx on public.wg_leads (assigned_by);

create table public.wg_meetings (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.working_groups (id) on delete cascade,
  starts_at timestamptz not null,
  meeting_url text not null check (meeting_url ~ '^https://'),
  agenda_url text check (agenda_url is null or agenda_url ~ '^https://'),
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index wg_meetings_group_id_starts_at_idx on public.wg_meetings (group_id, starts_at);
create index wg_meetings_created_by_idx on public.wg_meetings (created_by);

create trigger set_updated_at before update on public.wg_meetings
  for each row execute function public.set_updated_at();

-- The first group. Admins add its members (W-06); T-01 adds its General activity.
insert into public.working_groups (slug, name, description) values
  ('lobbying', 'Lobbying', 'Contacting decision-makers to ask for an international pause on frontier AI development.');

-- Policy helpers. Security definer, so policies can read membership without recursing.
-- Only active people in groups that are not archived count; admins are handled by each caller.

-- True when the group exists and is not archived. Group ids are not secret: list functions return them.
create function public.is_active_working_group(p_group uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.working_groups g
    where g.id = p_group and g.archived_at is null
  );
$$;

-- Whether p_user is an active member of the active group p_group. Asking about someone else is
-- answered only to admins and members of that group, so the member list cannot be probed.
create function public.is_wg_member(p_group uuid, p_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with member_of as (
    select m.user_id
    from public.wg_members m
    join public.users u on u.id = m.user_id and u.status = 'active'
    join public.working_groups g on g.id = m.group_id and g.archived_at is null
    where m.group_id = p_group
  )
  select exists (select 1 from member_of where user_id = p_user)
    and (
      coalesce(p_user = (select auth.uid()), false)
      or public.is_admin()
      or exists (select 1 from member_of where user_id = (select auth.uid()))
    );
$$;

-- The caller's level when they are an active member of the active group; null otherwise.
create function public.wg_member_level(p_group uuid)
returns public.user_level
language sql
stable
security definer
set search_path = ''
as $$
  select u.level
  from public.wg_members m
  join public.users u on u.id = m.user_id and u.status = 'active'
  join public.working_groups g on g.id = m.group_id and g.archived_at is null
  where m.group_id = p_group and m.user_id = (select auth.uid());
$$;

-- Spec section 3: join requests are approved by fresh or experienced members of the group, or admins.
create function public.can_approve_join(p_group uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_admin()
    or coalesce(public.wg_member_level(p_group) in ('fresh', 'experienced'), false);
$$;

-- Spec section 3: the lead of the week is assigned by experienced members of the group, or admins.
create function public.can_assign_lead(p_group uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_admin() or coalesce(public.wg_member_level(p_group) = 'experienced', false);
$$;

-- Meetings and the Signal and docs links: fresh or experienced members of the group, or admins.
create function public.can_edit_group_content(p_group uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_admin()
    or coalesce(public.wg_member_level(p_group) in ('fresh', 'experienced'), false);
$$;

-- An active member who is not an admin may ask to join an active group they are not in.
create function public.can_request_join(p_group uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_active_member()
    and not public.is_admin()
    and public.is_active_working_group(p_group)
    and public.wg_member_level(p_group) is null;
$$;

-- Replaces the P-01 stub (same signature, attributes and grants): true when both people are
-- active and members of one group that is not archived. Drives the "group" profile tier.
create or replace function public.shares_working_group(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.wg_members ma
    join public.wg_members mb on mb.group_id = ma.group_id
    join public.working_groups g on g.id = ma.group_id and g.archived_at is null
    join public.users ua on ua.id = ma.user_id and ua.status = 'active'
    join public.users ub on ub.id = mb.user_id and ub.status = 'active'
    where ma.user_id = shares_working_group.a and mb.user_id = shares_working_group.b
  );
$$;

revoke all on function public.is_active_working_group(uuid) from public, anon;
revoke all on function public.is_wg_member(uuid, uuid) from public, anon;
revoke all on function public.wg_member_level(uuid) from public, anon;
revoke all on function public.can_approve_join(uuid) from public, anon;
revoke all on function public.can_assign_lead(uuid) from public, anon;
revoke all on function public.can_edit_group_content(uuid) from public, anon;
revoke all on function public.can_request_join(uuid) from public, anon;
grant execute on function public.is_active_working_group(uuid) to authenticated, service_role;
grant execute on function public.is_wg_member(uuid, uuid) to authenticated, service_role;
grant execute on function public.wg_member_level(uuid) to authenticated, service_role;
grant execute on function public.can_approve_join(uuid) to authenticated, service_role;
grant execute on function public.can_assign_lead(uuid) to authenticated, service_role;
grant execute on function public.can_edit_group_content(uuid) to authenticated, service_role;
grant execute on function public.can_request_join(uuid) to authenticated, service_role;

-- Members who may edit group content change only the two links. Admins change anything. The
-- service role and maintenance sessions are not members, so the guard applies to members only.
create function public.guard_working_group_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user = 'authenticated'
    and not public.is_admin()
    and (new.id, new.slug, new.name, new.description, new.archived_at, new.created_at)
      is distinct from (old.id, old.slug, old.name, old.description, old.archived_at, old.created_at)
  then
    raise exception 'only admins change a working group beyond its links' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_working_group_update() from public, anon, authenticated;

create trigger guard_working_group_update before update on public.working_groups
  for each row execute function public.guard_working_group_update();

-- A removed member cannot stay lead: their current and future weeks in that group go too.
create function public.drop_future_leads_of_removed_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.wg_leads l
  where l.group_id = old.group_id
    and l.user_id = old.user_id
    and l.week_start >= date_trunc('week', now() at time zone 'utc')::date;
  return old;
end;
$$;

revoke all on function public.drop_future_leads_of_removed_member() from public, anon, authenticated;

create trigger drop_future_leads_of_removed_member after delete on public.wg_members
  for each row execute function public.drop_future_leads_of_removed_member();

-- Start from nothing and grant only what the policies below filter.
revoke all on public.working_groups, public.wg_members, public.wg_join_requests, public.wg_leads,
  public.wg_meetings
  from public, anon, authenticated, service_role;

grant select, insert, update, delete on public.working_groups, public.wg_meetings
  to authenticated, service_role;
-- Membership rows are added and removed, never edited.
grant select, insert, delete on public.wg_members to authenticated, service_role;
-- Members only ask; the decision function of W-03 changes the status.
grant select, insert on public.wg_join_requests to authenticated;
grant select, insert, update, delete on public.wg_join_requests to service_role;
-- No member delete: past weeks are history, and the removal trigger clears future weeks.
grant select, insert, update on public.wg_leads to authenticated;
grant select, insert, update, delete on public.wg_leads to service_role;

alter table public.working_groups enable row level security;
alter table public.wg_members enable row level security;
alter table public.wg_join_requests enable row level security;
alter table public.wg_leads enable row level security;
alter table public.wg_meetings enable row level security;

-- Non-members never read these tables; they get the limited view through functions (W-01 part 2).
create policy working_groups_select on public.working_groups
  for select to authenticated
  using ((select public.is_admin()) or public.is_wg_member(id));

create policy working_groups_insert_admin on public.working_groups
  for insert to authenticated
  with check ((select public.is_admin()));

-- The guard trigger narrows non-admin updates to the two links.
create policy working_groups_update on public.working_groups
  for update to authenticated
  using (public.can_edit_group_content(id))
  with check (public.can_edit_group_content(id));

create policy working_groups_delete_admin on public.working_groups
  for delete to authenticated
  using ((select public.is_admin()));

create policy wg_members_select on public.wg_members
  for select to authenticated
  using ((select public.is_admin()) or public.is_wg_member(group_id));

create policy wg_members_insert_admin on public.wg_members
  for insert to authenticated
  with check ((select public.is_admin()));

create policy wg_members_delete_admin on public.wg_members
  for delete to authenticated
  using ((select public.is_admin()));

create policy wg_join_requests_insert_own on public.wg_join_requests
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and status = 'pending'
    and decided_by is null
    and decided_at is null
    and public.can_request_join(group_id)
  );

create policy wg_join_requests_select on public.wg_join_requests
  for select to authenticated
  using (
    (
      user_id = (select auth.uid())
      and (select public.is_active_member())
      and public.is_active_working_group(group_id)
    )
    or public.can_approve_join(group_id)
  );

create policy wg_leads_select on public.wg_leads
  for select to authenticated
  using ((select public.is_admin()) or public.is_wg_member(group_id));

create policy wg_leads_insert on public.wg_leads
  for insert to authenticated
  with check (
    public.can_assign_lead(group_id)
    and public.is_wg_member(group_id, user_id)
    and assigned_by = (select auth.uid())
    and week_start >= date_trunc('week', now() at time zone 'utc')::date
  );

create policy wg_leads_update on public.wg_leads
  for update to authenticated
  using (
    public.can_assign_lead(group_id)
    and week_start >= date_trunc('week', now() at time zone 'utc')::date
  )
  with check (
    public.can_assign_lead(group_id)
    and public.is_wg_member(group_id, user_id)
    and assigned_by = (select auth.uid())
    and week_start >= date_trunc('week', now() at time zone 'utc')::date
  );

create policy wg_meetings_select on public.wg_meetings
  for select to authenticated
  using ((select public.is_admin()) or public.is_wg_member(group_id));

create policy wg_meetings_insert on public.wg_meetings
  for insert to authenticated
  with check (public.can_edit_group_content(group_id) and created_by = (select auth.uid()));

create policy wg_meetings_update on public.wg_meetings
  for update to authenticated
  using (public.can_edit_group_content(group_id))
  with check (public.can_edit_group_content(group_id));

create policy wg_meetings_delete on public.wg_meetings
  for delete to authenticated
  using (public.can_edit_group_content(group_id));
