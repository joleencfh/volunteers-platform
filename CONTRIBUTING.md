# Contributing

Thanks for helping. This project is a private tool for PauseAI Italy volunteers, with a public repository. The full rules are in `CLAUDE.md`; this guide is the short version for people. The product spec is `docs/spec.md`, and it wins over anyone's memory of how things should behave: if it is unclear or you want to deviate, ask first and propose an edit.

## Getting started

Follow the setup in the [README](README.md). Use Bun, not npm, npx or node. Before opening a pull request run `bun run check` (lint, typecheck, format check, unit tests, database tests, build). Without Docker, `test:db` skips locally and runs in CI.

## Conventions

- **Language:** code, comments, identifiers, database names, docs and commit messages are in English. UI text is never literal in components: it lives in `messages/en.json` and `messages/it.json`. The application form, consent text, pending and rejected screens and the privacy notice are Italian.
- **Scope:** one story per pull request, as in `docs/development-plan.md`. Note ideas for other stories instead of building them. Prefer simple and conventional over clever; split files over about 500 lines.
- **Row-level security on every table.** Visibility and permissions are enforced in the database and again in server actions. Hiding things in the UI is never enough.
- **Authorise first.** Every server action starts with a helper from `lib/authz`; a `'use server'` function is a public endpoint.
- **Server-only modules.** The service-role client and email code import `server-only` and are never `'use server'`. Never use the service-role client to fetch member data for a page; use the RLS client.
- **Validate on the server** with Zod. Client checks are for UX only.
- **Sensitive data:** real names, emails, city, how someone joined and target contact details are admin-only. Never log them or put them in URLs.
- **Config over constants:** thresholds, retention periods and the welcome document link come from the `config` table.
- **Business logic** lives in `lib/domain` (pure, no I/O, 80% coverage) so it can be unit tested.
- **Accessibility:** WCAG 2.2 AA, keyboard operable, black text on PauseAI orange.
- **Public repository:** never commit real personal data, real CSV exports, keys, connection strings, personal file paths or personal email addresses. Fixtures and seeds are synthetic and obviously fake. Never commit `.env*` files; declare variables in `.env.schema`.

## Tests

Tests are part of the story. A bug fix starts with a failing test. Every permission or visibility rule has an allowed and a denied case; every server action has at least one test.

- Unit tests (Vitest) in `tests/unit`.
- Database and RLS tests in `tests/db`: copy `tests/db/example-rls.test.ts`.
- End-to-end tests (Playwright) in `tests/e2e`: sign fixture users in with `loginAs()`. Fixture users are synthetic (`tests/fixtures/users.ts`).

Tests refuse to run against a non-local database. Do not set `ALLOW_REMOTE_TESTS`.

## Migrations

- Create one with `bunx supabase migration new <name>`; it lands in `supabase/migrations/`.
- Never edit a migration that has already been committed or applied; add a new one. CI blocks edits.
- Every new table enables row-level security and adds its policies in the same migration, with database tests.
- After a schema change regenerate the types (`bun run db:types`, or `bun run db:types:staging`), run `bun run check:rls`, and commit the migration, types and seed together.
- Push to staging first; production only after the same migrations have run on staging.

## Decisions

A choice future maintainers need to know about gets a short numbered ADR in `docs/adr/` (context, decision, consequences). Copy `docs/adr/0000-template.md`, number it after the highest existing one and add it to the index. Never edit an accepted ADR; supersede it with a new one.

## Pull requests

1. Branch off `main`: `feature/`, `fix/` or `chore/`.
2. Commit messages start with the story ID, for example `A-02: add magic link sign-in`. If an AI tool helped, end with a `Co-Authored-By:` trailer.
3. Open a pull request even for solo work, built from `.github/pull_request_template.md`. Every item in its "Checklist" section is ticked, or removed with a reason; CI checks this.
4. CI must be green: `secret-scan`, `checks`, `database`, `e2e`, `audit`, and the guards. Squash merge only.
5. Never use `--no-verify` or force-push. If a hook or check blocks you, fix the cause or ask the maintainer.

Security problems go through GitHub private vulnerability reporting, see [SECURITY.md](SECURITY.md), not through an issue or an email.
