-- The public privacy notice (A-05) shows how long data is kept. Those periods live in `config`
-- (CLAUDE.md rule 11), which only members can read. Let anyone read exactly these two rows, and
-- nothing else, instead of reading `config` with the service role from a public page.
--
-- Keep this list in step with lib/notice-retention.ts. Adding a key here makes it public.

grant select on public.config to anon;

create policy config_select_public_retention on public.config
  for select to anon, authenticated
  using (key in (
    'retention.rejected_applications_months',
    'retention.people_who_leave_months'
  ));
