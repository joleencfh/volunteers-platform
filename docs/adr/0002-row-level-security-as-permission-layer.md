# ADR-0002: Row-level security as the permission layer

Status: accepted (F-08)

## Context

Visibility depends on level, admin flag and working-group membership, and some fields (real name, email, city, target contact details) are admin-only. Permissions enforced only in the UI or in server code are easy to bypass or forget: every `'use server'` function is a public endpoint.

## Decision

- Every table in schema `public` has row-level security enabled, with policies in the same migration. A CI check (`check:rls`) fails if one does not.
- Pages and server actions read data with the RLS-enforced Supabase client, so the database decides what a user receives. The service-role client is server-only, used for narrow writes such as creating an auth user, never to fetch member data for a page.
- Server actions authorise first with a helper from `lib/authz` and validate input with Zod; this repeats the database rules and gives clear errors, but is not the only line of defence.
- Every permission or visibility rule has database tests with an allowed and a denied case.

## Consequences

- A mistake in a server action cannot leak data the policies forbid.
- Policies are code to maintain and test; they are written in SQL migrations and are harder to change than application code.
- Views that expose a subset of columns (for example members seeing only display name and level) must be designed with the policies, not afterwards.
- Database tests need a local Supabase, so they run in CI rather than on the maintainer's machine.
