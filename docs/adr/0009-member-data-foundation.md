# ADR-0009: Member data foundation

Status: accepted (A-01)

## Context

Other members may see only a person's display name and level, while real name, email, city and dates stay admin-only (spec section 7). Row-level security works per row, not per column, and a single database role (`authenticated`) serves every signed-in person. Supabase's default privileges also grant everything on new tables to `anon` and `authenticated`. A few fields are not settled by the spec, and A-02 to A-04 build on these tables.

## Decision

- **`public.members` is a security-definer view** (`security_invoker = false`, `security_barrier = true`) exposing `id`, `display_name` and `level` of active members, and only to active members. It is the one place that reads rows the caller's own policies hide. `id` is included beyond the two visible fields because it is an opaque key, needed to link people to tasks and profiles. Supabase's linter flags such views; this one is intended.
- **Every migration revokes the default grants and grants narrowly.** RLS then filters what the grants allow. `anon` has no access to any of these tables; the public application form inserts through the service role (A-03).
- **Membership checks live in `is_active_member()` and `is_admin()`**, security-definer functions that avoid policy recursion on `users`. A deactivated person counts as neither, even with the admin flag set. They can still read their own row, so sign-in can tell why they are refused.
- **Members have no write policy on `users` yet**, so nobody can change their own level or admin flag. Profile editing (M2) must add a narrow path, not a broad update policy, and `last_login_at` is written by the server.
- **`audit_log` is append-only.** Only the service role may insert; nobody has update or delete. A future purge or anonymisation needs an explicit new grant.
- **`config` is readable by active members**, because thresholds and the welcome link are not sensitive, and writable by admins. Values are JSON under dotted keys such as `level.new_to_fresh.completed_tasks`. Public pages read it through the server.
- **`users.id` references `auth.users` with `on delete restrict`**, so deleting an auth user cannot silently remove a member. Deletion on request (spec section 9) replaces the person with "Former volunteer" and must handle this reference.
- **`users.city` is nullable** because the seeded first admin has no application; it is required on `applications`. `motivation` and `ai_safety_knowledge` are nullable because the spec does not mark them required.
- **`ai_safety_knowledge` is plain text** because the spec gives no list of choices. The application form (A-03) owns the choices and validates them.

## Consequences

- Any new view over `users` is a privacy decision: check its columns against spec section 7.
- A new table must repeat the revoke and grant pattern, or it inherits Supabase's broad defaults.
- Later features that need more of a member (for example shared fields within a working group) add their own view or function rather than widening `members`.
- Moving config values, level names or the status list later means a migration, not a code change alone.
