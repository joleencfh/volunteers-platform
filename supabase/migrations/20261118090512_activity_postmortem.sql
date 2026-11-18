-- T-05: who writes an activity's postmortem (spec section 5: what went well, points for
-- improvement, general learning points). The three columns live on public.activities, whose update
-- policy only lets the creator, the lead, experienced members and admins edit. Participants (of
-- either role) must be able to write the postmortem and nothing else, so the write goes through one
-- security-definer function that touches only those three columns.
--
-- Allowed: an admin; an experienced member of the group; an active member of the group who
-- participates in the activity (participant or observer). Everyone else gets P0002 (not found, so
-- an outsider learns nothing) or 42501 (a member who may read but not write). Archived activities
-- and archived groups are refused with 55000; texts over 4000 characters with 23514.
-- Reading stays with the select policy: members of the group and admins.

create function public.save_postmortem(
  p_activity uuid,
  p_went_well text,
  p_improvements text,
  p_learnings text
)
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
  v_went_well text := nullif(trim(coalesce(p_went_well, '')), '');
  v_improvements text := nullif(trim(coalesce(p_improvements, '')), '');
  v_learnings text := nullif(trim(coalesce(p_learnings, '')), '');
  v_participates boolean;
begin
  if p_activity is null then
    raise exception 'activity is required' using errcode = '22023';
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

  select exists (
    select 1 from public.activity_participants p
    where p.activity_id = p_activity and p.user_id = (select auth.uid())
  ) into v_participates;
  if not v_admin and v_level <> 'experienced' and not v_participates then
    raise exception 'only participants, experienced members and admins write the postmortem'
      using errcode = '42501';
  end if;

  if v_activity.archived_at is not null or not public.is_active_working_group(v_activity.group_id) then
    raise exception 'the activity is archived' using errcode = '55000';
  end if;

  if char_length(v_went_well) > 4000
    or char_length(v_improvements) > 4000
    or char_length(v_learnings) > 4000
  then
    raise exception 'a postmortem field is longer than 4000 characters' using errcode = '23514';
  end if;

  update public.activities
  set postmortem_went_well = v_went_well,
      postmortem_improvements = v_improvements,
      postmortem_learnings = v_learnings
  where id = p_activity;
end;
$$;

revoke all on function public.save_postmortem(uuid, text, text, text) from public, anon;
grant execute on function public.save_postmortem(uuid, text, text, text)
  to authenticated, service_role;
