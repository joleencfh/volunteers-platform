# ADR-0012: Public retention periods through a row-level-security policy

Status: accepted (A-05)

## Context

The Italian privacy notice at `/privacy` is public and must state how long data is kept. Those periods are configuration (CLAUDE.md rule 11), so they live in the `config` table. `config` is readable by active members only (ADR-0009), and an anonymous visitor has no access to it. The first version of the page read the two retention keys with the service-role client. A public page using the service role sets a precedent that rule 4 tries to avoid, and it leaves the permission in application code, not in the database (rule 2).

## Decision

- A migration grants `select` on `public.config` to `anon` and adds the policy `config_select_public_retention`, which lets `anon` and `authenticated` read only the rows whose key is `retention.rejected_applications_months` or `retention.people_who_leave_months`. Every other key stays members-only; writes stay admin-only.
- `lib/notice-retention.ts` reads those two keys with the ordinary row-level-security client. If the read fails the page shows the seeded defaults and the server logs a fixed message.
- The key list exists in two places, the policy and `lib/notice-retention.ts`, and both say to keep them in step. A database test proves that anon sees exactly these two rows and cannot write; a unit test proves the page never uses the service role.

## Consequences

- Adding another public setting means a new migration that extends the policy's key list, which is a visible, reviewable change. Do not widen the policy to "all keys".
- The two retention periods are public by design: the notice already prints them.
- Supabase's database linter treats a policy for `anon` as worth a look; this one is deliberate and limited to two rows.
