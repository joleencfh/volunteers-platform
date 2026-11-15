-- W-03: deciding join requests, and counting the ones a person may decide.
-- Members only ask (insert policy on wg_join_requests); this function is the only way a request
-- changes status, so approving a request and adding the membership happen together or not at all.

-- Approves or rejects one pending request. The caller must be allowed to approve joins for the
-- request's group (any fresh or experienced member of it, or an admin). Returns the new status.
create function public.decide_join_request(p_request uuid, p_approve boolean)
returns public.join_request_status
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_request public.wg_join_requests;
  v_status public.join_request_status;
begin
  if p_request is null or p_approve is null then
    raise exception 'request and decision are required' using errcode = '22023';
  end if;

  -- Lock the row so two approvers deciding at once cannot both act on it.
  select * into v_request from public.wg_join_requests where id = p_request for update;
  if not found then
    raise exception 'join request not found' using errcode = 'P0002';
  end if;

  -- "Not allowed" reads as "not found", so an outsider cannot probe which request ids exist.
  if not public.can_approve_join(v_request.group_id) then
    raise exception 'join request not found' using errcode = 'P0002';
  end if;

  if v_request.status <> 'pending' then
    raise exception 'join request already decided' using errcode = '55000';
  end if;
  if not public.is_active_working_group(v_request.group_id) then
    raise exception 'working group is archived' using errcode = '55000';
  end if;

  v_status := case when p_approve then 'approved' else 'rejected' end;

  update public.wg_join_requests
  set status = v_status, decided_by = (select auth.uid()), decided_at = now()
  where id = p_request;

  if p_approve then
    insert into public.wg_members (group_id, user_id, added_by)
    select v_request.group_id, v_request.user_id, (select auth.uid())
    from public.users u
    where u.id = v_request.user_id and u.status = 'active'
    on conflict (group_id, user_id) do nothing;
  end if;

  return v_status;
end;
$$;

-- The number of pending requests the caller may decide: all groups for admins, otherwise the
-- groups where the caller is a fresh or experienced member. Archived groups do not count.
create function public.pending_join_request_count()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
  from public.wg_join_requests r
  where r.status = 'pending'
    and public.is_active_working_group(r.group_id)
    and public.can_approve_join(r.group_id);
$$;

revoke all on function public.decide_join_request(uuid, boolean) from public, anon;
revoke all on function public.pending_join_request_count() from public, anon;
grant execute on function public.decide_join_request(uuid, boolean) to authenticated, service_role;
grant execute on function public.pending_join_request_count() to authenticated, service_role;
