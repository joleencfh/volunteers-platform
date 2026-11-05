# ADR-0005: Automatic level promotion

Status: accepted (F-08)

## Context

Volunteers have a level: new, fresh or experienced. Levels unlock permissions. With a small admin team, promoting people by hand would be slow and inconsistent, but admins must still be able to correct a level.

## Decision

- **New to fresh** is automatic when the volunteer has completed the configured number of tasks (initially 3).
- **Fresh to experienced** is automatic once all configured criteria hold together (initially 7 activities as participant, 20 tasks completed, 3 times as WG lead, 2 months since joining). It is checked when a task is completed, an activity is joined or a lead is assigned, plus a daily scheduled check for the months criterion.
- The system only promotes, never demotes.
- Admins can set any level by hand at any time, with the reason recorded in the audit log, including at approval.
- Thresholds live in the `config` table, not in code. The rules themselves are pure functions in `lib/domain` with unit tests.

## Consequences

- Admins do not need to review promotions; the levels reflect contributions.
- Changing a threshold is a data change and does not affect people already promoted.
- The daily check needs a scheduled job (to be decided when it is built).
- Open spec questions (what counts as "3 times as WG lead", how the promotion notification is sent) are settled in the stories that build them.
