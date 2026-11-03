# ADR-0001: Stack choice

Status: accepted (F-08)

## Context

The platform is a private tool for PauseAI Italy volunteers, started as a personal project of the maintainer. It must cost nothing or close to it, be maintainable by one person with AI assistance, keep personal data in the EU, and let a later owner (PauseAI Global) take it over without a rewrite.

## Decision

- **Next.js (App Router), React and TypeScript in strict mode, Tailwind 4** for the application.
- **Supabase** (Postgres, Auth, row-level security) for data and sign-in, in an EU region.
- **Vercel** for hosting, **Resend** for email, **Vitest and Playwright** for tests, **Bun** as package manager and script runner.
- Local, staging and production are separate Supabase projects; tests run against a local Supabase in CI, never against hosted data.

## Consequences

- One language and one repository for UI, server code and migrations; a single maintainer can hold it in their head.
- Free tiers cover v1, with known limits (no automatic Supabase backups, inactivity pause); the runbook covers both.
- Next.js 16 with Cache Components is newer than most documentation. Read the guides in `node_modules/next/dist/docs/` before writing framework code.
- Vendor lock-in is moderate: Postgres and plain SQL migrations move easily; Supabase Auth and Vercel specifics would need replacing.
