-- P-03: a member chooses their own interface language. Members have no update policy on users
-- (ADR-0009), so this narrow function is the only way to change the stored preference.
-- It touches the locale column of the caller's own row and nothing else.
create function public.set_own_locale(new_locale text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_active_member() then
    raise exception 'not an active member' using errcode = '42501';
  end if;
  if set_own_locale.new_locale is null or set_own_locale.new_locale not in ('en', 'it') then
    raise exception 'unsupported locale' using errcode = '22023';
  end if;

  update public.users set locale = set_own_locale.new_locale
  where id = (select auth.uid());
end;
$$;

revoke all on function public.set_own_locale(text) from public, anon;
grant execute on function public.set_own_locale(text) to authenticated;
