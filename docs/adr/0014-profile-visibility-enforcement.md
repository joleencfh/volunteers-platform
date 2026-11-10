# ADR-0014: Profile visibility enforcement

Status: accepted (P-01)

## Context

Spec section 7 gives each optional profile field (city, bio, LinkedIn link, AI safety knowledge level, AI risks most invested in) a visibility tier the volunteer chooses: admin only, people who share a working group, or all members, each with a default. Real name, email, how someone heard of PauseAI, join date, first active date and last login are fixed admin-only. Row-level security works per row, not per column, so it cannot hide single fields of `users` from another member. ADR-0009 also forbids a broad update policy on `users`.

## Decision

- **One SQL function decides every optional field:** `can_view_profile_field(viewer, owner, field)` (security definer). The owner and active admins see every field; another active member sees it when the effective tier is `members`, or `group` and `shares_working_group(viewer, owner)`; anything else, unknown fields and deactivated viewers or owners give false. Only the service role may call it and its building blocks directly, because called with any viewer id they would reveal other people's choices and groups.
- **Members read profiles through an RPC, `get_profile(owner)`, not a view.** A view cannot know which field a given viewer may see without repeating the rules per column, and a function takes the owner as an argument. It returns no row unless the caller and the owner are active members; display name and level always; hidden fields as null; the fixed fields only to an active admin or the owner. How someone heard stays on `applications` and is never returned.
- **Choices live in `profile_visibility` (user, field, tier)**; a missing row means the default. Members manage only their own rows; admins read all and change none.
- **Defaults are written twice, in `lib/domain/profile-fields.ts` and in `profile_field_default_tier()`,** because the page needs them before a choice exists and the database must enforce them alone. A database test compares the two.
- **Members write their own row through `update_own_profile(...)`**, a security-definer function that changes only display name, city, bio, LinkedIn link, knowledge level and risks for `auth.uid()`. `users` keeps no member write policy.
- **Field choices the spec leaves open:** the knowledge level reuses the application form's `none | basic | intermediate | advanced`; "AI risks most invested in" is free text of at most 500 characters; the LinkedIn link must start with `https://`; the bio is capped at 500 characters. These are assumptions to confirm.
- **`shares_working_group(a, b)` is a stub returning false** until W-01 redefines it over the working group membership table.

## Consequences

- Until W-01 the `group` tier behaves like admin only, so knowledge level and risks are hidden from other members by default.
- Adding an optional field means touching three places: the column and check constraints with `profile_field_default_tier()` and `get_profile()` in a new migration, `lib/domain/profile-fields.ts`, and the database test. The test fails if SQL and TypeScript drift.
- Changing `get_profile`'s columns means dropping and recreating it, since Postgres cannot change a function's return type in place.
- Admins read a deactivated person's data from `users` directly (their policy allows it), not through `get_profile`.
