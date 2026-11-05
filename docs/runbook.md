# Runbook

Operational how-tos for the PauseAI IT platform. Sections marked "to be written" are filled in by later stories (F-08 skeleton, F-09 deploy, L-02 backups).

## Running the tests

| Command             | What it runs                                                               | Needs                                                                                                       |
| ------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `bun run test:unit` | Vitest unit tests with coverage (80% threshold on `lib/domain`)            | Nothing                                                                                                     |
| `bun run test:db`   | Database and row-level-security tests (`tests/db`)                         | Local Supabase; skips with a message if none is reachable, fails in CI                                      |
| `bun run test:e2e`  | Playwright end-to-end tests (`tests/e2e`) including an accessibility check | Chromium (`bunx playwright install chromium`); tests that need fixture users skip without Supabase settings |

CI runs all three on every pull request with a local Supabase in the runner, so you do not need Docker. To write an RLS test, copy `tests/db/example-rls.test.ts`: it builds a small schema in a transaction that is always rolled back, then uses `actAs()` to check an allowed and a denied case per role. End-to-end tests sign fixture users in with `loginAs()` (`tests/e2e/helpers/auth.ts`); fixture users are defined in `tests/fixtures/users.ts`, and the password is generated per run.

If you do have local Supabase running, `bun scripts/supabase-env.ts >> .env.local` writes the settings the tests need.

## Development environment

Day-to-day development runs against the hosted **staging** Supabase project; database and end-to-end tests run in CI. A local database is optional.

1. Create the staging project (next section) and push migrations to it.
2. Copy the staging API URL and publishable key from the project settings into `.env.local` (never commit it; the variables are listed in `.env.schema` and the README).
3. Keep staging to synthetic data and never run test suites that create or delete users against it or against production. Those suites run in CI against a local Supabase started in the GitHub runner.

## Local database (Supabase, optional)

A local Supabase stack in containers gives you the same environment CI uses, with a local inbox for sign-in emails. It needs a container runtime and is not required to contribute.

### One-time setup on Windows

Windows 11 Home has no Hyper-V, so Docker Desktop uses WSL 2:

1. Open PowerShell as administrator and run `wsl --install`, then restart the computer.
2. Install [Docker Desktop](https://www.docker.com/products/docker-desktop/) and choose the WSL 2 backend when asked.
3. Start Docker Desktop and wait until it says it is running.
4. In the project folder run `bun run db:start`. The first run downloads several images and takes a few minutes.

### Commands

| Command                    | What it does                                                                             |
| -------------------------- | ---------------------------------------------------------------------------------------- |
| `bun run db:start`         | Starts local Supabase (Postgres on port 54322, API on 54321, Studio on 54323)            |
| `bun run db:stop`          | Stops it                                                                                 |
| `bun run db:reset`         | Drops the local database, reapplies every migration, then runs `supabase/seed.sql`       |
| `bun run db:types`         | Regenerates `lib/database.types.ts` from the local database                              |
| `bun run db:types:staging` | Same, from the linked staging project (no Docker needed; run `bunx supabase link` first) |
| `bun run check:rls`        | Fails if any table in schema `public` lacks row-level security                           |
| `bun run test:db`          | Database and row-level-security tests (`tests/db`) against the local database            |

`db:start` prints the local API URL and keys. Copy them into `.env.local` (never commit that file; the variables are listed in `.env.schema`).

### Migrations

- Create one with `bunx supabase migration new <name>`; it appears in `supabase/migrations/` with a timestamp prefix.
- Never edit a migration that has been applied to staging or production; add a new one.
- After every schema change: `bun run db:reset`, `bun run db:types`, `bun run check:rls`, commit all three results together.
- The CI `database` job regenerates the types and compares them byte for byte with the committed file. Its runner has no formatter for the generated TypeScript, so the output differs in layout from one generated on a machine that has it, even when the schema is identical. If the drift check fails only on layout, download the `database-types` artifact from that run and commit it as `lib/database.types.ts`.
- Every new table needs `alter table ... enable row level security;` and policies in the same migration. CI runs the guard and fails otherwise.

## Staging and production projects (you do this once)

Two hosted Supabase projects keep production data away from tests and previews. Check on the Supabase pricing page that the free plan still allows two active projects; if not, use one project and a branch strategy, and record the decision in an ADR.

1. Sign in at supabase.com and create a project named `pauseai-it-staging`. Choose an **EU region** (for example Frankfurt). Generate a strong database password and store it in your password manager.
2. Repeat for `pauseai-it-prod`.
3. In each project's Authentication settings, set the Site URL and redirect URLs once the Vercel domain exists (F-09). Provider setup (email link, Google) is part of A-02.
4. Link and push from your machine:

   ```bash
   bunx supabase login
   bunx supabase link --project-ref <staging-project-ref>
   bunx supabase db push
   ```

   Push to production only after the same migrations have run on staging.

5. Verify row-level security on the remote database. Use the connection string from the project's Database settings (the session pooler string) and keep it out of shell history and git:

   ```bash
   DATABASE_URL="postgresql://postgres.<ref>:<password>@<pooler-host>:5432/postgres" bun run check:rls
   ```

6. Never commit keys, passwords or connection strings. Never use the service-role key in browser code.

## GitHub settings you apply once

These settings live in GitHub, not in the repository. **Status (2026-10-11):** items 1, 2 and 4 are applied: the ruleset "Protect main" (squash merges only, five required checks, no force pushes or deletion), Dependabot alerts and security updates, secret scanning with push protection, and private vulnerability reporting. Item 3 (Actions defaults) was already in place: read-only workflow permissions, and Actions cannot approve pull requests. To inspect or change the ruleset: Settings → Rules → Rulesets, or `gh api repos/joleencfh/volunteers-platform/rulesets`. Apply them after the first CI run on a pull request (the check names only appear in the settings once they have run once). They are free for public repositories.

1. **Protect `main`:** Settings → Rules → Rulesets → New branch ruleset, target `main`:
   - require a pull request before merging (required approvals: 0 while you are the only maintainer, since you cannot approve your own pull request; raise it when others join);
   - require status checks to pass, and require the branch to be up to date: `secret-scan`, `checks`, `database`, `e2e`, `audit`;
   - block force pushes and branch deletion.
2. **Security features:** Settings → Code security: enable Dependabot alerts and security updates, secret scanning with push protection, and private vulnerability reporting (this is where `SECURITY.md` points).
3. **Actions:** Settings → Actions → General: set workflow permissions to read-only by default and require approval for pull requests from first-time contributors.
4. **Merge strategy:** allow squash merging only, so each pull request is one commit on `main`.

## Guardrails: what is enforced where

Every rule below is checked by something that cannot be forgotten. CI and the GitHub ruleset apply to everyone, including Claude Code. Local hooks give faster feedback but only protect the machine they run on.

| Rule                                                                                                   | Enforced by                                                                                                         | Override                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Row-level security on every table                                                                      | CI `database` job (`check:rls`)                                                                                     | none                                                                                                                                                       |
| Committed generated types match the migrations                                                         | CI `database` job (diff; skipped while the file is the placeholder)                                                 | Run `bun run db:types:staging` after pushing migrations, or take the file from the `database-types` artifact of the failed run                             |
| Applied migrations are never edited or deleted                                                         | CI `guards` job; Claude Code file guard                                                                             | Label `allow-migration-edit` on the pull request; `ALLOW_MIGRATION_EDIT=1` when starting Claude Code. Only for a migration that was never applied anywhere |
| A new migration should come with an ADR                                                                | CI `guards` job (warning only)                                                                                      | Add an ADR, or ignore if no lasting decision was taken                                                                                                     |
| No secrets, personal paths or non-placeholder email addresses                                          | CI `secret-scan` (gitleaks with `.gitleaks.toml`); GitHub push protection; pre-commit hook if gitleaks is installed | Add a narrow allowlist entry to `.gitleaks.toml` in a reviewed pull request                                                                                |
| Pull request description has the checklist, fully ticked                                               | CI `pr-checklist` workflow                                                                                          | Delete a line that does not apply and say why                                                                                                              |
| Tests never run against a non-local database                                                           | `tests/helpers/local-only.ts`, used by the test helpers and `test:db`                                               | `ALLOW_REMOTE_TESTS=1`, only for a throwaway database                                                                                                      |
| Formatting, lint, types, unit tests, 80% coverage on `lib/domain`                                      | CI `checks`; pre-commit (format and lint); Claude Code Stop hook (`check:fast`)                                     | none                                                                                                                                                       |
| No commits on `main`; changes go through a pull request                                                | Pre-commit hook; GitHub ruleset "Protect main"                                                                      | `ALLOW_MAIN_COMMIT=1` locally (the ruleset still blocks the push)                                                                                          |
| Claude Code never reads `.env` files, force-pushes or skips hooks                                      | `.claude/settings.json` deny rules                                                                                  | Edit the settings in a reviewed pull request                                                                                                               |
| Claude Code asks before `supabase db push`, `supabase link`, mutating `gh api` calls and `gh pr merge` | `.claude/settings.json` ask rules                                                                                   | Approve the prompt                                                                                                                                         |
| Claude Code cannot write `.env` files or data files outside `tests/fixtures`                           | PreToolUse file guard (`.claude/hooks/guard-files.ts`)                                                              | none                                                                                                                                                       |
| Claude Code formats what it edits and runs `check:fast` before finishing                               | PostToolUse and Stop hooks (`.claude/hooks`)                                                                        | none                                                                                                                                                       |

Notes:

- The pre-commit hook lives in `.githooks/`. `bun install` activates it (the `prepare` script sets `core.hooksPath`). Never bypass it with `--no-verify`.
- Claude Code reads `.claude/settings.json` at the start of a session, so changes apply to new sessions. `/hooks` lists the active hooks.
- The Stop hook skips work when the exact working tree already passed (cache in `.claude/.last-check`, not committed) and never loops (it ignores `stop_hook_active`).
- When you add a rule, prefer a CI check, add a local hook only for speed, and add a row to this table.
- After F-10 reaches `main`, add the new `guards` and `pr-checklist` checks to the "Protect main" ruleset's required checks.

## Restore a backup

The Supabase free plan has no automatic backups, so the scheduled export is the only copy (to be built in L-02; until then there is no backup, and the project must hold synthetic data only on staging). This section is completed in L-02 with the exact commands. The outline:

1. Take the most recent export from the private storage location chosen in L-02.
2. Restore into a **new, empty** Supabase project first (never over production), by applying `supabase/migrations/` and then loading the export.
3. Check row counts and sign in as an admin against the restored project.
4. Only then point the Vercel environment variables at it, or load the data into production.
5. Record what happened and how long it took here.

Also check that the free-tier project has not been paused for inactivity; a paused project can be restored from the Supabase dashboard within the grace period.

## Rotate keys

Never paste keys into a chat, an issue, a commit or a command that is kept in shell history. Keys live in the Vercel project settings and in the maintainer's `.env.local`.

| Key                                                                 | Where it comes from            | How to rotate                                                                                                              |
| ------------------------------------------------------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase project, API settings | Generate a new key in the dashboard, update Vercel (each environment) and `.env.local`, redeploy, then revoke the old key. |
| Supabase database password                                          | Supabase project, Database     | Reset it in the dashboard; update any stored connection string and `DATABASE_URL` for scripts.                             |
| `RESEND_API_KEY`                                                    | Resend dashboard, API keys     | Create a new key, update Vercel, redeploy, delete the old key.                                                             |
| Google sign-in client secret (from A-02)                            | Google Cloud console           | Create a new secret, enter it in Supabase Authentication providers, then delete the old one.                               |

After rotating: redeploy, load `/`, check an admin can sign in, and note the date here. If a key was exposed (for example committed), treat it as compromised: rotate it immediately, then remove it from history with the maintainer's help. GitHub push protection and `secret-scan` are there to catch this earlier.

## Add an admin

Admin is a flag on the person's row in `users` in the database, never an environment variable.

- **First admin:** `scripts/seed-admin.ts` creates the first admin from `SEED_ADMIN_EMAIL`, declared in `.env.schema`. Run it once per environment, after the migrations, with that variable set for the single command only; it never goes into a committed file. It reads the Supabase URL and service-role key from the environment (bun loads `.env.local`, so check which project that file points at).

  ```powershell
  $env:SEED_ADMIN_EMAIL = '<admin email>'; bun scripts/seed-admin.ts; Remove-Item Env:SEED_ADMIN_EMAIL
  ```

  ```bash
  SEED_ADMIN_EMAIL='<admin email>' bun scripts/seed-admin.ts
  ```

  It confirms the auth user and creates an active member at level experienced, with the display name and real name set to the placeholder "Admin"; edit them in the Supabase table editor. Running it again is safe: an existing member keeps their names and level and only becomes an active admin. It never prints the email.

- **Later admins:** an existing admin approves the person like any volunteer (A-04), then sets the admin flag. Until an admin tool exists (M5), the maintainer sets `is_admin` on that user in the Supabase dashboard's table editor, and the change is recorded in the audit log by hand.
- The person must already be an active member: sign-in matches the verified email, so an admin flag on someone without a member record gives no access.
- To remove an admin, clear the flag the same way.

## Deploy

Each pull request gets a Vercel preview; `main` deploys to production. The full setup (Vercel project, Supabase staging and production, environment variables per environment) is done in F-09 and recorded here by that story.

1. Merge only when CI is green (squash merge).
2. If the change includes migrations: push them to **staging** (`bunx supabase db push` while linked to staging), check the staging app, then push to production. Regenerate the types after the change.
3. Environment variables are set per environment in Vercel from `.env.schema`. A deployment with a missing required variable fails at build; that is intended.
4. After the production deploy, load the home page and sign in as an admin.
5. To roll back, redeploy the previous deployment in Vercel. A migration is not rolled back; write a new migration that reverses it.
