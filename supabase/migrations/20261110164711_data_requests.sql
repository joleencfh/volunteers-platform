-- P-03: a member asks an admin to export or delete their data (spec section 9, "Rights").
-- The decision behind this table is in docs/adr/0017-data-requests.md.

create type public.data_request_kind as enum ('export', 'deletion');
create type public.data_request_status as enum ('open', 'done');

create table public.data_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  kind public.data_request_kind not null,
  status public.data_request_status not null default 'open',
  created_at timestamptz not null default now(),
  handled_at timestamptz,
  handled_by uuid references public.users (id) on delete set null
);

create index data_requests_user_id_idx on public.data_requests (user_id);
create index data_requests_handled_by_idx on public.data_requests (handled_by);

-- At most one open request per member and kind: a second click is a quiet no-op in the action.
create unique index data_requests_one_open_per_kind
  on public.data_requests (user_id, kind) where status = 'open';

revoke all on public.data_requests from public, anon, authenticated, service_role;
-- A member only ever creates a request (user and kind; everything else is defaulted); an admin
-- only ever marks one handled. Nobody edits a request's owner, kind or date.
grant select on public.data_requests to authenticated, service_role;
grant insert (user_id, kind) on public.data_requests to authenticated;
grant update (status, handled_at, handled_by) on public.data_requests to authenticated;
grant insert, update, delete on public.data_requests to service_role;

alter table public.data_requests enable row level security;

create policy data_requests_select_own on public.data_requests
  for select to authenticated
  using (user_id = (select auth.uid()) and (select public.is_active_member()));

create policy data_requests_select_admin on public.data_requests
  for select to authenticated
  using ((select public.is_admin()));

create policy data_requests_insert_own on public.data_requests
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and status = 'open'
    and handled_at is null
    and handled_by is null
    and (select public.is_active_member())
  );

create policy data_requests_update_admin on public.data_requests
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
