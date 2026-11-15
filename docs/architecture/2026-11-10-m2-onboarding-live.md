# Architecture snapshot: M2 Onboarding live (2026-11-10)

## Overview

A signed-in volunteer lands on `/home`, sees the onboarding checklist, confirms the steps they confirm themselves, edits their profile with a visibility choice per field, picks a language, signs out, and can file a data export or deletion request. Other members and admins see profiles exactly as spec section 7 says. Admins tick admin-confirmed steps and handle data requests. The `/` page stays the public placeholder; a signed-in member is redirected from it to `/home`.

## Components

Routes (all under `app/[lang]`; the locale is chosen by `proxy.ts`):

| Route                  | Who           | What                                                                              |
| ---------------------- | ------------- | --------------------------------------------------------------------------------- |
| `/home`                | active member | Onboarding checklist, read-and-confirm windows for steps 3 and 4, profile prompt  |
| `/profile`             | active member | Edit own profile and per-field visibility; fixed fields shown read-only           |
| `/people/[id]`         | active member | Another member's profile through `get_profile`; 404 for anyone who is not visible |
| `/settings`            | active member | Language, sign out, data export or deletion request                               |
| `/admin`               | admin         | Admin home with links to the tools                                                |
| `/admin/applications`  | admin         | Application review (M1)                                                           |
| `/admin/onboarding`    | admin         | Members with open admin-confirmed steps; tick and untick, audited                 |
| `/admin/data-requests` | admin         | Export and deletion requests, mark as handled, audited                            |

Signed-out visitors are redirected to `/login` by `proxy.ts`; a signed-in person without a member record is sent to `/login?error=signin` by `requireUser`; a member on an admin route gets a 404 from `requireAdmin`. Every server action starts with `requireUser()` or `requireAdmin()`.

Pure rules live in `lib/domain`: `profile-fields` (field list, tiers, defaults, fixed fields, Zod schema), `profile-completion`, `onboarding`, `onboarding-overview`, `welcome-document`, `data-requests`, `locale-preference`. Components added: `components/profile/*`, `components/onboarding/CurrentActivitiesList.tsx`, `components/shell/MainNav.tsx`.

Header navigation: Home (`/home`), My profile, Settings for members; Home (`/`) for visitors; an Admin link (to `/admin`, with the number of pending applications) for admins.

## Data

Added in M2, all with row-level security enabled in the same migration.

| Table or function                                                              | Read                                                      | Write                                                                                           |
| ------------------------------------------------------------------------------ | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `users` (new columns `bio`, `linkedin_url`, `ai_safety_knowledge`, `ai_risks`) | per M1 policies; other members only through `get_profile` | members only through `update_own_profile` and `set_own_locale` (no new write policy)            |
| `profile_visibility`                                                           | owner; admins                                             | owner (own rows)                                                                                |
| `onboarding_steps`                                                             | active members                                            | admins                                                                                          |
| `user_onboarding`                                                              | own rows; admins all                                      | member inserts own rows for `self` steps; admins insert and delete any; `auto` steps by trigger |
| `data_requests`                                                                | own rows; admins all                                      | member inserts own open request (one open per kind); admins mark done                           |
| `public.get_profile(owner)`                                                    | active members and admins                                 | read-only RPC                                                                                   |
| `public.can_view_profile_field`                                                | internal, security definer                                | single enforcement point for the five optional fields                                           |
| `public.shares_working_group`                                                  | stub returning false until W-01                           |                                                                                                 |
| `public.update_own_profile`                                                    | -                                                         | changes only display name, city, bio, LinkedIn, knowledge level, risks for `auth.uid()`         |
| `public.set_own_locale`                                                        | -                                                         | changes only `locale` (`en` or `it`) for `auth.uid()`                                           |
| trigger `complete_added_to_platform`                                           | -                                                         | inserts onboarding step 1 when a row is added to `users`                                        |

Profile visibility: display name and level are visible to all members; city, bio, LinkedIn URL, AI safety knowledge and AI risks each have a tier (`admin`, `group`, `members`) with defaults city `admin`, bio `members`, LinkedIn `admin`, knowledge `group`, risks `group`. Real name, email, joined, first active and last login are admin-only (and the owner) and never returned to anyone else. The path is: page calls `get_profile` through the RLS client, the RPC calls `can_view_profile_field` per field, and unseen fields come back null. The defaults exist in `lib/domain/profile-fields.ts` and in SQL; a database test fails if they drift (ADR-0014).

Onboarding flow: eight steps seeded in `onboarding_steps` (positions 1 to 8). Step 1 completes by trigger; steps 3 and 4 are self-confirmed from windows on `/home` ("I've read it" completes; "Later" and "Close" do not, "Later" also stops the automatic opening for the browser session); steps 2, 6 and 8 are ticked by an admin; steps 5 and 7 are automatic and stay open until M3 (ADR-0015). The welcome link comes from `config` key `onboarding.welcome_document_url`.

Locale: `users.locale` is the source of truth; `pauseai_locale` (httpOnly cookie) mirrors it so `proxy.ts` can choose the language without a database read. It is set at sign-in and on save, cleared at sign-out. Legal routes (`/apply`, `/privacy`) stay Italian whatever the cookie says (ADR-0016).

Emails (Resend, English, server-only, sending is best effort): approval and rejection of applications (M1), new application to admins (M1), data request received to admins (M2; kind and display name only, plus a link to `/admin/data-requests`).

Audit log entries added: `onboarding.step_confirmed`, `onboarding.step_unconfirmed`, `data_request.handled`; details hold ids and step or request kind only.

## Environments

Unchanged from M1. Day-to-day work runs against the hosted staging project; database and end-to-end tests run in CI against a local Supabase. On the hosted project, `20261110120000_profile_visibility.sql`, `20261110130000_onboarding.sql` and `20261110130137_onboarding_admin_insert_scope.sql` are already applied. `20261110164237_set_own_locale.sql` and `20261110164711_data_requests.sql` are still pending; the maintainer pushes them by hand, in file order (see the runbook, "Milestone M2").

## Decisions

ADR-0014 profile visibility enforcement, ADR-0015 onboarding steps and progress, ADR-0016 language preference cookie, ADR-0017 data requests. Earlier ADRs are unchanged.

## Known gaps

- Onboarding steps 5 (joined a working group) and 7 (first contribution) stay open until M3 (O-04).
- The `group` visibility tier behaves like admin only until W-01 replaces the `shares_working_group` stub; "latest and planned work" and "working groups they belong to" on profiles are placeholders until M3.
- The first-login prompt has no trigger in the spec; M2 opens step 3's window automatically while it is open, once per browser session. "Later" and "Close" behaviour and the empty welcome link behaviour are choices of this milestone, not spec text.
- Approval does not copy `applications.ai_safety_knowledge` into the profile.
- There is no admin people table (O-06) and no export or anonymise tooling (D-03): data requests are only recorded and handled by hand.
- Admin strings exist in English only (`messages/it.json` has no admin block and falls back to English).
- Not run locally, only in CI: database tests (`bun run test:db`) and end-to-end tests (`bun run test:e2e`). The hosted project still lacks `20261110164237_set_own_locale.sql` and `20261110164711_data_requests.sql` until they are pushed.
- Proposed spec edits, none made: `docs/spec.md` is unchanged. (1) Data requests: a section 9 notification and a section 10 table. (2) `/home` as the signed-in home route, with redirects from `/` and `/login`. (3) "Later" closes the window and suppresses auto-open for the browser session; "Close" only closes; neither completes the step. (4) First-login prompt: step 3's window opens automatically while the step is open, once per browser session. (5) Behaviour for an empty or invalid welcome link. (6) AI safety knowledge level choices none, basic, intermediate, advanced, and AI risks as free text capped at 500 characters. (7) Approval does not copy `applications.ai_safety_knowledge` into the profile. (8) The group visibility tier acts as admin only until W-01.
