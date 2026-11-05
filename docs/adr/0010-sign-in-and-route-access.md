# ADR-0010: Sign-in and route access

Status: accepted (A-02)

## Context

Sign-in is password-less (magic link, Google) and limited to admin-approved people (spec section 4). F-05 put every page under `app/[lang]` and made `proxy.ts` rewrite URLs to add the locale. Sign-in needs the same proxy to refresh the session and guard routes, and its callback is a route handler, which cannot live in the locale tree.

## Decision

- **Membership is decided by email.** After the magic-link or Google code exchange, `lib/authz/member.ts` reads the person's own row in `users` through the row-level-security client and admits them only if the row is `active`, its email equals the verified identity email (case-insensitive) and, for Google, the account reports the email as verified. Anyone else is signed out in the callback and sent to `/login?error=signin`, the one message used for every refusal. The admin flag is read from the database row, never from the token.
- **Magic links never create users** (`shouldCreateUser: false`) and the server action answers "sent" whatever Supabase says, so the response does not reveal who is a member. A-04 must therefore create the Supabase auth user at approval. Google sign-in may create a stray auth user for a stranger; it gets no `users` row and is signed out at once.
- **Routes.** Public: `/`, `/login`, `/privacy`, `/apply*`, `/auth/*` (and `/dev/*` outside production). Everything else redirects a logged-out visitor to `/login`. `/auth/*` are route handlers in `app/auth`, outside `app/[lang]`; the proxy refreshes the session for them but does not rewrite them. `/login` is an English route. A signed-in person opening `/login` is sent home, except when the URL carries `error`.
- **Redirects.** The magic-link redirect origin must be on an allowlist: `NEXT_PUBLIC_SITE_URL` plus, outside production, the local dev origins. The `next` parameter of the callback accepts only a plain same-site path and never an auth route. The Google redirect is limited by the allowlist in the Supabase project (`supabase/config.toml` locally).
- **Rate limits** use `lib/rate-limit.ts` (per IP and per email), which is per server instance and in memory.
- **Helpers.** `requireUser` redirects to `/login`; `requireAdmin` answers a non-admin with a 404. Components calling them sit behind `<Suspense>` (Cache Components).

## Consequences

- The magic link uses PKCE: it must be opened in the browser that asked for it. Opening it on another device shows the generic refusal. Revisit with a token-hash email template if volunteers hit this.
- Each deployment must set `NEXT_PUBLIC_SITE_URL` and register its callback URL (and enable the Google provider) in the Supabase project; F-09 covers this.
- Sign-in timing differs slightly for members (an email is sent); the rate limits bound enumeration attempts.
