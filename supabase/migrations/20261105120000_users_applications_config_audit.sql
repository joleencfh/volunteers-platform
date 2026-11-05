-- A-01: data foundation for members, applications, configuration and the audit log.
-- Decisions behind the view, grants and foreign keys are in docs/adr/0009-member-data-foundation.md.

create type public.user_level as enum ('new', 'fresh', 'experienced');
create type public.user_status as enum ('active', 'deactivated');
create type public.application_status as enum ('pending', 'approved', 'rejected');
create type public.heard_source as enum ('global_website', 'italian_website', 'word_of_mouth', 'other');

-- Members. A row exists only for approved people.
create table public.users (
  id uuid primary key references auth.users (id) on delete restrict,
  display_name text not null check (char_length(trim(display_name)) > 0),
  real_name text not null check (char_length(trim(real_name)) > 0),
  email text not null check (position('@' in email) > 1),
  city text,
  level public.user_level not null default 'new',
  is_admin boolean not null default false,
  status public.user_status not null default 'active',
  locale text not null default 'en' check (locale in ('en', 'it')),
  joined_at timestamptz not null default now(),
  first_active_at timestamptz,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Email is the identifier sign-in matches, case-insensitively.
create unique index users_email_lower_key on public.users (lower(email));

create trigger set_updated_at before update on public.users
  for each row execute function public.set_updated_at();

-- Applications are kept after the decision for the retention period in config.
create table public.applications (
  id uuid primary key default gen_random_uuid(),
  display_name text not null check (char_length(trim(display_name)) > 0),
  real_name text not null check (char_length(trim(real_name)) > 0),
  email text not null check (position('@' in email) > 1),
  city text not null check (char_length(trim(city)) > 0),
  motivation text,
  heard_via public.heard_source not null,
  heard_other text,
  -- The spec does not list the choices yet; the application form (A-03) owns and validates them.
  ai_safety_knowledge text,
  privacy_accepted_at timestamptz not null,
  special_category_consent_at timestamptz not null,
  notice_version text not null check (char_length(trim(notice_version)) > 0),
  status public.application_status not null default 'pending',
  decided_by uuid references public.users (id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint applications_heard_other_only_for_other check (
    (heard_via = 'other' and char_length(trim(coalesce(heard_other, ''))) > 0)
    or (heard_via <> 'other' and heard_other is null)
  ),
  constraint applications_decision_matches_status check (
    (status = 'pending' and decided_at is null and decided_by is null)
    or (status <> 'pending' and decided_at is not null)
  )
);

-- One open application per email; a rejected person may apply again.
create unique index applications_one_open_per_email
  on public.applications (lower(email))
  where status = 'pending';
create index applications_status_created_at_idx on public.applications (status, created_at desc);
create index applications_decided_by_idx on public.applications (decided_by);

create trigger set_updated_at before update on public.applications
  for each row execute function public.set_updated_at();

-- Settings read at run time instead of constants in code (CLAUDE.md rule 11).
create table public.config (
  key text primary key,
  value jsonb not null,
  description text not null,
  updated_at timestamptz not null default now()
);

create trigger set_updated_at before update on public.config
  for each row execute function public.set_updated_at();

insert into public.config (key, value, description) values
  ('level.new_to_fresh.completed_tasks', '3', 'Completed tasks needed to move from new to fresh'),
  ('level.fresh_to_experienced.activities_as_participant', '7', 'Activities joined as a participant needed to move from fresh to experienced'),
  ('level.fresh_to_experienced.completed_tasks', '20', 'Completed tasks needed to move from fresh to experienced'),
  ('level.fresh_to_experienced.times_as_wg_lead', '3', 'Times as working group lead needed to move from fresh to experienced'),
  ('level.fresh_to_experienced.months_since_joining', '2', 'Months since joining needed to move from fresh to experienced'),
  ('onboarding.welcome_document_url', '""', 'Link to the welcome document; empty until the maintainer sets it'),
  ('retention.rejected_applications_months', '6', 'Months a rejected application is kept'),
  ('retention.people_who_leave_months', '12', 'Months the personal fields of people who leave are kept');

-- Append-only record of admin actions. Written only by the server through the service role.
create table public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references public.users (id) on delete set null,
  action text not null check (char_length(trim(action)) > 0),
  entity_type text not null check (char_length(trim(entity_type)) > 0),
  entity_id text,
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index audit_log_created_at_idx on public.audit_log (created_at desc);
create index audit_log_entity_idx on public.audit_log (entity_type, entity_id);
create index audit_log_actor_id_idx on public.audit_log (actor_id);

-- Policy helpers. Security definer, so policies on public.users can read it without recursing.
-- Only an active member counts: a deactivated person keeps no rights, admin flag or not.
create function public.is_active_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.users
    where id = auth.uid() and status = 'active'
  );
$$;

create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.users
    where id = auth.uid() and status = 'active' and is_admin
  );
$$;

revoke all on function public.is_active_member() from public, anon;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_active_member() to authenticated, service_role;
grant execute on function public.is_admin() to authenticated, service_role;

-- What other members may see of a person. Deliberately not security_invoker: it reads rows the
-- caller's own policies hide, and only ever exposes these three columns, to active members.
create view public.members
with (security_invoker = false, security_barrier = true)
as
  select id, display_name, level
  from public.users
  where status = 'active' and public.is_active_member();

-- Supabase's default privileges grant everything to anon and authenticated. Start from nothing
-- and grant only what the policies below are meant to filter.
revoke all on public.users, public.applications, public.config, public.audit_log, public.members
  from public, anon, authenticated, service_role;

grant select, insert, update, delete on public.users, public.applications, public.config
  to authenticated, service_role;
grant select on public.audit_log to authenticated;
-- No update or delete for anyone: the log is append-only.
grant select, insert on public.audit_log to service_role;
grant select on public.members to authenticated, service_role;

alter table public.users enable row level security;
alter table public.applications enable row level security;
alter table public.config enable row level security;
alter table public.audit_log enable row level security;

-- Members have no write policy yet: nobody can change their own level or admin flag.
-- Profile editing (M2) adds its own narrow path.
create policy users_select_own on public.users
  for select to authenticated
  using (id = (select auth.uid()));

create policy users_admin_all on public.users
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- The public form inserts through the service role (A-03), so anon has no access at all.
create policy applications_admin_all on public.applications
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy config_select_members on public.config
  for select to authenticated
  using ((select public.is_active_member()));

create policy config_admin_all on public.config
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy audit_log_select_admin on public.audit_log
  for select to authenticated
  using ((select public.is_admin()));
