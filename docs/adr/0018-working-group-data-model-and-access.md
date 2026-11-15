# ADR-0018: Working group data model and access rules

Status: accepted (W-01)

## Context

Working groups (spec section 5) hold members, join requests, a weekly lead, meetings and two links. Spec section 3 gives different rights to new, fresh and experienced members of a group and to admins, and non-members may see only a limited view (name, description, lead; activity titles from T-01). The "same working group" profile tier (ADR-0014) needs real membership.

## Decision

- **Tables:** `working_groups`, `wg_members` (primary key group and user), `wg_join_requests` (status enum, one pending request per person and group through a partial unique index), `wg_leads` and `wg_meetings`, in `supabase/migrations/20261115150206_working_groups.sql`. Lobbying is seeded there with no members.
- **Base tables are readable only by members of the group and admins.** Non-members get the limited view through security-definer functions (W-01 part 2) that return only the allowed columns, so a policy can never leak members, meetings or links by accident.
- **One set of helpers decides every rule:** `is_wg_member`, `can_approve_join`, `can_assign_lead`, `can_edit_group_content` and `can_request_join`, all security definer over `wg_member_level`. Only active people in groups that are not archived count; admins pass for every group. `is_wg_member` about someone else answers only to admins and members of that group, so the member list cannot be probed. `lib/domain/groups.ts` repeats the rules for the UI; a database test checks they agree.
- **One lead row per group and week** (Monday, UTC, `startOfIsoWeek`), unique on group and week. Reassigning a week replaces its row; past weeks are read-only history, and nobody deletes lead rows except the trigger that clears a removed member's current and future weeks. The lead must be a member, and being lead gives no extra rights.
- **Archived groups** (`archived_at` set) are kept, hidden with all their rows from everyone but admins, and give their members no rights until restored.
- **Links:** one `signal_url` and one `docs_url` column per group, `https://` only. Fresh and experienced members may change just those two: a `before update` trigger refuses any other column change by a non-admin member.
- **Writes outside these policies go through functions:** join decisions (W-03) and member changes by admins (W-06). Members never update or delete join requests or membership rows directly.
- `shares_working_group(a, b)` is redefined with the P-01 signature and grants (service role only): true when both people are active and in one non-archived group.

## Consequences

- Pages for non-members must call the limited-view functions, never select the tables; a query against a base table quietly returns nothing for them.
- Every new group-scoped table (activities and tasks in M3b) should reuse these helpers in its policies.
- Several docs links would need a small links table and a new migration.
- Policies call definer helpers per row; fine at the expected size (a few groups, tens of members), worth revisiting if groups grow large.
