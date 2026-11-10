-- P-01: profile fields and per-field visibility (spec section 7).
-- Decisions behind the functions, defaults and write path are in
-- docs/adr/0014-profile-visibility-enforcement.md. The field list, tiers and defaults are repeated
-- in lib/domain/profile-fields.ts; tests/db/profile-visibility.test.ts fails if the two drift.

alter table public.users
  add column bio text
    constraint users_bio_length check (char_length(bio) <= 500),
  add column linkedin_url text
    constraint users_linkedin_url_format check (
      char_length(linkedin_url) <= 300 and linkedin_url like 'https://%'
    ),
  add column ai_safety_knowledge text
    constraint users_ai_safety_knowledge_choice check (
      ai_safety_knowledge in ('none', 'basic', 'intermediate', 'advanced')
    ),
  add column ai_risks text
    constraint users_ai_risks_length check (char_length(ai_risks) <= 500);

-- A person's choice of tier for one optional field. A missing row means the field's default tier.
create table public.profile_visibility (
  user_id uuid not null references public.users (id) on delete cascade,
  field text not null check (field in ('city', 'bio', 'linkedin_url', 'ai_safety_knowledge', 'ai_risks')),
  tier text not null check (tier in ('admin', 'group', 'members')),
  primary key (user_id, field)
);

-- Default tier per optional field; null for anything that is not an optional profile field.
create function public.profile_field_default_tier(field text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case profile_field_default_tier.field
    when 'city' then 'admin'
    when 'bio' then 'members'
    when 'linkedin_url' then 'admin'
    when 'ai_safety_knowledge' then 'group'
    when 'ai_risks' then 'group'
  end;
$$;

-- Stub until working groups exist: nobody shares a group yet, so the "group" tier behaves like
-- "admin only". W-01 redefines this function with the same signature over its membership table.
create function public.shares_working_group(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select false;
$$;

-- The single enforcement point for optional profile fields. The owner and active admins see every
-- field; another active member sees it when the owner's tier is "members", or "group" and they
-- share a working group. Unknown fields and deactivated viewers or owners give false.
create function public.can_view_profile_field(viewer uuid, owner uuid, field text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with
    viewer_row as (
      select u.id, u.is_admin from public.users u
      where u.id = can_view_profile_field.viewer and u.status = 'active'
    ),
    owner_row as (
      select u.id from public.users u
      where u.id = can_view_profile_field.owner and u.status = 'active'
    ),
    effective as (
      select coalesce(
        (
          select pv.tier from public.profile_visibility pv
          where pv.user_id = can_view_profile_field.owner and pv.field = can_view_profile_field.field
        ),
        public.profile_field_default_tier(can_view_profile_field.field)
      ) as tier
    )
  select coalesce(
    (
      select case
        when public.profile_field_default_tier(can_view_profile_field.field) is null then false
        when o.id = v.id then true
        when v.is_admin then true
        when e.tier = 'members' then true
        when e.tier = 'group' then public.shares_working_group(v.id, o.id)
        else false
      end
      from viewer_row v, owner_row o, effective e
    ),
    false
  );
$$;

-- One person's profile as the caller may see it. No row unless both the caller and the owner are
-- active members. Display name and level always; optional fields null when hidden; the fixed
-- admin-only fields only for an active admin or the owner. How someone heard of PauseAI stays on
-- applications and is never returned here.
create function public.get_profile(owner uuid)
returns table (
  id uuid,
  display_name text,
  level public.user_level,
  city text,
  bio text,
  linkedin_url text,
  ai_safety_knowledge text,
  ai_risks text,
  real_name text,
  email text,
  joined_at timestamptz,
  first_active_at timestamptz,
  last_login_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    u.id,
    u.display_name,
    u.level,
    case when public.can_view_profile_field(me.id, u.id, 'city') then u.city end,
    case when public.can_view_profile_field(me.id, u.id, 'bio') then u.bio end,
    case when public.can_view_profile_field(me.id, u.id, 'linkedin_url') then u.linkedin_url end,
    case when public.can_view_profile_field(me.id, u.id, 'ai_safety_knowledge')
      then u.ai_safety_knowledge end,
    case when public.can_view_profile_field(me.id, u.id, 'ai_risks') then u.ai_risks end,
    case when me.is_admin or me.id = u.id then u.real_name end,
    case when me.is_admin or me.id = u.id then u.email end,
    case when me.is_admin or me.id = u.id then u.joined_at end,
    case when me.is_admin or me.id = u.id then u.first_active_at end,
    case when me.is_admin or me.id = u.id then u.last_login_at end
  from public.users u
  join public.users me on me.id = (select auth.uid()) and me.status = 'active'
  where u.id = get_profile.owner and u.status = 'active';
$$;

-- The only way a member changes their own row (ADR-0009: no broad update policy on users).
-- Touches the editable profile columns only, never level, is_admin, status, email or dates.
-- Blank optional values are stored as null; the column checks enforce the remaining limits.
create function public.update_own_profile(
  display_name text,
  city text,
  bio text,
  linkedin_url text,
  ai_safety_knowledge text,
  ai_risks text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_active_member() then
    raise exception 'not an active member' using errcode = '42501';
  end if;
  if char_length(trim(coalesce(update_own_profile.display_name, ''))) not between 1 and 60 then
    raise exception 'display name must be 1 to 60 characters' using errcode = '22023';
  end if;
  if char_length(trim(update_own_profile.city)) > 100 then
    raise exception 'city must be at most 100 characters' using errcode = '22023';
  end if;

  update public.users set
    display_name = trim(update_own_profile.display_name),
    city = nullif(trim(update_own_profile.city), ''),
    bio = nullif(trim(update_own_profile.bio), ''),
    linkedin_url = nullif(trim(update_own_profile.linkedin_url), ''),
    ai_safety_knowledge = nullif(trim(update_own_profile.ai_safety_knowledge), ''),
    ai_risks = nullif(trim(update_own_profile.ai_risks), '')
  where id = (select auth.uid());
end;
$$;

revoke all on function public.profile_field_default_tier(text) from public, anon, authenticated;
revoke all on function public.shares_working_group(uuid, uuid) from public, anon, authenticated;
revoke all on function public.can_view_profile_field(uuid, uuid, text)
  from public, anon, authenticated;
revoke all on function public.get_profile(uuid) from public, anon;
revoke all on function public.update_own_profile(text, text, text, text, text, text)
  from public, anon;
-- The building blocks stay internal: called with any viewer id they would tell a member about
-- other people's choices and groups. Members go through get_profile.
grant execute on function public.profile_field_default_tier(text) to service_role;
grant execute on function public.shares_working_group(uuid, uuid) to service_role;
grant execute on function public.can_view_profile_field(uuid, uuid, text) to service_role;
grant execute on function public.get_profile(uuid) to authenticated, service_role;
grant execute on function public.update_own_profile(text, text, text, text, text, text)
  to authenticated, service_role;

revoke all on public.profile_visibility from public, anon, authenticated, service_role;
grant select, insert, update, delete on public.profile_visibility to authenticated, service_role;

alter table public.profile_visibility enable row level security;

-- An active member manages their own choices; admins read everyone's.
create policy profile_visibility_own on public.profile_visibility
  for all to authenticated
  using (user_id = (select auth.uid()) and (select public.is_active_member()))
  with check (user_id = (select auth.uid()) and (select public.is_active_member()));

create policy profile_visibility_select_admin on public.profile_visibility
  for select to authenticated
  using ((select public.is_admin()));
