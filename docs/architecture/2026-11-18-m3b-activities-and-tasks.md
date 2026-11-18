# Architecture snapshot: M3b Activities and tasks (2026-11-18)

## Overview

Every working group has activities, and activities have tasks. A group's General activity is created by the database. Members of a group create activities of four Lobbying types (Campaign, Call with target, Meeting, Content creation) through a form rendered from a type registry, join them as participant or observer, and fill in an optional postmortem. Members create, take, assign and complete tasks; completing needs a note or a link, and only an admin reopens a done task. An assignee gets an email. `/home`, the onboarding "current activities" window and profiles show real work. Levels and automatic onboarding arrive in M3c.

## Components

Routes (under `app/[lang]`). Same route rules as M3a: signed-out goes to `/login`, a person without a member record is refused by `requireUser`.

| Route                            | Who                                   | What                                                                                                                                 |
| -------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `/groups/[slug]?tab=activities`  | member of the group, admin            | Activity list with filters (status, type, archived); non-members of the group see titles and statuses only, on the group's main page |
| `/groups/[slug]?tab=tasks`       | member of the group, admin            | Tasks of the group, filter by assignee                                                                                               |
| `/groups/[slug]/activities/new`  | fresh and experienced members, admins | Pick a type, then the form with that type's own fields. New volunteers and non-members get the not-found screen                      |
| `/groups/[slug]/activities/[id]` | member of the group, admin            | Detail: fields, participants, join and leave, lead, edit, archive, tasks, postmortem. Anyone else gets the not-found screen          |
| `/tasks`                         | active member                         | My tasks: the member's open and in-progress tasks in every group                                                                     |
| `/home`                          | active member                         | Adds "My work": own open tasks and the activities they take part in                                                                  |
| `/profile`, `/people/[id]`       | active member                         | Adds the "Latest and planned work" feed                                                                                              |

Header navigation (signed in): Home, Groups (with the join-requests badge), My tasks, Profile, Settings; an Admin link to `/admin` for admins, shown before the menu.

Server actions: `app/[lang]/groups/[slug]/activities/actions.ts` (create, update, archive, restore, join, leave, lead), `postmortem-actions.ts` and `app/[lang]/groups/[slug]/tasks/actions.ts` (create, take, assign, status, update). Each starts with `requireUser()` and `requireWgMember`, validates with Zod and then calls the database, which checks the same rule again.

Pure rules in `lib/domain`: `activities`, `activity-input`, `activity-types/*`, `tasks`, `postmortem`, `my-work`, `profile-work`. The assignment email is `taskAssignedEmail` in `lib/email/templates.ts`, sent by `lib/email/notify.ts`. UI in `components/activities/*` and `components/tasks/*`.

**Activity type registry (ADR-0020).** One file per type in `lib/domain/activity-types/`, listed in `index.ts`. A definition has a key, its fields (rendered by the form, validated by a Zod schema for `details`) and whether it is selectable. `activities.type` is text and `details` is JSON, so a new type needs no migration; a type is never removed, only made not selectable. The General type is not selectable.

## Data

All tables have row-level security enabled in the same migration. Migrations: `20261117151043_activities_and_tasks`, `20261117152524_activities_policies`, `20261118090512_activity_postmortem`, `20261118091723_profile_work_feed` (pending until the maintainer pushes them in order).

| Table or function                                                                    | Read                                                                            | Write                                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `activities`                                                                         | members of the group, admins (non-members only through `list_group_activities`) | insert: fresh and experienced members, admins; update: creator, lead, experienced members, admins (guard trigger narrows what a non-admin may change); no deletes                                                                                            |
| `activity_participants`                                                              | members of the group, admins                                                    | only through `join_activity`, `leave_activity` and `set_activity_lead`                                                                                                                                                                                       |
| `tasks`                                                                              | members of the group, admins                                                    | insert: fresh and experienced members, admins; update: guarded by `guard_task_write` (see ADR-0019); no deletes                                                                                                                                              |
| `list_group_activities(group)`                                                       | any active member: title and status of non-archived activities, nothing else    | read-only function                                                                                                                                                                                                                                           |
| `join_activity`, `leave_activity`, `set_activity_lead`                               | members of the group                                                            | observer-only for new volunteers; the lead must be a participant; anyone may leave                                                                                                                                                                           |
| `save_postmortem(activity, went_well, improvements, learnings)`                      | -                                                                               | participants, experienced members of the group, admins; three columns only, 4000 characters each, refuses archived activities                                                                                                                                |
| `get_profile_work(owner)`                                                            | active members, filtered inside the function (see below)                        | read-only function                                                                                                                                                                                                                                           |
| `can_create_in_group`, `can_edit_activity`, `can_archive_activity`, `activity_group` | internal, security definer                                                      | the single place each rule is decided                                                                                                                                                                                                                        |
| triggers                                                                             | -                                                                               | `create_general_activity` (on a new group), `guard_activity_identity`, `guard_activity_update`, `guard_general_activity_delete`, `guard_activity_lead`, `clear_lead_of_departed_participant`, `sync_task_group`, `set_task_completed_at`, `guard_task_write` |

**General activity.** One per group, `type 'general'`, `is_general = true`, created by a trigger on `working_groups` and backfilled for existing groups. It cannot be deleted, archived or cancelled and its title is fixed. `onGroupCreated` stays a no-op.

**Archive and status.** Status (`planned`, `active`, `done`, `cancelled`) and archive (`archived_at`) are separate. Archived activities are hidden from default lists and from the profile feed and the onboarding window, kept, and restorable by experienced members and admins. Archiving: the creator, experienced members and admins.

**Task rules as built** (details and the three-layer comparison in ADR-0019): fresh, experienced and admins create; any member of the group takes an unassigned task; the creator, assignee, experienced members and admins edit or reassign while the task is open; the assignee and admins complete (note or https link required, `completed_at` set by trigger); only admins reopen. New volunteers cannot create tasks but can take unassigned ones and complete their own.

**Assignment email.** After `createTask` or `assignTask`, if the assignee changed to someone other than the actor, the assignee gets a plain-text email in `users.locale` (English or Italian) with the task title, group name, due date, the assigner's display name and the activity link. The address is read with the service-role client inside the server-only email module and never logged. Without `RESEND_API_KEY`, `EMAIL_FROM` or `NEXT_PUBLIC_SITE_URL` the email is skipped quietly and the assignment stands.

**Profile feed (spec section 7).** `get_profile_work(owner)` is security definer with `search_path = ''`, stable, not executable by `anon`. The caller must be an active member. It returns at most 30 rows: the owner's activities (participant, observer or lead; planned, active, or done in the last 90 days) and tasks (open, in progress, or done in the last 90 days), planned and active first. Rows appear only for non-archived groups where the caller is a member or an active admin, which also applies to the owner viewing themselves (a group they left disappears). General and archived activities, and tasks inside archived activities, are excluded; a deactivated owner returns nothing. Names of other people never appear in the feed. The service-role client is not used.

**`onTaskCompleted(taskId)` hook for M3c.** `lib/tasks/on-task-completed.ts` is called once by `setTaskStatus` after a task is completed and does nothing today. M3c fills it with the count of completed tasks and the level re-evaluation.

## Environments

Unchanged from M3a. Database, RLS and E2E tests (`tests/db/activities-rls.test.ts`, `tasks-rls.test.ts`, `postmortem.test.ts`, `profile-work.test.ts`, `tests/e2e/m3b-permissions.spec.ts` and the story specs) run in CI against a local Supabase; they could not run on the maintainer's machine (no Docker), and the SQL was exercised in PGlite by `check:fast`.

## Decisions

ADR-0019 (activities and tasks data model, access and task permissions) and ADR-0020 (activity type registry), plus the earlier ADRs.

Proposed spec edits, none made (`docs/spec.md` is unchanged): (1) task permissions: fresh and experienced members and admins create tasks; any member of the group takes an unassigned task, new volunteers included; the creator, the assignee, experienced members and admins edit or reassign; the assignee (or an admin) completes with a note or an https link; only admins reopen; new volunteers cannot create tasks. (2) The General activity is created automatically for every group, cannot be deleted, archived or cancelled, and its title is fixed. (3) Archive is separate from status (planned, active, done, cancelled). (4) Who edits an activity (creator, lead, experienced members, admins), who archives (creator, experienced members, admins), and who edits the postmortem (participants, experienced members, admins; refused on archived activities). (5) New volunteers join activities only as observers; the lead must be a participant. (6) The assignment email: to the new assignee only, in their saved language, plain text, never when assigning yourself, skipped quietly without the Resend settings. (7) The profile feed: only items in non-archived groups where the viewer is a member (admins any group), the owner sees their own, General and archived activities excluded, 90 days, 30 rows. (8) Campaign and Call target fields are free text until M4. (9) Comments on tasks and activities are not built. (10) Non-members of a group see only the titles and statuses of its activities.

## Known gaps

- **No comments** on tasks or activities: the spec matrix lists "comment" but there is no data model or story for it.
- **Target fields are free text** (Campaign: targets contacted; Call with target) until G-06 (M4) links them to the targets table; no migration is needed for that.
- **Level engine, promotion and onboarding steps 5 and 7** arrive in M3c (O-04 to O-06); today only the `onTaskCompleted` hook exists.
- **Done-task fields in the database.** The database locks the status, assignee and completion of a done task but not its title, description or due date; the pure rule and `updateTask` refuse it. Tightening it needs a new migration (ADR-0019).
- Not run locally, left to CI and the main session: `bun run test:db`, `bun run check:rls`, `bun run test:e2e` and `SKIP_ENV_VALIDATION=1 bun run build`.
