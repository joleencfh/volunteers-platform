# ADR-0015: Onboarding steps and progress

Status: accepted (O-01)

## Context

Spec section 8 defines an eight-step onboarding checklist. Each step is confirmed by the volunteer, by the system or by an admin, and the definition must be changeable without code. Step 1 ("Added to the platform") completes on approval, which inserts into `public.users`; but members also appear through the seeded first admin and test fixtures, and the approval action (A-04) should not grow onboarding knowledge.

## Decision

- **Two tables.** `onboarding_steps` holds the definition (`key`, `title_key` pointing to `onboarding.steps.<key>` in `messages/*.json`, `confirmed_by` as the enum `self | auto | admin`, `position`, `active`). `user_onboarding` holds one row per completed step; a null `completed_by` means the system. Active members read all steps and only their own progress; admins read all and manage steps.
- **Who writes which step is enforced by RLS.** A member may insert a row only for themselves, naming themselves as completer, and only for an active `self` step; they have no update or delete. Admins insert and delete any row (so they can tick and untick) with themselves as completer; nobody gets an update grant, because a step is either done or not. `auto` steps are written by triggers or the service role only.
- **Step 1 completes through an AFTER INSERT trigger on `public.users`** (security definer), not through the approval action. It covers every way a member row appears, and the approval action stays unchanged. The same migration backfills existing active members.
- **Steps 5 and 7 stay open for now.** They are `auto` steps written by O-04 once working groups and tasks exist (M3).
- **Seed in the migration** with stable keys and positions 1 to 8, so code and tests can refer to keys.

## Consequences

- A new step is an insert into `onboarding_steps` plus message keys in both language files; the checklist and the admin overview read the table.
- Reordering or rewording is an update by an admin, with no deploy.
- A trigger is less visible than application code; this ADR and the db test (`tests/db/onboarding-rls.test.ts`) are where it is documented and held in place.
- Unticking an admin step deletes the row, so no history of who ticked it remains besides the audit log written by O-03.
