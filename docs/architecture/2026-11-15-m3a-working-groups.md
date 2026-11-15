# Architecture snapshot: M3a Working groups (2026-11-15)

## Overview

Admins create working groups and add members. Every active member sees the list of groups; members of a group (and admins) see the full group page, and everyone else sees a limited view. A member asks to join a group and fresh or experienced members of it (or an admin) decide. Experienced members of a group (or an admin) assign the lead of the week. Fresh members and above manage the group's meetings and its two links. The "same working group" profile tier (P-01) is now live. Activities and tasks arrive in M3b.

## Components

Routes (under `app/[lang]`):

| Route                | Who           | What                                                                                          |
| -------------------- | ------------- | --------------------------------------------------------------------------------------------- |
| `/groups`            | active member | Groups the person may see (`list_working_groups`), member marker, lead of the week            |
| `/groups/[slug]`     | active member | Full page (tabs Overview, Activities, Tasks, Members, Meetings) or the limited view + request |
| `/admin/groups`      | admin         | All groups including archived, member counts, link to edit                                    |
| `/admin/groups/new`  | admin         | Create a group (name, slug, description)                                                      |
| `/admin/groups/[id]` | admin         | Edit text and links, archive or restore, add and remove members                               |

Same route rules as M2: signed-out goes to `/login`, a person without a member record is refused by `requireUser`, a non-admin on an admin route gets the 404 from `requireAdmin`. Server actions: `app/[lang]/groups/[slug]/actions.ts` (join, decide, lead), `meetings-actions.ts` (meetings, links) and `app/[lang]/admin/groups/actions.ts` (six audited admin actions: `working_group.created`, `.updated`, `.archived`, `.restored`, `.member_added`, `.member_removed`). Each starts with `requireUser()` or `requireAdmin()`.

Pure rules in `lib/domain`: `groups` (slug, tabs, view model), `leads`, `week`, `meetings`, `membership`, `admin-groups`. UI in `components/groups/*`.

Header navigation: Home, Groups (with a badge counting the join requests the person may decide), My profile, Settings; an Admin link to `/admin`, which links to Applications, Onboarding, Data requests and Groups.

## Data

All tables have row-level security enabled in the same migration.

| Table or function                                                                                                      | Read                                                           | Write                                                                                         |
| ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `working_groups`                                                                                                       | admins; members of that group (non-members: only via the RPCs) | admins insert and delete; members who may edit content change the two links (trigger)         |
| `wg_members`                                                                                                           | members of the group; admins                                   | admins only (add and remove)                                                                  |
| `wg_join_requests`                                                                                                     | the requester; those who may approve for the group; admins     | requester inserts own pending request; status changes only through `decide_join_request`      |
| `wg_leads`                                                                                                             | members of the group; admins                                   | experienced members of the group and admins                                                   |
| `wg_meetings`                                                                                                          | members of the group; admins                                   | fresh and experienced members of the group and admins                                         |
| `list_working_groups()`                                                                                                | any active member (admins also see archived)                   | read-only RPC                                                                                 |
| `get_working_group(slug)`                                                                                              | members and admins; links only for them                        | read-only RPC                                                                                 |
| `decide_join_request(request, approve)`                                                                                | -                                                              | approve or reject; approving adds the membership in the same call                             |
| `pending_join_request_count()`                                                                                         | active member (count of what they may decide)                  | read-only RPC                                                                                 |
| `is_wg_member`, `wg_member_level`, `can_approve_join`, `can_assign_lead`, `can_edit_group_content`, `can_request_join` | internal, security definer                                     | the single place each rule is decided (policies and pages both call them)                     |
| `shares_working_group(a, b)`                                                                                           | internal                                                       | replaces the P-01 stub: true when both are active members of one non-archived group           |
| triggers                                                                                                               | -                                                              | `guard_working_group_update` narrows non-admin updates; `drop_future_leads_of_removed_member` |

**Limited view.** Non-members cannot read `working_groups`, `wg_members`, `wg_leads` or `wg_meetings`. They get name, description and the current lead through `list_working_groups` and `get_working_group`, both security definer with `search_path = ''`. The links come back only to members and admins. The page asks the database (`can_approve_join`, `can_assign_lead`, `can_edit_group_content`) which forms to show; hiding is never the only protection.

**Join flow.** A member who is not in an active group inserts a pending request (one pending per group and person). `decide_join_request` locks the row, checks `can_approve_join`, sets the status and, on approval, inserts the membership, all in one transaction. A rejected person may request again. No email is sent.

**Lead flow.** One row per group and week (Monday start, UTC). The lead is any member of the group, for the current or a later week; past weeks are read-only. Reassigning a week replaces the row. Removing a member deletes their rows for the current and later weeks. The lead gets no extra permissions.

**Archive semantics.** `archived_at` set hides the group from every list and from non-admins; rows are kept; members lose access; admins still read and restore it. Archived groups do not count for `shares_working_group`. Slugs never change.

**T-01 seam.** No `activities` table exists. `onGroupCreated(groupId)` in `lib/domain/admin-groups.ts` is a no-op called by `createGroup`; T-01 creates the group's General activity there and backfills Lobbying (seeded with no members by the first migration).

## Environments

Unchanged from M2. Database, RLS and E2E tests (`tests/db/working-groups-rls.test.ts`, `working-group-views.test.ts`, `tests/e2e/m3a-permissions.spec.ts` and the story specs) run in CI against a local Supabase.

## Decisions

ADR-0018 (working group data model and access) plus the earlier ADRs. Join approvals, lead rules and archive semantics are recorded above and in the plan; the spec edits proposed in the wrap-up are not yet in `docs/spec.md`.

## Known gaps

- No self-leave: only an admin removes a member.
- One Signal link and one docs link per group.
- Join requests send no email; approvers see a badge.
- Activity titles on the limited view, activities and tasks arrive in M3b (T-01 onwards); the Activities and Tasks tabs are empty.
- Levels and automatic onboarding steps tied to groups arrive in M3c.
- Verified locally: lint, typecheck, unit tests. Database, RLS and E2E tests and the production build are proven by CI.
