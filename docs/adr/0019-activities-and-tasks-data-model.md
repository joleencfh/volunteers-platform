# ADR-0019: Activities and tasks data model

Status: accepted (T-01)

## Context

Spec sections 2 and 5: a working group contains activities, an activity contains tasks, and every group has a standing "General" activity that cannot be deleted. Activities carry a type with its own extra fields, a task cannot be done without a note or a link, and participants join as participant or observer. ADR-0003 says type-specific fields live in a `details` JSON column validated in code; this ADR applies and refines it for activities. Access follows ADR-0018.

## Decision

- **Tables** in `supabase/migrations/20261117151043_activities_and_tasks.sql`: `activities`, `activity_participants` (primary key activity and user, role enum `participant_role`) and `tasks`. Statuses are enums (`activity_status`, `task_status`) because the spec fixes them and policies compare them.
- **`type` is text, not an enum,** checked only for length. Type definitions and their `details` Zod schemas live in code (T-02), so a new type is a deploy, not a migration. `details` must be a JSON object; `links` a JSON array of at most 20 items. This refines ADR-0003 for activities: nothing a policy or the promotion rules read lives in `details`.
- **The General activity** (`type 'general'`, `is_general true`, title "General", status active) is created by an `after insert` trigger on `working_groups` and was backfilled for existing groups (Lobbying). A partial unique index allows one per group. A `before update` trigger refuses changing its title or type, cancelling or archiving it; no activity changes group or General flag.
- **Deleting the General activity** is refused unless its group is being deleted. Detection: a group delete removes the group row first and then cascades to its activities, so the `before delete` trigger refuses only while the group row still exists. This needs no session flag and works for every role.
- **Done needs evidence:** a check constraint requires a non-blank completion note or a completion link (`https://` only) when a task is done. `completed_at` is set by a trigger when a task becomes done, kept while it stays done and cleared when it is reopened; any value written to it directly is overwritten.
- **Tasks store their group** (`group_id`, set from the activity by a trigger on every insert and on a change of activity), so task policies need no join.
- **Archive is not a status.** `archived_at` hides an activity from default lists and is restorable; the status (planned, active, done, cancelled) describes the work. Who may archive differs from who may edit.
- **The lead** must be a participant of the activity with role `participant`: a trigger checks it when the lead is set (so a new activity starts without a lead), and the lead is cleared when that person leaves or becomes an observer.
- **Policy helpers** (`activity_group`, `can_create_in_group`, `can_edit_activity`, `can_archive_activity`) are security definer over the ADR-0018 helpers; `lib/domain/activities.ts` repeats the rules for the UI. Only active members of non-archived groups count; admins pass. The creator of an activity keeps edit and archive rights only while an active member of its group.
- **RLS** is enabled with no policies in this migration, so the tables stay closed to members until the policies of T-01 part 2. Members never delete activities or tasks; joining and leaving go through functions.

## Consequences

- Adding an activity type needs no migration, but old rows' `details` must stay readable when a schema changes.
- Target links in `details` (Campaign, Call with target) are free text until G-06 turns them into links; that change needs no migration either.
- Creating an activity with its lead takes two writes: join as participant, then set the lead.
- Deleting a General activity on its own is impossible even for the service role; delete the group instead.

## Access (T-01 part 2)

Policies, guards and functions in `supabase/migrations/20261117152524_activities_policies.sql`; tests in `tests/db/activities-rls.test.ts` and `tests/db/tasks-rls.test.ts`.

- **Reading:** active members of the group and admins read its activities, participants and tasks. Archived activities are read only by those who may archive them, and admins. Non-members read nothing from the tables; every active member gets the limited view through `list_group_activities` (id, title, status, type, key flag, General flag; admins also get archived activities and groups, flagged `archived`).
- **Activities:** fresh and experienced members and admins create them, as themselves, in an active group, never General and never archived at creation. Editing follows `can_edit_activity`; a `before update` guard (`guard_activity_update`) allows a change of `archived_at` only with `can_archive_activity` and refuses rewriting `created_by`, for admins too (the creator decides who may archive, so a lead could otherwise gain archive rights). Nobody deletes through the API.
- **Participants:** only through `join_activity` (active members of the group and admins; new volunteers only as observer; archived activities refused; joining again changes the role) and `leave_activity`. `set_activity_lead` needs `can_edit_activity`, and the lead must be an active member of the group taking part as participant.
- **Tasks:** fresh and experienced members and admins create them (as themselves, never already done). `guard_task_write` holds the column rules: the assignee is always an active member of the group (admins included); the creator, the assignee and experienced members ("editors") change the title, description, due date, assignee and the open or in-progress status; any other member only takes an unassigned task, changing nothing else in that write; only the assignee moves a task to done and writes the completion note and link; a done task keeps its status, assignee and completion, and only an admin reopens it; only an admin moves a task to another activity or rewrites its creator. Nobody deletes tasks through the API.
- **Errors** the functions and guards raise, for the server actions' typed states: `42501` not allowed, `P0002` not found (also when the caller may not see the activity, so ids cannot be probed), `55000` conflict (archived), `22023` and `23514` invalid. `refusalFromDbCode` in `lib/domain/activities.ts` maps them.
- Functions and the service role are trusted by the guards (`current_user <> 'authenticated'`), as in ADR-0018.

## Task permissions as built (T-04)

Checked against `guard_task_write` and the task policies (SQL), `lib/domain/tasks.ts` (pure rules) and `app/[lang]/groups/[slug]/tasks/actions.ts` (server actions). "Editor" means the creator, the assignee, or an experienced member of the group. Every row also needs the person to be a member of the group, except admins, who pass for every group (an admin who is not a member cannot take a task, because an assignee must be a member).

| Action                                               | Who may                                             | Notes                                                                                                                                                        |
| ---------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Create                                               | Fresh and experienced members, admins               | Not a new volunteer. Created as themselves and never already done. Archived activities and groups refuse. The assignee, if any, must be a member.            |
| Take (assign to self)                                | Any member of the group, a new volunteer too        | Only an unassigned task that is not done; changes nothing else in the write. Sends no email: it is self-assignment.                                          |
| Assign, reassign, unassign                           | Editors, admins                                     | Editors only while the task is not done; only an admin changes the assignee of a done task. The assignee must be a member. Emails a new, different assignee. |
| Edit title, description, due date                    | Editors, admins                                     | Only an admin edits a done task in the actions and pure rules (see below).                                                                                   |
| Move between open and in progress                    | Editors, admins                                     | Not on a done task.                                                                                                                                          |
| Complete (done, with a note or an https link)        | The assignee, admins                                | Only a task with an assignee. The creator or an experienced member who is not the assignee cannot. Runs `onTaskCompleted` once.                              |
| Reopen (done back to open or in progress)            | Admins                                              | Nobody else, the assignee included.                                                                                                                          |
| Move to another activity, change the creator, delete | Admins move and rewrite the creator; nobody deletes | Not offered by any action in this story.                                                                                                                     |

Email: assigning to a different person (in `createTask` and `assignTask`, after the write) sends the assignee a plain-text email in their saved language with the task title, group name, due date and the link to the activity page, naming the assigner by display name only. The assignee's address is read with the service-role client inside `lib/email/notify.ts` and never returned or logged. A failed email never undoes the assignment; the action returns `doneEmailFailed` and the page shows a neutral note.

Differences found between the three layers:

- **Editing the fields of a done task.** The database only locks the status, assignee and completion of a done task, so a crafted API call by an editor could still change the title, description or due date. The pure rule (`canEditTaskFields`) and `updateTask` refuse it for non-admins, which is the intended behaviour. The action was fixed to use the pure rule; tightening the database as well needs a migration, which this step does not have, so it is left as a follow-up for the next migration.
- Everything else (create, take, assign, status moves, complete, reopen) agrees in the three layers.
