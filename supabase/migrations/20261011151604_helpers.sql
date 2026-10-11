-- Shared helpers reused by later migrations.

-- Keeps an updated_at column current. Attach with:
--   create trigger set_updated_at before update on public.<table>
--   for each row execute function public.set_updated_at();
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
