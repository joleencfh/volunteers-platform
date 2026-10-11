# Runbook

Operational how-tos for the PauseAI IT platform. Sections marked "to be written" are filled in by later stories (F-08 skeleton, F-09 deploy, L-02 backups).

## Development environment

Day-to-day development runs against the hosted **staging** Supabase project; database and end-to-end tests run in CI. A local database is optional.

1. Create the staging project (next section) and push migrations to it.
2. Copy the staging API URL and publishable key from the project settings into `.env.local` (never commit it; the variable list arrives with F-07).
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

| Command             | What it does                                                                       |
| ------------------- | ---------------------------------------------------------------------------------- |
| `bun run db:start`  | Starts local Supabase (Postgres on port 54322, API on 54321, Studio on 54323)      |
| `bun run db:stop`   | Stops it                                                                           |
| `bun run db:reset`  | Drops the local database, reapplies every migration, then runs `supabase/seed.sql` |
| `bun run db:types`  | Regenerates `lib/database.types.ts` from the local database                        |
| `bun run check:rls` | Fails if any table in schema `public` lacks row-level security                     |
| `bun run test:db`   | Self-test of the RLS guard on an in-memory Postgres (no Docker needed)             |

`db:start` prints the local API URL and keys. Copy them into `.env.local` (never commit that file; the variable list arrives with F-07).

### Migrations

- Create one with `bunx supabase migration new <name>`; it appears in `supabase/migrations/` with a timestamp prefix.
- Never edit a migration that has been applied to staging or production; add a new one.
- After every schema change: `bun run db:reset`, `bun run db:types`, `bun run check:rls`, commit all three results together.
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

These settings live in GitHub, not in the repository. Apply them after the first CI run on a pull request (the check names only appear in the settings once they have run once). They are free for public repositories.

1. **Protect `main`:** Settings → Rules → Rulesets → New branch ruleset, target `main`:
   - require a pull request before merging (required approvals: 0 while you are the only maintainer, since you cannot approve your own pull request; raise it when others join);
   - require status checks to pass, and require the branch to be up to date: `secret-scan`, `checks`, `database`, `e2e`, `audit`;
   - block force pushes and branch deletion.
2. **Security features:** Settings → Code security: enable Dependabot alerts and security updates, secret scanning with push protection, and private vulnerability reporting (this is where `SECURITY.md` points).
3. **Actions:** Settings → Actions → General: set workflow permissions to read-only by default and require approval for pull requests from first-time contributors.
4. **Merge strategy:** allow squash merging only, so each pull request is one commit on `main`.

## Restore a backup

To be written in L-02.

## Rotate keys

To be written in F-08.

## Add an admin

To be written in A-01 (the seed script) and F-08.

## Deploy

To be written in F-09.
