# ADR-0013: One Supabase project and Vercel Hobby until the pilot

Status: accepted (F-09)

## Context

The spec (sections 1 and 10) wants a staging project and a production project if the free tier allows two, and Vercel's Hobby plan if its terms allow this use. The maintainer wants to keep the Supabase account on the free plan with one project for now, and has no Docker for a local database. Database and end-to-end tests already run against a local Supabase in CI, so they do not need a hosted staging project.

Vercel's fair use guidelines restrict Hobby teams to non-commercial personal use. They define commercial use as any deployment used for the financial gain of anyone involved, including a paid person writing the code, with payment processing, advertising and paid hosting as examples. Asking for donations is not commercial use.

## Decision

- **One hosted Supabase project** (EU region) serves development, Vercel previews and production until the pilot. It holds synthetic data only until real volunteers are invited. Tests that create or delete users never run against it.
- **Vercel Hobby** hosts the app. This is a volunteer tool, with no payments, advertising or paid developer, so it fits the non-commercial rule. Hobby has no team features, so the maintainer's own account owns the project.
- **Preview and Production use the same Supabase values.** Only Production gets `NEXT_PUBLIC_SITE_URL`. Sign-in works on the production address and on localhost, not on preview addresses.
- Migrations are applied by hand with `supabase db push --linked`; Vercel does not run them.
- **Before real volunteers join**, the maintainer deletes the synthetic data and treats this project as production (chosen on 2026-11-06). The setup is expected to be temporary: if funding allows, a paid Supabase plan and a separate staging project replace it, and an ADR that supersedes this one records the move.

## Consequences

- A preview deployment of a branch with a new migration runs against a schema that does not have it until someone pushes the migration. Push migrations deliberately.
- A bug in a preview can write to the same database as production. This is acceptable only while no real personal data is stored.
- If anyone is paid to build or host the platform, or the platform moves to PauseAI Global, Hobby no longer applies: move to a Pro plan or to the fallback in the spec, Cloudflare Pages.
