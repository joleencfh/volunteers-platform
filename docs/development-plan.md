# Development plan: PauseAI IT Volunteer Platform

This plan turns `docs/spec.md` into 52 stories in build order. Each story has acceptance criteria and a prompt to paste into a fresh Claude Code session. Status of each story is tracked in the Notion hub "PauseAI IT Platform: Development" (databases Epics and Stories); this file is the source of truth for scope and prompts.

## How to read story codes

Each story code is a letter and a number: the letter is the epic, the number is the position inside that epic. F Foundation, A Sign-in and application, P Profiles and visibility, O Onboarding and levels, W Working groups, T Activities and tasks, G Targets, D Admin tools and audit, L Launch readiness. The number is not the build order; see the milestone table and the Order column in Notion.

## How to work a story

1. Start a fresh Claude Code session in the repository root. Work on one story only.
2. Paste the **standard preamble** below, then the story's prompt. For size L stories, ask for a plan first and review it before any code.
3. Work on a branch named after the story (`feature/a-02-sign-in`). Commit messages start with the story ID.
4. Run `bun run check` and the E2E suite. Open a pull request; CI must pass.
5. Check every acceptance criterion by hand, then set the story to Done in Notion. If the story forced a decision, confirm an ADR exists.
6. If the spec needs to change, change `docs/spec.md` (and the shared spec document) first, then continue.

### Standard preamble

```text
You are working on the PauseAI IT volunteer platform. Before writing code, read CLAUDE.md, the spec sections named in this story (docs/spec.md) and any ADRs in docs/adr that apply. Work only on this story; do not build features that belong to other stories. For size L stories, start in plan mode and show me the plan first. Follow the engineering standards in spec section 10: write tests as you go (unit, database/RLS and end-to-end as relevant), keep lint, type check and tests green, create migrations with the Supabase CLI, keep UI text in messages/*.json, and authorise first in every server action. If you take a decision future maintainers need to know, write an ADR in docs/adr. When done: run `bun run check`, summarise what changed, list anything not done, and propose a commit message that starts with the story ID.
```

### Definition of done (every story)

- All acceptance criteria met and checked by hand.
- Tests added as the standards require; CI green.
- No literal UI strings, no secrets, no personal data in logs.
- Migration, types and seed updated where relevant.
- README, runbook or ADR updated where relevant.
- Notion story set to Done.

## Milestones

| Milestone                  | Stories                                  | You can then                                                                                       |
| -------------------------- | ---------------------------------------- | -------------------------------------------------------------------------------------------------- |
| M0 Shell                   | F-01 to F-09                             | See a branded, deployed, empty app with CI, tests, translations and docs in place                  |
| M1 Sign-in                 | A-01 to A-05                             | Receive applications, approve them, and let people sign in                                         |
| M2 Onboarding live         | P-01, P-02, O-01, O-02, O-03, P-03       | Invite your first volunteers and walk them through the checklist. Steps 5 and 7 stay open until M3 |
| M3 Working groups and work | W-01 to W-06, T-01 to T-06, O-04 to O-06 | Run Lobbying: groups, activities, tasks, leads, automatic levels                                   |
| M4 Targets                 | G-01 to G-07                             | Track parliamentarians, organisations, journalists and experts, and import your lists              |
| M5 Launch                  | D-01 to D-04, L-01 to L-06               | Run the pilot with about 10 volunteers on a hardened, backed-up system                             |

Build order follows the milestone table, not the epic grouping below: the stories are listed by epic, so for example O-04 to O-06 come after the working group and task stories. Inside M2 do P-01, P-02, O-01, O-02, O-03, P-03. The Order column in the Notion Stories database gives the exact sequence (1 to 52).

---

## Epic: Foundation (M0)

### F-01 Scaffold the project

Size M · Chore · Spec 1, 10

**Acceptance criteria**

- `bun install && bun run dev` serves a placeholder page.
- Scripts exist: `dev`, `lint`, `typecheck`, `test:unit`, `test:db`, `test:e2e`, `build`, `check` (test scripts may be no-ops until F-04).
- TypeScript strict, ESLint with the Next.js rules and a 500-line `max-lines` warning, Prettier.
- Folder layout as in CLAUDE.md; `.gitignore`; git initialised with a first commit; `docs/spec.md` present.

**Prompt**

```text
Create the Next.js (App Router, TypeScript strict, Tailwind 4) project in this repository root using Bun. Use the maintainer's Tell The World project (a local checkout; ask me for its location, main folder only) as a read-only reference for package.json scripts, tsconfig and eslint.config.mjs, but do not copy feature code. Add the scripts listed in the acceptance criteria, ESLint and Prettier config, the folder layout from CLAUDE.md (with .gitkeep in empty folders), a .gitignore and a placeholder home page. Initialise git and commit. Confirm docs/spec.md exists; if not, tell me to export the spec there. No features.
```

### F-02 Local Supabase, migrations and the RLS guard

Size M · Chore · Spec 10

**Acceptance criteria**

- `bun run db:start`, `db:reset`, `db:types` work against a local Supabase (Supabase CLI).
- First migration creates shared helpers (timestamps trigger, `updated_at`).
- `scripts/check-rls.ts` (and `bun run check:rls`) fails when any table in the `public` schema has RLS disabled; proven by a test that adds a table without RLS.
- `docs/runbook.md` explains how to create the staging and production Supabase projects (EU region) and apply migrations to them.

**Prompt**

```text
Set up Supabase local development with the Supabase CLI: supabase init, config, a seed file, and the scripts db:start, db:reset, db:types (writes lib/database.types.ts). Add a first migration with the generic helpers we will reuse (an updated_at trigger function). Write scripts/check-rls.ts that connects to the local database and exits non-zero if any table in schema public has row level security disabled, and test it. Add the runbook section describing how I create the staging and production Supabase projects in an EU region and push migrations to them; I will create the projects myself.
```

### F-03 Continuous integration

Size M · Chore · Spec 10

**Acceptance criteria**

- GitHub Actions on every pull request and on pushes to `main`: secret scan (gitleaks, pinned version with checksum, as in Tell The World), lint, type check, unit tests with coverage, database tests, RLS guard, build, E2E, dependency audit.
- A newer push cancels the older run; timeouts set.
- Dependabot configured; pull request template with a security and privacy checklist.
- `docs/runbook.md` lists the branch protection settings I must apply on GitHub.

**Prompt**

```text
Create .github/workflows/ci.yml with the jobs listed in the story acceptance criteria. Use Tell The World's .github/workflows/ci.yml as a reference for the gitleaks job and concurrency settings. The database and E2E jobs must start local Supabase in the runner (no tests against production or staging). Add .github/dependabot.yml and .github/pull_request_template.md (checklist: tests added, RLS considered, no personal data logged, UI strings in messages, ADR if needed). Document in docs/runbook.md the branch protection settings (require CI, require pull requests, no force pushes) that I must switch on in GitHub. Tests may be placeholders until F-04; the jobs must already run.
```

### F-04 Test harness

Size M · Test · Spec 10

**Acceptance criteria**

- Vitest configured for `tests/unit` with coverage; a 80% line threshold applies to `lib/domain`.
- Database test helper: creates users with levels, signs in as them with the RLS client, and asserts allowed and denied access; one example test.
- Playwright configured with a fixtures seed script, a login helper for test users and an axe accessibility helper; one example test.
- `bun run test:unit`, `test:db`, `test:e2e` run locally and in CI.

**Prompt**

```text
Set up the three test layers described in spec section 10. (1) Vitest for tests/unit with coverage and an 80% line threshold on lib/domain. (2) A database test helper under supabase/tests or tests/db using Vitest against local Supabase: helpers to create a user at a given level (new, fresh, experienced, admin) and a client authenticated as that user, so later stories can assert what each role can read and write. (3) Playwright with a global setup that seeds fixtures through the admin API, a helper to sign in as a fixture user, and an axe helper that fails on serious violations. Add one small example test per layer so each command runs green. Wire the commands into package.json scripts and the CI workflow from F-03.
```

### F-05 Translation setup and Italian legal screens routing

Size M · Feature · Spec 1, 9

**Acceptance criteria**

- A translation library (next-intl or equivalent; record the choice in ADR-0007) with `messages/en.json` and `messages/it.json`.
- Components read text through the helper; a lint rule or test fails on literal text in JSX under `app/` and `components/`.
- Routes `/apply`, `/apply/pending`, `/apply/rejected` and `/privacy` render Italian; everything else English; missing Italian keys fall back to English.
- Dates and numbers are formatted through the locale. A `locale` preference can be read from the user later (no column yet).

**Prompt**

```text
Add internationalisation. Choose a library suited to the Next.js App Router (next-intl is my default), record the choice and the route/locale approach in docs/adr/0007-translation-library.md, and implement: messages/en.json and messages/it.json, a typed translation helper for server and client components, locale resolution where the legal routes (/apply, /apply/pending, /apply/rejected, /privacy) are Italian and the rest English, English fallback, locale-aware date and number formatting. Add a guard (ESLint rule such as no-literal-string in warn-to-error for app/ and components/, or a test) that fails on hard-coded UI text. Convert the placeholder page to use it. Do not write the application form or privacy page yet.
```

### F-06 Design tokens and app shell

Size M · Feature · Spec 9

**Acceptance criteria**

- Brand tokens (orange, black, white, neutrals, type scale, spacing, radius) defined in Tailwind `@theme`, taken from the PauseAI logo (`docs/assets/pauseai-logo.png`) and confirmed against the stylesheet of https://pauseai.info.
- Responsive shell: header with logo and navigation (mobile menu), main area, footer with a privacy link.
- Primitives in `components/ui`: Button, Input, Textarea, Select, Checkbox, FormField with error text, Card, Badge, Modal, Toast, EmptyState.
- Keyboard operable, visible focus, WCAG 2.2 AA contrast (black text on orange); a dev-only style guide page at `/dev/style`; axe passes on it.

**Prompt**

```text
Build the design foundation. Put the PauseAI logo the maintainer provides at docs/assets/pauseai-logo.png (ask me for the file if missing) and copy it to public/. Derive brand tokens from the logo (orange about #FF9416, black, white) and verify colours and fonts by reading the stylesheet at https://pauseai.info; record the tokens in Tailwind @theme and in docs/design-tokens.md. Build the responsive app shell and the ui primitives listed in the acceptance criteria. Rules: black text on orange, orange never as body text on white, visible focus, 44px touch targets, works from 375px to 1440px. Add a dev-only /dev/style page showing every primitive and an axe test for it.
```

### F-07 Security baseline

Size M · Chore · Spec 9, 10

**Acceptance criteria**

- Security headers set for all routes: Content-Security-Policy, Strict-Transport-Security, frame-ancestors/X-Frame-Options, Referrer-Policy, Permissions-Policy, X-Content-Type-Options; verified by an E2E test.
- Environment variables declared in `.env.schema` (as Tell The World does with varlock) and validated at build/start; `.env*` ignored by git.
- ESLint rule or boundary check prevents client components importing `server-only` modules.
- A small in-memory rate-limit helper in `lib/` with unit tests (documented as per-instance).
- `SECURITY.md` with a reporting contact placeholder.

**Prompt**

```text
Add the security baseline: HTTP security headers (with a CSP that works with Next.js and Supabase, nonce-based if practical), env variable schema and validation modelled on Tell The World's .env.schema and varlock usage, an ESLint no-restricted-imports (or equivalent) rule so client components cannot import server-only modules, a generic in-memory sliding-window rate limiter (lib/rate-limit.ts) with unit tests and a comment that it is per serverless instance, and SECURITY.md. Add an E2E test asserting the headers. Do not add Supabase clients or auth; those come in A-02.
```

### F-08 Documentation baseline and ADRs

Size S · Docs · Spec 10

**Acceptance criteria**

- README: what it is, setup in under 15 minutes, commands, environment variables.
- CONTRIBUTING.md adapted from Tell The World (structure, security conventions, migrations, PR process).
- `docs/adr/` with a template, an index, and ADR-0001 to ADR-0007 written from the spec decisions (stack; RLS as permission layer; extension fields as validated JSON; separate admin-only contact table; automatic promotion; no email integration in v1; translation library).
- `docs/architecture/README.md` and `docs/runbook.md` skeleton (restore a backup, rotate keys, add an admin, deploy).
- CLAUDE.md commands match reality.

**Prompt**

```text
Write the documentation baseline. README and CONTRIBUTING (use Tell The World's CONTRIBUTING.md and docs/architecture/README.md as models, adapting to this project). Create docs/adr with a short template (context, decision, consequences, status), an index README, and ADR-0001 to ADR-0007 derived from the decisions in docs/spec.md; keep each under one page. Create docs/architecture/README.md explaining dated snapshots and docs/runbook.md with headings for restoring a backup, rotating keys, adding an admin and deploying. Finally check CLAUDE.md against the actual scripts and fix any mismatch.
```

### F-09 Deploy the shell

Size S · Chore · Spec 1, 10

**Acceptance criteria**

- Vercel project connected to the repository; production and preview deployments work; environment variables set per environment.
- Staging and production Supabase projects exist (EU region) and are linked; the placeholder page deploys.
- Vercel Hobby terms checked for this use; decision noted in an ADR or the runbook.
- Steps recorded in `docs/runbook.md`.

**Prompt**

```text
Help me deploy the shell. I will create the Vercel project and the Supabase staging and production projects (EU region) myself; guide me step by step, then do what you can with the CLIs: link the repository, define environment variables per environment from .env.schema, confirm preview and production deployments of the placeholder page, and push the current migrations to staging. Check the current Vercel Hobby plan terms against our use and record the conclusion. Record every step in docs/runbook.md.
```

---

## Epic: Sign-in and application (M1)

### A-01 Users, applications, configuration and audit tables

Size L · Feature · Spec 3, 4, 9

**Acceptance criteria**

- Migrations create enums (user level, user status, application status), tables `users`, `applications`, `config`, `audit_log` with indexes and constraints.
- `users` holds display name, real name, email, city, level, admin flag, status, locale, joined date, first-active date and last-login date; the record exists only for approved people.
- `applications` holds the form data plus consent records (privacy accepted at, special-category consent at, notice version).
- RLS: a user reads their own row; other members read only display name and level through a view; admins read and write all; applications are not readable by members; `audit_log` is admin-read, system-write.
- `config` seeded with level thresholds (new to fresh 3; fresh to experienced 7 activities, 20 tasks, 3 times as lead, 2 months), welcome document URL (empty), retention values.
- `scripts/seed-admin.ts` makes the maintainer's email the first admin.
- Database tests prove the visibility rules; types regenerated.

**Prompt**

```text
Implement the data foundation for users and applications. Read spec sections 3, 4 and 9. Create the migrations, RLS policies, a members view exposing only display name and level, the config seed from the acceptance criteria, an audit_log table with a recordAudit helper in lib/audit (server-only), and scripts/seed-admin.ts that takes the admin email from an environment variable. Write database tests for every policy with an allowed and a denied case (anon, member, other member, admin). Do not build UI or sign-in yet.
```

### A-02 Sign-in (magic link and Google)

Size L · Feature · Spec 4

**Acceptance criteria**

- `/login` offers email magic link and Google; no LinkedIn.
- Only people with an active `users` row can sign in; anyone else is signed out at the callback and sent back with a generic message; magic-link requests never reveal membership.
- `proxy.ts` refreshes the session on every request and redirects logged-out users from protected routes to `/login`; public routes: `/`, `/login`, `/apply*`, `/privacy`, `/auth/*`.
- `lib/authz` exports `requireUser`, `requireAdmin` (reads the admin flag in the database), with tests; `last_login_at` updated.
- Rate limiting on magic-link requests; the three Supabase clients (browser, server, admin) exist and the admin one is `server-only`.
- E2E: approved user signs in; unapproved user is refused; admin route refused for non-admin.

**Prompt**

```text
Implement sign-in. Use Tell The World (main folder, read-only) as the reference for proxy.ts, the three lib/supabase clients, app/auth/callback/route.ts, lib/auth/approval.ts and the sign-in actions, but adapt: no LinkedIn, admin status comes from users.is_admin not an environment variable, membership means an active row in users. Build /login, the callback, sign-out, lib/authz helpers, rate limiting (use the helper from F-07) and last_login_at updates. Write E2E tests using fixture users and unit/db tests for the helpers. Read spec section 4 and ADR notes first.
```

### A-03 Application form and pending/rejected screens

Size M · Feature · Spec 4, 9

**Acceptance criteria**

- `/apply` in Italian with the fields in spec section 4, two required consent checkboxes, a honeypot, server-side Zod validation and rate limiting.
- Submitting stores the application with consent timestamps and the privacy notice version; one open application per email; a generic message for existing members.
- `/apply/pending` and `/apply/rejected` in Italian; a signed-in person without a member record who tries the app sees only the right screen.
- Mobile-friendly; accessible form errors; E2E test.

**Prompt**

```text
Build the public application flow in Italian (messages/it.json). Fields, consent wording requirements and the pending and rejected screens are in spec sections 4 and 9. Use a server action with the service-role client only for the insert, validate with Zod, add the honeypot and rate limiting, store consent timestamps and notice_version (a constant exported from the privacy notice module, to be created in A-05; use a placeholder constant for now). Draft the Italian copy; I will review it. Add an E2E test for submit, duplicate and honeypot cases.
```

### A-04 Admin review, approval and emails

Size L · Feature · Spec 3, 4, 9

**Acceptance criteria**

- `/admin/applications` lists pending applications and recent decisions, admins only.
- Approve (with starting level, default new) creates the Auth user and `users` row, marks the application approved, writes an audit entry and emails a sign-in link; reject emails a short notice. Both actions call `requireAdmin` first.
- On submission, all admins get an email; Resend wrapper is `server-only`; applicant emails are Italian, admin emails English; sending can be mocked in tests.
- Onboarding step 1 can later be derived from `joined_at` (no action needed now).
- Tests: a non-admin cannot call either action; approving twice is safe.

**Prompt**

```text
Build admin review. Reference Tell The World's lib/admin/actions/applications.ts, lib/email/* and app/admin for patterns (read-only). Adapt to this schema: approval creates the Supabase Auth user with the admin API, inserts the users row with the chosen starting level, records an audit entry, and sends the sign-in email. Implement the Resend wrapper (server-only), the three email templates (new application to admins, approved and rejected to the applicant), the admin list UI and actions. Every action calls requireAdmin first. Add tests for authorisation, idempotency and email sending through a mock transport.
```

### A-05 Italian privacy notice

Size S · Feature · Spec 9

**Acceptance criteria**

- `/privacy` in Italian covering purposes, data kept, who sees what, special-category consent, retention, rights, processors and region, and the maintainer as contact; clearly marked draft until the maintainer approves.
- Notice version is a constant used by the application form's consent record; footer links to it on every page.
- English version available as a stub for later.

**Prompt**

```text
Write the Italian privacy notice page from the privacy section of docs/spec.md. Use placeholders in square brackets for the maintainer's name and contact and for anything I must confirm, and add a visible draft marker I can remove later. Export NOTICE_VERSION from a single module and use it in A-03's consent record. Add the footer link. Add an E2E test that /privacy is reachable logged out and that the form stores the version.
```

---

## Epic: Profiles and visibility (M2)

### P-01 Profile data and visibility model

Size L · Feature · Spec 7

**Acceptance criteria**

- Migration adds profile fields (bio, LinkedIn URL, AI safety knowledge level, risks of most interest) and a `profile_visibility` table (user, field, tier: admin, group, members).
- Fixed fields (real name, email, how heard, join dates, last login) are never visible to non-admins; optional fields follow the defaults in spec section 7.
- A database function and view/RPC return only the fields a given viewer may see; `shares_working_group(a, b)` exists as a stub returning false (replaced in W-01).
- Database tests cover every field, tier and viewer type (self, shared group, other member, admin).

**Prompt**

```text
Implement the profile data model and visibility enforcement in the database. Read spec section 7 first. Add the columns and profile_visibility table, a SQL function can_view_profile_field(viewer, owner, field), and a get_profile RPC (or view) that returns only permitted fields; add a stub shares_working_group(a,b) returning false that W-01 will redefine. Keep the field list and defaults in one place (lib/domain/profile-fields.ts) shared with the UI, and unit-test it against the SQL behaviour with database tests for each field, tier and viewer. No UI yet.
```

### P-02 Profile page and editing

Size M · Feature · Spec 7

**Acceptance criteria**

- `/profile` (own, editable) with a visibility selector on each optional field; `/people/[id]` shows only what the viewer may see; admins see all.
- Level badge visible to all members; display name required.
- Responsive; labels from messages; E2E covers a member viewing another member and an admin viewing both.

**Prompt**

```text
Build the profile screens on top of P-01 using only the get_profile RPC/view for reading other people. Own profile: editable fields with per-field visibility controls limited to the allowed tiers. Others: render only fields returned. Include the level badge. Add E2E tests for self, other member and admin views and an axe check. Latest and planned work sections come later (T-06); leave an empty placeholder component.
```

### P-03 Account settings

Size S · Feature · Spec 7, 9

**Acceptance criteria**

- `/settings` with language preference (English or Italian, stored in `users.locale`), sign out, and a "request my data export or deletion" action that creates an admin-visible request (email to the admins).
- Locale preference is used for the UI outside the Italian legal routes.

**Prompt**

```text
Add /settings with a language preference stored in users.locale and applied by the translation setup from F-05 (legal routes stay Italian), a sign-out button, and a data request form (export or deletion) that records a request visible to admins and emails them. Tests for the preference and the request.
```

---

## Epic: Onboarding and levels (M2 and M3)

### O-01 Onboarding data model and seed

Size M · Feature · Spec 8

**Acceptance criteria**

- Tables `onboarding_steps` (key, title key, confirmed-by: self, auto, admin, position, active) and `user_onboarding` (user, step, completed at, completed by).
- Seed the eight steps from spec section 8; step 1 is completed automatically when a user is created.
- RLS: members read their own progress and may complete only self-confirmed steps; admins read and complete all; database tests.

**Prompt**

```text
Implement the onboarding tables, seed the eight steps from spec section 8 (title keys in messages/en.json and it.json), complete step 1 on user creation (adjust the approval action from A-04 or use a trigger), and write RLS policies so a member can only mark self-confirmed steps for themselves. Database tests for every rule.
```

### O-02 Home checklist and prompts

Size L · Feature · Spec 8

**Acceptance criteria**

- `/home` shows the onboarding checklist with progress until complete.
- Steps 3 and 4 open a window: the welcome document link (from `config`) or the current activities list (placeholder data until T-06), with "I've read it", "Later" and "Close" choices; "I've read it" completes the step.
- A first-login prompt and a profile-completion prompt (display name, city, bio) sit beside the checklist.
- Mobile-friendly and accessible; E2E for the full self-confirm path.

**Prompt**

```text
Build the home page checklist and the two read-and-confirm windows. Steps and rules are in spec section 8. The welcome document URL comes from the config table; the current activities list uses an empty-state until activities exist, but the modal and confirmation must already work. Add the profile-completion prompt. Write E2E tests for the three modal choices and for completing steps.
```

### O-03 Admin onboarding overview

Size M · Feature · Spec 8

**Acceptance criteria**

- `/admin/onboarding` lists people with open admin-confirmed steps (Signal, first call, 1-on-1); admins tick and untick them; each change writes an audit entry; `requireAdmin` first.
- Completed people drop off the list; filter by step.
- Tests: non-admin cannot call the actions.

**Prompt**

```text
Build the admin onboarding overview described in spec section 8. Server actions confirm or unconfirm an admin-confirmed step, record who and when, and write an audit entry. Include filters and an empty state. Tests for authorisation and for the audit entries.
```

### O-04 Automatic onboarding steps

Size M · Feature · Spec 8

**Acceptance criteria**

- Step 5 completes when the person's first working group membership is approved; step 7 when their first completed task has both a note and a link.
- Implemented in one place (database trigger or a domain function called by the actions) and covered by tests, including idempotency.

**Prompt**

```text
Wire the auto-detected steps 5 and 7. Choose one mechanism (database triggers or a domain function called from the join-approval and task-completion actions), record the choice in an ADR if it is not obvious, and test that each step completes exactly once and never for the wrong user. Depends on W-03 and T-04.
```

### O-05 Level engine

Size L · Feature · Spec 3, 8

**Acceptance criteria**

- `lib/domain/levels.ts` is a pure function: given counts and config thresholds it returns the level; new to fresh at 3 completed tasks; fresh to experienced needs all of 7 activities joined as participant, 20 tasks, 3 times as lead and 2 months since joining; never demotes; 100% branch coverage.
- A function computes the counts from the database; re-evaluation runs on task completion, activity join and lead assignment, and daily through a secured cron route (`CRON_SECRET`).
- A promotion writes an audit entry and creates an in-app notice for the volunteer.
- Tests include thresholds read from `config` and edge cases (exactly at threshold, below, manual higher level untouched).

**Prompt**

```text
Implement automatic level promotion per spec sections 3 and 8. Keep the rule pure in lib/domain/levels.ts with thorough unit tests; add the SQL or server function that gathers counts (tasks done, activities joined as participant, weeks as lead, months since joined_at); call re-evaluation from the three event points and from a daily cron route protected by CRON_SECRET (add vercel.json cron). Promotions write an audit entry and an in-app notice. Never demote and never lower a level an admin set higher. Use thresholds from the config table.
```

### O-06 Manual level override

Size S · Feature · Spec 3, 8

**Acceptance criteria**

- `/admin/people` minimal table with a level selector and mandatory reason; each change writes an audit entry; `requireAdmin` first.
- Tests for authorisation and audit.

**Prompt**

```text
Add a minimal /admin/people page listing volunteers with a way for admins to set a level by hand with a required reason. Audit every change. D-02 will extend this page later, so keep the table component reusable.
```

---

## Epic: Working groups (M3)

### W-01 Working group data model

Size L · Feature · Spec 3, 5, 7

**Acceptance criteria**

- Tables `working_groups`, `wg_members`, `wg_join_requests`, `wg_leads` (week start), `wg_meetings`, link fields; Lobbying seeded.
- Helper functions `is_wg_member`, `can_approve_join` and the real `shares_working_group` (replaces the P-01 stub); migration updates the stub.
- RLS per the matrix: everyone sees the group list and the limited fields; members see full data; admins all.
- Database tests: new, fresh, experienced, non-member, admin.

**Prompt**

```text
Implement the working group schema and policies from spec section 5 and the matrix in section 3. Replace shares_working_group from P-01 with the real implementation and re-run its tests. Provide a limited-view mechanism for non-members (name, description, lead; activity titles are added in T-01) as a view or RPC. Seed the Lobbying group. Database tests for every role.
```

### W-02 Working group list and pages

Size M · Feature · Spec 5

**Acceptance criteria**

- `/groups` lists all groups; `/groups/[slug]` shows the limited view to non-members and tabs (Overview, Activities, Tasks, Members, Meetings) to members and admins.
- Responsive; the member list is hidden from non-members; E2E covers both views.

**Prompt**

```text
Build the group list and group pages. Render only what the database returns; do not rely on hiding UI. Tabs for activities and tasks can show empty states until T stories land. E2E for non-member and member views.
```

### W-03 Join requests and approvals

Size M · Feature · Spec 3, 5

**Acceptance criteria**

- Any member can request to join; fresh and experienced members of that group and admins can approve or reject; new members cannot.
- Pending requests show as a badge in the navigation for approvers; approving adds the member; duplicates blocked.
- Tests for each role at database and action level.

**Prompt**

```text
Implement join requests, approval and the in-app pending badge. The authorisation rule is in spec section 3 and enforced by RLS plus the action helper requireWgMember with a minimum level. Tests for new, fresh, experienced, outsider and admin.
```

### W-04 Lead of the week

Size M · Feature · Spec 5

**Acceptance criteria**

- Experienced members and admins assign the lead for a week (Monday start); history is kept; the current lead is shown on the group page with the four-item checklist.
- Lead gives no extra permissions; tests assert that.

**Prompt**

```text
Implement lead assignment per week and the lead checklist display from spec section 5. Include a small history list. Test that fresh members cannot assign and that being lead changes no permissions.
```

### W-05 Meetings and links

Size S · Feature · Spec 5

**Acceptance criteria**

- Fresh and above can add and edit planned meetings (date, time, link, agenda link) and set the Signal and docs links for their group.
- Upcoming meetings listed on the group overview; new members see them but cannot edit.

**Prompt**

```text
Add meeting and link management to the group pages with validation of URLs and dates. Permissions per the matrix. Tests for allowed and denied roles.
```

### W-06 Admin group management

Size S · Feature · Spec 5

**Acceptance criteria**

- Admins create and edit working groups, add or remove members and archive a group; actions audited and admin-only.
- Creating a group also creates its General activity (hook for T-01).

**Prompt**

```text
Build the admin screens for creating and editing working groups and managing members. Archiving hides a group from lists but keeps data. Audit every action. Tests for authorisation.
```

---

## Epic: Activities and tasks (M3)

### T-01 Activities and tasks data model

Size L · Feature · Spec 2, 3, 5

**Acceptance criteria**

- Tables `activities` (type text, status, dates, key flag, `details` JSONB, postmortem fields), `activity_participants` (participant or observer), `tasks` (assignee, status, due date, completion note and link).
- A task cannot be `done` without a note or a link (constraint).
- A General activity is created automatically for each working group and cannot be deleted.
- RLS per the matrix: new cannot create tasks or activities and joins as observer; fresh and above create; experienced edit others' activities; non-members see only titles and statuses through a limited view (completes W-01's view).
- Database tests for every role.

**Prompt**

```text
Implement the activities and tasks schema per spec section 5 with RLS matching section 3. Add the General activity trigger, the done constraint, the participant role rule, and extend the non-member limited view with activity titles and statuses. Database tests for each role and rule. No UI.
```

### T-02 Activity type registry

Size M · Feature · Spec 2, 5

**Acceptance criteria**

- `lib/domain/activity-types/` has one file per type (campaign, call with target, meeting or co-working, content creation) with a Zod schema, field definitions for form rendering and i18n keys.
- Adding a type means adding one file and registering it; no migration.
- Unit tests for each schema; ADR-0003 updated with the final shape.

**Prompt**

```text
Build the activity type registry with the four Lobbying types and their extension fields from spec section 5. Each type exports a Zod schema for details, ordered field definitions (label key, input kind, required) and a display summary function. Write unit tests for valid and invalid details, and update ADR-0003.
```

### T-03 Activities UI

Size L · Feature · Spec 5

**Acceptance criteria**

- Activity list per group (filters by status and type), create form with a type picker that renders the type's fields, detail page, edit, status change, key flag, links.
- Join or leave as participant (observer for new volunteers); lead selection; permissions enforced by the database and the action.
- Responsive; E2E: fresh creates a campaign; new volunteer cannot create and joins as observer.

**Prompt**

```text
Build the activity screens using the registry from T-02. Reading and writing go through the RLS client; server actions use requireWgMember with a minimum level and validate details with the type's schema. Include participants, lead and key flag. Add E2E tests for the roles named in the acceptance criteria.
```

### T-04 Tasks

Size L · Feature · Spec 5

**Acceptance criteria**

- Create tasks in an activity; any member can take an unassigned task; assign another member; status open, in progress, done; due date.
- Marking done requires a note or link; admins can reopen; completion timestamps are automatic.
- Assigning sends an email to the assignee (Resend, mockable).
- "My tasks" list; new volunteers cannot create tasks but can take and complete them.
- Tests at database, action and E2E level.

**Prompt**

```text
Implement tasks per spec section 5: create, take, assign, status, completion with note or link, reopen by admin, assignment email, and a My tasks page. Enforce the new-volunteer restrictions at the database and in actions. Tests for each rule, plus an E2E for the complete-a-task journey that also exercises the level re-evaluation hook if O-05 exists (otherwise leave a clearly named TODO hook).
```

### T-05 Postmortem

Size S · Feature · Spec 5

**Acceptance criteria**

- Any activity can have a postmortem with three fields: what went well, points for improvement, general learning points; editable by participants and experienced members; visible to group members.
- Empty-state prompt when an activity is marked done without one.

**Prompt**

```text
Add the postmortem section to the activity detail page with the three fields and permissions above. Show a gentle prompt when a done activity has no postmortem. Tests for who can edit.
```

### T-06 My work and profile feed

Size M · Feature · Spec 7, 8

**Acceptance criteria**

- `/home` shows my open tasks and activities; the onboarding "current activities" window shows real data.
- Profiles show latest and planned activities and tasks, filtered in the database to groups the viewer can fully see; tests prove a non-shared-group viewer sees nothing.

**Prompt**

```text
Connect activities and tasks to the home page, the onboarding window from O-02 and the profile sections left as placeholders in P-02. The profile feed must be filtered by an RLS-respecting query (no service-role). Database and E2E tests for visibility.
```

---

## Epic: Targets (M4)

### G-01 Targets data model

Size L · Feature · Spec 6, 3

**Acceptance criteria**

- Tables `targets` (type, working group, name, status, status changed at, links, next steps, notes, `details` JSONB), `target_contacts` (admin-only), `target_interactions` (date, direction, channel, kind, summary, optional activity link, logged by).
- RLS: group members read; fresh and above write; new read-only; contacts readable and writable by admins only; non-members see nothing.
- `status_changed_at` set by trigger when status changes.
- Database tests for every role, including that contact rows are invisible to non-admins even via joins and views.

**Prompt**

```text
Implement the targets schema and RLS from spec section 6 and the matrix in section 3. Pay special attention to target_contacts: no policy, view or function may expose it to non-admins. Add the status-change trigger and database tests for every role and for join leaks.
```

### G-02 Target type registry

Size M · Feature · Spec 6

**Acceptance criteria**

- One file per type (parliamentarian, organisation, journalist or outlet, expert) with Zod schema, field definitions, status list and i18n keys; ADR for the pattern points at ADR-0003.
- Unit tests; adding a type needs no migration.

**Prompt**

```text
Build the target type registry mirroring the activity type registry, with the fields and per-type status lists from spec section 6. Organisation statuses and relationship stages can follow the maintainer's Notion Outreach Orgs database (relationship stage and workflow status). Unit tests for each schema.
```

### G-03 Target list and create/edit

Size L · Feature · Spec 6

**Acceptance criteria**

- `/groups/[slug]/targets` lists targets with filters (type, status), last contact date and contact count; create and edit forms rendered from the registry.
- Only members of the owning group see the list; new volunteers cannot create or edit; E2E for both.

**Prompt**

```text
Build the target list and forms from the registry. Last contact and contact count come from the interaction log with an efficient query. Enforce permissions in actions and rely on RLS for reads. E2E for fresh create and new read-only.
```

### G-04 Target detail and interaction log

Size L · Feature · Spec 6

**Acceptance criteria**

- Detail page or modal with core fields, type fields, status history date, next steps, and the interaction log (add entry, kinds: call, message, ask, info sent, contact given, event).
- For parliamentarians, a "party colleagues" list of other targets with the same party in the same group.
- Entries link optionally to an activity; permissions as above; E2E logs a call and a message.

**Prompt**

```text
Build the target detail experience and the interaction log per spec section 6. Compute party colleagues with a query scoped by the viewer's RLS. Add tests for logging by fresh versus new.
```

### G-05 Admin contact details

Size S · Feature · Spec 6, 9

**Acceptance criteria**

- An admin-only panel on the target page shows and edits contact details; each view and edit writes an audit entry through a server action.
- Non-admins never receive the data: database test, action test and E2E asserting the panel and the network response are absent.

**Prompt**

```text
Add the admin-only contact panel. Reads go through a server action that checks requireAdmin, records an audit entry and returns the data; the page never ships contact data to non-admins. Write the three tests named in the acceptance criteria.
```

### G-06 Campaigns and targets

Size M · Feature · Spec 5, 6

**Acceptance criteria**

- A campaign activity links targets contacted and who responded; a bulk action logs one interaction entry for each selected target with the campaign's message.
- The campaign view shows targets, responses and the postmortem; the target page shows the campaigns it was part of.

**Prompt**

```text
Connect campaign activities to targets: selecting targets in the campaign, bulk-logging "we reached out" entries, recording responses, and showing the campaign summary view. Reuse the interaction log table. Tests for permissions and for the bulk log.
```

### G-07 CSV import

Size L · Feature · Spec 6

**Acceptance criteria**

- Admin-only import: upload, column mapping, preview with duplicate detection (same group, type and normalised name), dry-run counts, then commit; size and row limits; errors listed per row.
- Parliamentarian columns: name, party, email, status, status date. Organisation columns: any subset; unmapped columns kept in `details`; emails go to `target_contacts`.
- Parsing and mapping live in `lib/domain` with unit tests using fixture CSVs, including the Notion Outreach Orgs export headers; audit entry for each import.

**Prompt**

```text
Build the CSV import described in spec section 6. Parsing, mapping, normalisation and duplicate detection are pure functions in lib/domain with fixture-based unit tests (create fixtures for a parliamentarian list and for the Notion Outreach Orgs export; its columns include Name, Category, Region, Website, Contact Name, Contact Email, Relationship Stage, Status, Last Contact Date, Notes, scores and draft fields). The UI is a three-step flow: upload, map, preview and confirm. Commit in a single transaction. Admin-only with requireAdmin and an audit entry.
```

---

## Epic: Admin tools and audit (M5)

### D-01 Audit log viewer

Size S · Feature · Spec 9

**Acceptance criteria**

- `/admin/audit` lists audit entries (who, what, when, target) with filters by action and person; admins only.

**Prompt**

```text
Add a read-only audit log viewer with filters and pagination. Tests that non-admins cannot read the table or the page.
```

### D-02 Admin people overview

Size M · Feature · Spec 3, 8

**Acceptance criteria**

- Extends `/admin/people` with status, join date, last login, counts (tasks done, activities joined, times as lead), working groups; filter and search; links to profiles.
- Shows the level criteria progress for fresh volunteers.

**Prompt**

```text
Extend the admin people page from O-06 with the columns and filters in the acceptance criteria, using one efficient query. Show progress towards the experienced criteria from the config thresholds. Tests for the query and for authorisation.
```

### D-03 Data export and anonymise

Size M · Feature · Spec 9

**Acceptance criteria**

- An admin can export a person's data as JSON and anonymise them: personal fields cleared, display name becomes "Former volunteer", Auth user deleted, tasks and activities kept; confirmation step; audit entry.
- Handles the requests created in P-03; tests verify nothing identifying remains.

**Prompt**

```text
Implement export and anonymise per spec section 9, linked to the data requests from P-03. The anonymise operation is one transaction plus Auth user deletion, idempotent and audited. Tests that verify no personal field survives and that other people's data is untouched.
```

### D-04 Configuration editor

Size S · Feature · Spec 8, 9

**Acceptance criteria**

- Admin form to edit level thresholds, the welcome document link and retention values; validated; changes audited.
- Changing thresholds re-evaluates levels at the next daily run.

**Prompt**

```text
Build an admin form over the config table with validation (positive integers, valid URL) and audit entries. Tests for validation and authorisation.
```

---

## Epic: Launch readiness (M5)

### L-01 Permission and visibility regression suite

Size L · Test · Spec 3, 7

**Acceptance criteria**

- One matrix file (`tests/permissions.matrix.ts`) encodes the spec section 3 matrix and the section 7 tiers; database and E2E tests are generated from it for new, fresh, experienced, non-member, outsider (approved but not in group) and admin.
- Required in CI; a change to the matrix fails until the spec and tests agree.

**Prompt**

```text
Create a data-driven permission suite: a single matrix describing every capability and field per role, with generated database tests and a smaller set of E2E tests. Review spec sections 3 and 7 line by line against the implementation and report any mismatch before fixing it. Make the suite a required CI job.
```

### L-02 Backups and restore drill

Size M · Chore · Spec 10

**Acceptance criteria**

- Scheduled GitHub Action dumps production schema and data to private encrypted storage; failure alerts the maintainer.
- A restore into staging is performed and documented in the runbook; the free-tier inactivity pause behaviour is documented with a mitigation.

**Prompt**

```text
Implement the scheduled backup (pg_dump over the Supabase connection string, encrypted, kept in private storage with a retention window) and document and perform a restore drill into staging. Explain the Supabase free-tier pause rules as they stand today and add a mitigation to the runbook.
```

### L-03 Accessibility and mobile pass

Size M · Test · Spec 9

**Acceptance criteria**

- Axe checks cover every main page in CI; a manual checklist (keyboard-only, screen reader smoke test, 200% zoom, 375/768/1440 widths) is completed and recorded; issues fixed.

**Prompt**

```text
Run an accessibility and responsive review of all screens: extend the axe tests to every main page, perform and record the manual checklist in docs/accessibility.md, and fix what you find. Use the accessibility skills if available.
```

### L-04 Privacy and legal pass

Size M · Chore · Spec 9

**Acceptance criteria**

- Retention jobs run on a schedule (delete rejected applications after the configured months; purge former volunteers' leftover personal data after the configured months); tested.
- Records of processing, a breach-response note and the Global escalation checklist exist in `docs/privacy/`.
- I review the Italian privacy notice and remove the draft marker.

**Prompt**

```text
Implement the scheduled retention jobs from spec section 9 using the config values, with tests. Write docs/privacy/records-of-processing.md, breach-response.md and escalation-to-global.md from the spec. List every place personal data is stored or sent (Supabase, Vercel logs, Resend) so I can review them.
```

### L-05 Pilot with about ten volunteers

Size M · Chore · Spec 1, 8

**Acceptance criteria**

- Lobbying group set up with a General activity; lobbying targets and organisations imported on staging first, then production.
- About ten volunteers invited and approved; the welcome document link set; a walkthrough script and a feedback channel exist.
- A prioritised list of issues from the pilot is in Notion.

**Prompt**

```text
Prepare the pilot: a seed or admin checklist to create the Lobbying group with its first activities and tasks, a dry-run CSV import on staging, a one-page walkthrough script for volunteers (English and Italian), and a feedback form or channel. Do not invite anyone yourself; list the steps for me.
```

### L-06 Handover documentation and first architecture snapshot

Size S · Docs · Spec 10

**Acceptance criteria**

- First dated snapshot in `docs/architecture/` (diagrams re-derived from the code); runbook complete; ADR index current; a "new maintainer" guide that gets a volunteer from zero to a merged pull request.

**Prompt**

```text
Write the first architecture snapshot in docs/architecture, modelled on Tell The World's snapshots but re-derived from this codebase. Complete the runbook, review the ADR index and write docs/new-maintainer.md. Test the guide by following it on a clean checkout and fix any gap.
```
