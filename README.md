# PauseAI IT Volunteer Platform

A private web app for PauseAI Italy volunteers. Working groups contain activities, and activities contain tasks. Sign-in is password-less (emailed link or Google) and limited to people an admin has approved. It started as a personal project of the maintainer.

- Product spec (source of truth for behaviour): [`docs/spec.md`](docs/spec.md)
- Stories in build order: [`docs/development-plan.md`](docs/development-plan.md)
- Decisions: [`docs/adr/`](docs/adr/README.md)
- Operations (environments, guardrails, backups, keys, admins, deploys): [`docs/runbook.md`](docs/runbook.md)
- Contributing: [`CONTRIBUTING.md`](CONTRIBUTING.md). Security reports: [`SECURITY.md`](SECURITY.md)

## Stack

Next.js 16 (App Router, Cache Components) · React 19 · TypeScript (strict) · Tailwind 4 · Supabase (Postgres, Auth, row-level security) · Vercel · Resend · Vitest · Playwright. Package manager and script runner: [Bun](https://bun.com) (not npm, npx or node).

## Setup (about 15 minutes)

You need Bun, Git, and a hosted Supabase staging project (the runbook explains how to create one). Docker is optional.

1. Clone the repository and install: `bun install` (this also activates the pre-commit hook).
2. Create `.env.local` from the variables below. It is git-ignored; never commit it. Use the staging project's API URL, publishable key and service-role key.
3. Push the migrations to staging: `bunx supabase login`, `bunx supabase link --project-ref <staging-project-ref>`, `bunx supabase db push`.
4. `bun run dev` and open http://localhost:3000.

Milestone M2 (profiles and onboarding) adds migrations and one config value to set before inviting volunteers; see [the runbook](docs/runbook.md#milestone-m2-profiles-and-onboarding-what-to-do-by-hand).

Keep staging to synthetic data. Database and end-to-end tests run in CI against a local Supabase; do not run suites that create or delete users against staging or production. With Docker you can run the same local stack as CI: see [the runbook](docs/runbook.md#local-database-supabase-optional).

## Environment variables

Declared in [`.env.schema`](.env.schema) and validated at build and start by `lib/env.ts`. Builds that cannot have secrets (CI static checks) set `SKIP_ENV_VALIDATION=1`; it applies only to `next build`, never to a running server.

| Variable                               | Required  | Purpose                                                      |
| -------------------------------------- | --------- | ------------------------------------------------------------ |
| `NEXT_PUBLIC_SUPABASE_URL`             | yes       | Supabase project URL                                         |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | yes       | Publishable key, shipped to the browser                      |
| `SUPABASE_SERVICE_ROLE_KEY`            | yes       | Bypasses row-level security; server-only, never in a browser |
| `RESEND_API_KEY`                       | from A-04 | Transactional email                                          |
| `EMAIL_FROM`                           | from A-04 | From address for outgoing email                              |
| `SKIP_ENV_VALIDATION`                  | no        | Set to `1` to skip validation in secret-less builds          |
| `DATABASE_URL`                         | no        | Database tests and scripts against local Supabase only       |
| `SEED_ADMIN_EMAIL`                     | no        | First admin, read only by `scripts/seed-admin.ts`            |

## Commands

| Command                     | What it does                                                        |
| --------------------------- | ------------------------------------------------------------------- |
| `bun run dev`               | Development server on http://localhost:3000                         |
| `bun run build` / `start`   | Production build and server                                         |
| `bun run lint`              | ESLint                                                              |
| `bun run typecheck`         | `next typegen`, then `tsc --noEmit`                                 |
| `bun run format`            | Prettier, write (`format:check` only checks)                        |
| `bun run test:unit`         | Vitest with coverage                                                |
| `bun run test:db`           | Database and RLS tests against local Supabase (skips without one)   |
| `bun run test:e2e`          | Playwright end-to-end tests                                         |
| `bun run check`             | lint, typecheck, format check, unit, db, build: run before a commit |
| `bun run check:fast`        | lint, typecheck, format check, unit                                 |
| `bun run check:rls`         | Fails if a table in `public` lacks row-level security               |
| `bun run db:start` / `stop` | Start or stop local Supabase (needs Docker)                         |
| `bun run db:reset`          | Reapply migrations and seed locally                                 |
| `bun run db:types`          | Regenerate `lib/database.types.ts` from local Supabase              |
| `bun run db:types:staging`  | Same, from the linked staging project (no Docker)                   |

## Folder layout

```
app/                  routes (page.tsx is a server component, *View.tsx client rendering)
components/ui/        shared primitives
lib/domain/           pure business rules, no I/O
lib/authz/            requireUser, requireAdmin, requireLevel, requireWgMember
lib/supabase/         browser, server (RLS) and admin (service role, server-only) clients
lib/email/            Resend templates, server-only
lib/audit/            audit log helper
messages/             en.json, it.json
supabase/migrations/  versioned SQL
tests/                unit, db, e2e, fixtures
docs/                 spec, development plan, ADRs, architecture snapshots, runbook
```

Some of these arrive with later stories; see the development plan.

## Contributing

Read [`CONTRIBUTING.md`](CONTRIBUTING.md) and `CLAUDE.md` (the same rules, also read by Claude Code). This repository is public: never commit real personal data, keys or `.env*` files.
