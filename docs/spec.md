# PauseAI IT Volunteer Platform: Product Spec

Last updated: 2026-10-11

## 1. Purpose, scope and guiding decisions

This is a private web app where approved PauseAI Italy volunteers organise their work as working groups, activities and tasks, starting with Lobbying. Version 1 must also make onboarding of new volunteers work end to end.

**Scale:** 30–300 volunteers in the first year, about 10 at launch. **Audience:** logged-in, approved volunteers only; nothing is public except the application form and the privacy notice.

| Decision | Choice |
| --- | --- |
| Stack | Next.js (App Router) + TypeScript + Tailwind, Supabase (Postgres, Auth, row-level security), Vercel, Resend for email, Playwright for tests |
| Language | Code, comments, database names, docs and UI are in English. All UI text lives in translation files so Italian can be added without code changes. The application form, consent text, pending/rejected screens and privacy notice are in Italian from v1. |
| Devices | Responsive. Dense screens (targets, admin, campaigns) are designed for desktop; task, profile and onboarding screens work well on phones. |
| Cost | Free tiers of Supabase, Vercel and Resend for the first months. |
| Ownership | Starts as a personal project run by the maintainer, not yet by PauseAI Global. The privacy notice must say so (section 9) and an escalation checklist covers transfer to Global. |
| Maintenance | One maintainer at first; other volunteers may take over within about 3 months. Code must be simple, conventional and documented (README, CLAUDE.md). |
| Customisation | Fixed core fields plus developer-defined extension fields per activity type and target type. An admin UI for custom fields is out of scope. |

## 2. Core concepts

All work follows one hierarchy: a working group contains activities, and an activity contains tasks. The same three concepts serve Lobbying, Outreach and anything added later, whatever the group is called.

- **Working group (WG):** a standing team with members and a weekly rotating lead, e.g. Lobbying.
  - **Activity:** a piece of work with one or more volunteers and one or more tasks, e.g. a campaign, a call with a parliamentarian, creating a presentation.
    - **Task:** one unit of work done by one volunteer, e.g. reply to an email, research for a presentation.

**Rules**

- An activity belongs to exactly one working group. A task belongs to exactly one activity.
- Every working group has an auto-created standing activity called "General", so loose tasks (e.g. "create the event for the internal call") still have a home.
- A task has at most one assignee. An activity can have many participants.
- **Targets** (parliamentarians, organisations) are a separate entity owned by a working group; activities and logs can link to them.
- **Fixed vs extendable:** every WG, activity and task has the same core fields (section 5). Activities and targets also carry a type, and each type adds its own extra fields, defined in code with a validation schema and stored in a `details` JSON column. Adding a new type must not need a database migration.

**Glossary**

| Term | Meaning |
| --- | --- |
| Volunteer | Any approved person on the platform, at level new, fresh or experienced |
| Admin | A person with the admin flag; can do everything |
| Contribution | A completed task. Only completed tasks count towards the new → fresh promotion |
| WG lead | The person responsible for a WG for a given week; a responsibility with a checklist, not extra permissions |
| Key activity | An activity flagged as important; stored from v1, used for points in a later version |

## 3. Users, levels and permissions

Each volunteer has one level (new, fresh or experienced) and may also be an admin. Permissions depend on level and, for most actions, on membership of the working group concerned. Everything below must be enforced in the database (row-level security) and in server actions, not only hidden in the UI.

**Levels**

- **New:** exploration mode, from approval until 3 completed tasks. Promotion to fresh is automatic and the volunteer is notified.
- **Fresh:** can do most things inside the working groups they belong to.
- **Experienced:** can do everything in their working groups except admin functions. Promotion is automatic once the combined criteria in section 8 are met; admins can also set any level by hand.
- **Admin:** all actions, in all working groups.

**Permission matrix (proposal for v1; confirmed, with no further exceptions flagged)**

| Capability | New | Fresh | Experienced | Admin |
| --- | --- | --- | --- | --- |
| See the list of working groups and their limited public view | Yes | Yes | Yes | Yes |
| See full WG pages (tasks, members, docs, targets) | Own WGs | Own WGs | Own WGs | All |
| Request to join a working group | Yes | Yes | Yes | n/a |
| Approve a WG join request | No | Own WGs | Own WGs | Yes |
| Take a task, complete it, comment | Yes | Yes | Yes | Yes |
| Join an activity | As observer | As participant | As participant | Yes |
| Create tasks | No | Yes | Yes | Yes |
| Create activities and campaigns | No | Yes | Yes | Yes |
| Edit or archive others' activities in own WG | No | No | Yes | Yes |
| Create and edit targets; add entries to a target's interaction log | No | Yes | Yes | Yes |
| See target contact details (email, phone) | No | No | No | Yes |
| Assign the WG lead for the week | No | No | Yes | Yes |
| Create working groups, import CSV, change levels | No | No | No | Yes |
| Approve or reject applications | No | No | No | Yes (experienced volunteers later) |
| Confirm admin-confirmed onboarding steps | No | No | No | Yes |

A person who was not yet approved has no access beyond the pending screen. Deactivation and its consequences are a later version (section 8).

## 4. Authentication and application

Sign-in is password-less (emailed magic link or Google), and only admin-approved people can sign in. Anyone can apply; nobody gets in without approval.

**Flow**

1. A visitor opens the public application form (Italian text, English later) and submits it.
2. They see a "pending" screen. They cannot see anything else, even if they sign in.
3. All admins get an email; the application appears in an admin review list.
4. An admin approves or rejects. Approval creates the user at level new (or a higher level the admin picks for people who are already experienced), marks the application approved and emails a sign-in link. Rejection emails a short notice and shows a "not approved" screen.
5. From then on the person signs in with a magic link or Google. A sign-in by anyone without a member record is refused and signed out immediately.

**Application form fields**

| Field | Notes |
| --- | --- |
| Display name | Required; shown to other members |
| First and last name | Required; admin-only |
| Email | Required; must match the email used to sign in |
| City or region | Required; admin-only by default |
| Motivation | Short free text |
| How they heard of PauseAI | Global website, Italian website, word of mouth, other (specify); admin-only |
| AI safety knowledge level | Choice list |
| Consent | Two separate required checkboxes: acceptance of the privacy notice, and explicit consent to processing that may reveal political opinions (section 9) |
| Hidden honeypot field | Bot protection; silently ignored if filled |

**Requirements**

- Admin status is a database flag on the user, not an environment variable. The first admin is the maintainer, set by a documented seed step.
- Only a person with an approved member record can sign in; Google sign-in must not create access on its own.
- Rate-limit magic-link requests and applications. The in-memory limiter used in the Tell The World project is acceptable for launch; document that it is per instance.
- Magic-link responses must not reveal whether an email belongs to a member.
- Session cookies refresh on every request, as in the existing proxy.
- Applications are kept after the decision for the retention period in section 9.

## 5. Working groups, activities and tasks

### Working groups

| Field | Notes |
| --- | --- |
| Name, short description | Required |
| Signal group link, docs links | Links only; no embedded chat or document hosting |
| Members | Volunteers with a join date |
| Join requests | Approved by any fresh or experienced member of that group, or an admin |
| Lead of the week | One lead per week with history; see below |
| Planned meetings | Date, time, link, agenda link |

- Only admins create working groups. Seed Lobbying first; Outreach is added the same way.
- **Limited view for non-members:** name, description, lead and activity titles with status. Tasks, docs, members and targets are hidden. Admins see everything.
- **Lead of the week:** a responsibility, not extra permissions. The WG page shows the current lead and this checklist: moderate the call and check who is joining; prepare the agenda and take notes; organise the next call if decided a week or more ahead; check whether people are doing their tasks and need help. Experienced volunteers and admins assign the lead.

### Activities

| Field | Notes |
| --- | --- |
| Title, description | Required |
| Working group, type | Required; type decides the extra fields |
| Status | Planned, active, done, cancelled |
| Start and due dates | Optional |
| Lead | One participant |
| Participants | Each with a role: participant or observer (new volunteers join as observer) |
| Key activity flag | Boolean, stored from v1 |
| Links | Docs and other references |
| Postmortem (optional, any type) | What went well; points for improvement; general learning points to add to the guidelines doc |
| Details | Type-specific fields below |

**Activity types and extension fields for v1 (Lobbying)**

| Type | Extra fields |
| --- | --- |
| Campaign | Message content or link, send date, targets contacted (links to targets), who responded, volunteers participating |
| Call with target | Target(s), date and time, materials shown (report, website link, presentation), notes, asks made, outcome |
| Meeting or co-working | Date and time, meeting link, agenda link, notes link |
| Content creation | Output type (presentation, social post, info material), link to the result |

The General activity per WG is created automatically and cannot be deleted.

### Tasks

| Field | Notes |
| --- | --- |
| Title, description | Required |
| Activity | Required (see General) |
| Assignee | None or one volunteer; any member can take an unassigned task |
| Status | Open, in progress, done |
| Due date | Optional |
| Completion note and link | At least one required to mark done; this is the visible trail of the work |
| Completed at | Set automatically |

Starter tasks for Lobbying (examples only, created by users): check incoming email and reply, create or fix a presentation for a call, create a social media post, create or fix info material.

Marking a task done increments the volunteer's completed-task count, which drives promotion (section 8). Admins can reopen a task. Assigning a task sends the assignee an email.

## 6. Targets

A target is a person or organisation a working group wants to reach. Targets belong to a working group, have a type, and have their own page (a modal is acceptable for v1). Lobbying owns parliamentarians; Outreach will own organisations, journalists, news outlets and experts (the admin chooses the owning group). Influencers can be added later as a new type.

**Core fields (all types)**

| Field | Notes |
| --- | --- |
| Type | Parliamentarian, organisation, journalist or news outlet, expert (extendable) |
| Working group | Owner; only members and admins see the target |
| Name | Required |
| Status | Per-type list, with the date of the last status change |
| Links | Website, report received, social links |
| Next steps | Free text |
| Notes | Factual only; people can request access to what is recorded about them |
| Details | Type-specific fields below |

**Type-specific fields**

| Type | Fields |
| --- | --- |
| Parliamentarian | Title (senator, deputy, minister, ...), legislature (elected since), party (free text in v1; colleagues are the other targets with the same party), chamber |
| Organisation | Category (union, student org, NGO, church, community group, ...), region, website, relationship stage (no response, replied, call scheduled, had call, met in person, ongoing partner, went cold), partner capacity, high strategic value flag, bridge to a larger organisation |
| Journalist or news outlet | Kind (journalist or outlet), outlet name (for a journalist), role, topics covered, language, medium (print, web, TV, radio, podcast), approximate audience size |
| Expert | Affiliation, area of expertise, how they could help (advice, endorsement, speaking, introductions), languages |

**Contact details are separate and admin-only.** Email, phone and contact person live in their own table with row-level security limited to admins (a later version may let the current WG lead see them); they never appear in lists or exports shown to other members. Other volunteers log what happened (below) without seeing the address.

**Interaction log.** A dated list on each target, entered manually by volunteers (no email integration in v1): date, direction (we reached out, they replied, we followed up), channel (email, call, meeting, event), summary, link to the related activity or campaign, who logged it. Calls made, asks and the response to each ask, information sent to the target, contacts they gave, and events they attended are entries in this log with a type, so one list answers "everyone contacted, how many times, with what message".

**Views**

- Targets list per working group: filter by status and type, with last contact date and number of contacts.
- Campaign view: an activity of type campaign shows the targets contacted, who responded and the postmortem.

**CSV import (admin only).** Upload, map columns, preview with duplicate detection by name, then confirm. Parliamentarians: name, party, email, status, status date. Organisations: any subset of the organisation fields; unmapped columns from the existing Notion database (scores, drafts, relationship log) are kept in the `details` JSON so nothing is lost. Emails go to the admin-only contact table.

## 7. Volunteer profiles and visibility

Every volunteer has a profile page. Other members see only a display name (which need not be a real name) plus whatever the person chooses to share; admins see everything. Visibility is enforced in the database, not just in the interface.

**Visibility tiers:** admin only; people who share a working group with the viewer; all members.

| Field | Default visibility | Who sets it |
| --- | --- | --- |
| Display name | All members | Volunteer |
| Level badge (new, fresh, experienced) | All members | System |
| Real name, email | Admin only (fixed) | Volunteer / application |
| How they heard of PauseAI, join date, first active date, last login | Admin only (fixed) | System / application |
| City or region | Admin only | Volunteer chooses to widen |
| Short bio | All members | Volunteer chooses |
| LinkedIn link | Admin only | Volunteer chooses to widen |
| AI safety knowledge level | Same working group | Volunteer chooses |
| AI risks most invested in | Same working group | Volunteer chooses |
| Working groups they belong to | Same working group | System |
| Latest and planned activities and tasks | Same working group, only items in groups the viewer can fully see | System |

- The volunteer edits their own profile; each optional field has a visibility control limited to the tiers above.
- Profiles never show more than the viewer's access to the underlying working group allows.
- New volunteers are prompted to complete the profile (display name, city, bio) as part of onboarding.
- Points are not shown on profiles in v1 and, when added, only if the person opts in; there is no leaderboard.
- Not in v1: weekly activity record, availability, "what help I need", 1-on-1 requests, buddy status, "read or watched this week".

## 8. Onboarding and level progression

Onboarding is a checklist every new volunteer sees on their home page until it is complete. Each step is confirmed in one of three ways: by the volunteer, automatically by the system, or by an admin.

| # | Step | Confirmed by |
| --- | --- | --- |
| 1 | Added to the platform | Automatic (on approval) |
| 2 | Added to the Signal group | Admin |
| 3 | Read the welcome document | Volunteer: a window opens the link and asks "I've read it", "Later" or "Close" |
| 4 | Looked at current activities | Volunteer: a window lists current activities with the same three choices |
| 5 | Joined one working group | Automatic |
| 6 | Took part in the first group call | Admin |
| 7 | Joined or contributed to a first activity (a completed task with a note and link) | Automatic |
| 8 | One-on-one check-in of 15–20 minutes | Admin |

- Steps 3 and 4 are shown as prompts on first login and stay on the checklist until done. The welcome document is a link set in a configuration table.
- Admins have an onboarding overview listing people with open admin-confirmed steps, and tick them off there.
- Completing the profile (section 7) is shown as a prompt beside the checklist, not a step.
- The checklist definition lives in a table so steps can be reordered or reworded without code.

**Level progression**

- **New → fresh:** automatic when the volunteer has 3 completed tasks. The threshold is a configuration value, not hard-coded.
- **Fresh → experienced:** all of these criteria must hold together, with values stored in a configuration table (initial values: 7 activities joined as a participant, 20 tasks completed, 3 times as WG lead, 2 months since joining). Promotion happens automatically: it is checked whenever a task is completed, an activity is joined or a lead is assigned, plus a daily scheduled check for the months criterion. The system only promotes and never demotes. Admins can set any volunteer's level by hand at any time, with the reason recorded in the audit log, including at approval (people who are already experienced start at the level the admin chooses, not at new).

**Later versions (not v1):** a "possibly inactive" list for admins (one month without justified activity for new volunteers, two months for others), flag-only; the admin decides after checking with the person and their teammates. Deactivation is reversible; a deactivated person does not see activities and must be re-approved at a level the admin chooses.

## 9. Notifications, privacy and branding

### Notifications (v1)

Email only, through Resend: sign-in links, application received (to admins and applicant), application approved or rejected, task assigned. Pending approvals (applications, WG join requests) show as a badge in the app. No digests, calendar feed or reminders in v1.

### Privacy and GDPR

This is a summary for the build, not legal advice; the maintainer reviews the wording.

- **Controller:** the platform starts as a personal project of the maintainer for PauseAI Italy volunteers. The privacy notice names the maintainer as contact and says so plainly. It moves to PauseAI Global later (escalation checklist below).
- **Italian privacy notice at launch**, linked from the application form and every page footer, covering purposes, data kept, who sees what, retention, rights and the contact.
- **Special category risk:** membership of an advocacy group can reveal political opinions, so the application asks for explicit, separate consent, stored with a timestamp and the notice version.
- **Data minimisation:** collect only what the platform uses; LinkedIn is a link, never an uploaded CV.
- **Access control:** admin-only fields and target contact details are protected by row-level security. Record admin views and edits of contact details in an audit log.
- **Rights:** admins can export a person's data and delete or anonymise it on request. Deletion keeps activity and task records but replaces the person with "Former volunteer".
- **Retention (defaults, to be confirmed):** rejected applications deleted after 6 months; personal fields of people who leave purged after 12 months.
- **Targets:** professional and public contact details only; notes stay factual.
- **Processors and region:** Supabase project in an EU region; accept the data processing terms of Supabase, Vercel and Resend. Keep a short record of processing and a breach-response note (notify the Italian authority within 72 hours where required).

**Escalation checklist when PauseAI Global takes over:** their sign-off; new controller named in the notice; accounts moved to an organisation owner; processor terms in the organisation's name; admin list reviewed.

### Branding, language and interface

- PauseAI branding: the logo supplied by the maintainer, an orange (about #FF9416 from the logo), black and white, bold sans-serif type. The builder confirms colours and fonts from the PauseAI website stylesheet and records them as design tokens.
- Black text on orange; orange text on white fails contrast and must not be used for body text. Target WCAG 2.2 AA, keyboard operable.
- Light theme first; dark theme optional later.
- Internationalisation: a translation library with one English message file per area; no literal UI strings in components; dates and numbers formatted through the locale; a per-user language preference column, even though v1 ships English plus the Italian legal screens.

## 10. Data model, build notes, phasing and open questions

### Data model overview

| Table | Purpose |
| --- | --- |
| `users` | Profile, level, admin flag, locale, status, join date, last login |
| `applications` | Application form data, consent record, decision |
| `profile_visibility` | Per-field visibility choice per user |
| `working_groups`, `wg_members`, `wg_join_requests`, `wg_leads` | Groups, membership, join approvals, weekly lead history |
| `activities`, `activity_participants` | Activities with type, status, `details` JSON, postmortem; participant role |
| `tasks` | Tasks with assignee, status, completion note and link |
| `targets`, `target_contacts`, `target_interactions` | Targets, admin-only contact details, dated interaction log |
| `onboarding_steps`, `user_onboarding` | Checklist definition and per-user progress |
| `config` | Level thresholds and other settings, including the welcome document link |
| `audit_log` | Admin actions on levels, applications and target contacts |

Every table has row-level security. Schema changes are numbered SQL migrations in the repository. Activity and target type definitions and their `details` schemas live in code.

### Build notes

- **Tests:** Playwright tests for sign-in, application and approval, and above all for permissions and visibility: a new volunteer, a non-member and an admin each see exactly what section 3 and section 7 say.
- **Backups:** the free Supabase tier has no automatic backups, so add a scheduled export (e.g. a GitHub Action) to private storage, and check the free tier's inactivity pause.
- **Hosting terms:** check that Vercel's Hobby plan terms allow this use; Cloudflare Pages is the fallback.
- **Repository:** a README, a `CLAUDE.md` with conventions (English only, no hard-coded UI strings, RLS on every table, how to run tests), and `.env.schema` for environment variables.
- **Reuse from the Tell The World project (copy the pattern, then adapt):** the three Supabase client files, the session proxy and its public-route list, the OAuth/magic-link callback and approval check, the sign-in server actions without LinkedIn, the application, approval and rejection flow with its admin review list, and the Resend email wrapper. Do not copy the briefs, content, directory or messages code. Use a separate Supabase project. The code repository is public, so it never contains real personal data, real contact lists, keys, or personal paths and email addresses; test data is synthetic.

### Engineering standards (delivered by the Foundation epic)

These are set up first, before any feature, so every later change is checked the same way. They follow the Tell The World project, with the improvements noted.

| Area | Standard |
| --- | --- |
| Tooling | Bun for packages and scripts, as in Tell The World. TypeScript strict, ESLint with the Next.js rules, Prettier, a 500-line file warning. One command each for lint, type check, unit tests, database tests, E2E tests and build. |
| Tests, three layers | **Unit tests** (Vitest) for pure rules: level promotion, visibility, CSV parsing. **Database tests** against a local Supabase proving who can and cannot read or write each table. **End-to-end tests** (Playwright) for the critical journeys: apply and approval, sign-in, join a working group, complete a task, target visibility. An automated accessibility check (axe) runs on key pages. |
| Testing rules | A bug fix starts with a test that fails. Every permission or visibility rule has an allowed case and a denied case. Every server action has at least one test. No repository-wide coverage target; the business-logic folder must stay at or above 80% line coverage, reported in CI. |
| CI on every pull request | GitHub Actions: secret scan (gitleaks, as in Tell The World), lint, type check, unit and database tests, build, end-to-end tests, dependency audit. All must pass before merging; branch protection on the main branch even with one maintainer. |
| Environments | Database and end-to-end tests run against a local Supabase started in CI (GitHub runners include Docker). Day-to-day development runs against the hosted staging project, which holds only synthetic data; a local Supabase through Docker is optional. A separate staging project and a production project, if the free tier allows two. Vercel preview deployments per pull request. |
| Migrations | Versioned SQL migrations through the Supabase CLI, applied by a command or CI, not pasted by hand. Generated database types committed. A CI check fails if any table lacks row-level security. |
| Security | Every server action authorises first (a shared helper for admin, level and group membership). Service-role and email modules are `server-only` and never exposed as actions. Server-side input validation (Zod). Security headers (CSP, HSTS, frame and referrer policies). Environment variables declared in a schema file, secrets never committed, redirect-URL allowlist for sign-in. Dependabot for updates. `SECURITY.md` with a reporting contact. |
| Decisions | Architecture Decision Records in `docs/adr/`, one short numbered file per decision (context, decision, consequences), never edited once accepted, only superseded. First ADRs: stack choice; row-level security as the permission layer; extension fields as JSON validated in code; separate admin-only contact table; automatic promotion; no email integration in v1; translation library. Dated architecture snapshots in `docs/architecture/`, as in Tell The World, at each milestone. |
| Documentation | README (setup in under 15 minutes), CONTRIBUTING (conventions, pull request process), `CLAUDE.md`, a short runbook (restore a backup, rotate keys, add an admin, deploy), a pull request template with a security and privacy checklist. |
| Git | Short-lived branches (`feature/`, `fix/`, `chore/`), commit messages that name the Notion story ID, pull requests even for the maintainer's own work. |
| Guardrails | The rules above are enforced, not just written down. CI and the branch ruleset bind everyone: applied migrations cannot be edited, generated types must match the migrations, the pull request checklist must be ticked, the secret scan has rules for personal paths and real email addresses, and tests refuse to run against a non-local database. A pre-commit hook and committed Claude Code settings (permission rules, a file guard, a formatter and a Stop hook that runs the fast checks) give quicker feedback on the maintainer's machine. docs/runbook.md lists every rule, where it is enforced and how to override it. |

### Phasing

| Version | Contents |
| --- | --- |
| v1 | Project foundation and translation setup; sign-in and application flow with admin review; users, levels and automatic new → fresh promotion; working groups, activities, tasks; profiles with visibility tiers; onboarding checklist; targets with interaction log and CSV import; essential emails; Italian legal screens |
| v2 | Full Italian translation; calendar feed for meetings; meeting attendance recorded by members; experienced volunteers can approve applications; Outreach-specific extensions (influencers); small improvements from real use |
| v3 and later | Weekly check-ins and availability; "possibly inactive" list; inactivation; points (opt-in visibility, no leaderboard); buddy programme; help needed and 1-on-1 requests; weekly digest; admin UI for custom fields; email insights if still wanted |

### Open questions

- Whether the WG lead should be able to see target contact details once email sending is designed (v1: admins only, to keep access rules simple).
- Point values for v3, to be edited through the configuration table once points are built.
- Any capability to deny fresh or experienced volunteers beyond the matrix: none flagged so far.
- Decided: retention defaults in section 9; working name PauseAI IT; the maintainer is the first admin.
