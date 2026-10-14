# PauseAI IT Volunteer Platform

Private web app for PauseAI Italy volunteers: working groups contain activities, activities contain tasks. Sign-in is password-less and limited to admin-approved people. Started as a personal project of the maintainer.

## Read first

- `docs/spec.md`: the product spec. It is the source of truth for behaviour. Section numbers are cited in stories.
- `docs/development-plan.md`: stories in build order, each with acceptance criteria and a prompt. Work on one story per session.
- `docs/adr/`: decisions already taken. Check before changing anything structural.
- Status of stories lives in the Notion "PauseAI IT Platform: Development" hub, not in the repo.

If the spec is unclear or you want to deviate from it, stop and ask. Never silently change behaviour the spec states. If a story needs a spec change, say so and propose the edit.

## Stack and commands

Next.js (App Router) + React + TypeScript (strict) + Tailwind 4, Supabase (Postgres, Auth, row-level security), Vercel, Resend, Vitest, Playwright. Bun, not npm, npx or node. Middleware is `proxy.ts` (Next 16 name).

**Next.js 16.4 with Cache Components and Partial Prefetching enabled** (the `create-next-app` defaults). This is newer than most training data: before writing Next.js code, read the matching guide in `node_modules/next/dist/docs/` (see `AGENTS.md`). Anything that reads cookies or the session at request time must sit behind `<Suspense>`; the guide "Authentication with Cache Components" shows the patterns, and `export const instant = false` is the documented opt-out while a route is being adapted. Record in an ADR any lasting decision about this.

```bash
bun install
bun run dev            # http://localhost:3000
bun run lint
bun run typecheck     # runs `next typegen` first
bun run format         # Prettier
bun run test:unit      # Vitest
bun run test:db        # RLS and database tests against local Supabase
bun run test:e2e       # Playwright
bun run build
bun run check          # lint + typecheck + format check + unit + db + build; run before every commit
bun run db:start       # local Supabase
bun run db:reset       # reapply migrations and seed
bun run db:types       # regenerate lib/database.types.ts
```

Scripts: `dev`, `lint`, `typecheck`, `format`, `build`, `check`, `test:unit` (Vitest with coverage), `test:db` (database and RLS tests; skips with a message when no local database is reachable, fails in CI), `test:e2e` (Playwright), `db:*` (need Docker; see Environments) and `check:rls`. Do not invent scripts that are not in package.json. Write RLS tests by copying `tests/db/example-rls.test.ts`; sign E2E users in with `loginAs()`; fixture users are synthetic (`tests/fixtures/users.ts`).

## Environments

The maintainer has no Docker, so there is no local database on their machine. Day-to-day development runs against the hosted **staging** Supabase project (URL and keys in `.env.local`, never committed). Staging holds only synthetic data. **Database tests and end-to-end tests run in CI**, where GitHub's runners start a local Supabase from `supabase/`. Do not run test suites that create or delete users against staging or production. If you do have Docker, `bun run db:start` gives you the same local stack as CI.

## Folder layout

```
app/                  routes; page.tsx is a server component, *View.tsx client rendering
components/ui/        shared primitives (Button, Input, Modal, ...)
lib/domain/           pure business rules (levels, visibility, CSV parsing); no I/O; 80% coverage
lib/authz/            requireUser, requireAdmin, requireLevel, requireWgMember
lib/supabase/         browser, server (RLS) and admin (service role, server-only) clients
lib/email/            Resend templates, server-only
lib/audit/            audit log helper
messages/             en.json, it.json
supabase/migrations/  versioned SQL; supabase/tests/ database tests
tests/unit, tests/e2e, tests/fixtures
docs/                 spec.md, development-plan.md, adr/, architecture/, runbook.md
```

## Rules (non-negotiable)

1. **Language:** code, comments, identifiers, database names, docs and commit messages in English. No literal UI strings in components: use `messages/*.json` through the translation helper. The application form, consent text, pending and rejected screens and the privacy notice are Italian from v1.
2. **Row-level security on every table.** Visibility and permissions are enforced in the database, then again in server actions; hiding things in the UI is never enough. A CI check fails if a table lacks RLS.
3. **Authorise first.** Every server action starts with the right helper from `lib/authz`. A `'use server'` function is a public endpoint.
4. **Server-only modules.** Service-role client and email code import `server-only` and are never `'use server'`. Never use the service-role client to fetch member data for a page; use the RLS client.
5. **Validate input on the server** with Zod. Client checks are only for UX.
6. **Sensitive data:** real names, emails, city, how someone joined and target contact details are admin-only. Never log them, never put them in URLs, never return them to a client that may not see them. Target contact details live in their own admin-only table.
7. **Migrations:** create with the Supabase CLI, never edit one that has been applied, regenerate types after each change.
8. **Tests are part of the story.** A bug fix starts with a failing test. Every permission or visibility rule has an allowed case and a denied case. Every server action has at least one test. Business logic lives in `lib/domain` so it is unit-testable.
9. **Decisions:** a choice future maintainers need to know about gets a short numbered ADR in `docs/adr/` (context, decision, consequences). Superseding an ADR means a new ADR, not an edit.
10. **Scope:** build only the current story. Note ideas for other stories instead of building them. Prefer simple and conventional over clever; files over about 500 lines get split.
11. **Config over constants:** level thresholds, welcome document link and retention periods come from the `config` table.
12. **Accessibility:** WCAG 2.2 AA, keyboard operable, black text on PauseAI orange (orange text on white fails contrast).
13. **Secrets:** never commit `.env*`; declare variables in `.env.schema`.
14. **Public repository.** This repo is public. Never commit real personal data (volunteer details, real target lists, real contact details), real CSV exports, keys, connection strings, personal file paths or personal email addresses. Fixtures and seeds are synthetic and obviously fake. Commit author email is the GitHub noreply address. Use GitHub private vulnerability reporting, not a personal email, for security reports.

## Git

Branches `feature/`, `fix/`, `chore/` off `main`. Commit messages start with the story ID (for example `A-02: add magic link sign-in`). End commit messages with the attribution trailer the tooling gives you. Open a pull request even for solo work; CI must be green.

## Reference

The maintainer's other project, a local checkout of Tell The World (ask the maintainer where it is; use its main folder, not any worktrees), is a read-only reference for auth, admin approval, CI and conventions. Copy patterns, then adapt; do not copy its briefs, content, directory or messages code, and never share its Supabase project.
