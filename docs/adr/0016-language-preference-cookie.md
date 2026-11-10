# ADR-0016: Language preference through a cookie

Status: accepted (P-03)

## Context

Members choose their interface language (spec section 9). The choice must be stored with the account, but the language is picked in `proxy.ts`, which rewrites every URL to `/en/...` or `/it/...` on every request (ADR-0007). Reading `users.locale` there would add a database round trip to each page request, including prefetches.

## Decision

- `users.locale` stays the source of truth. Members change it only through the security-definer function `set_own_locale(text)` (no update policy on `users`, ADR-0009).
- A cookie `pauseai_locale` mirrors it: httpOnly, `SameSite=Lax`, `Secure` in production, path `/`, one year. It holds no personal data; only the proxy reads it. The auth callback sets it from `users.locale` after a successful sign-in, the settings action sets it on save, and sign-out clears it.
- `proxy.ts` passes the validated cookie value to `localeForPath` as the preferred language. Legal routes (`/apply`, `/privacy`) stay Italian whatever the cookie says.

## Consequences

- No database call for the language on page requests.
- The cookie is a preference, not an authority: nothing is authorised by it, and an invalid or missing value means English. A stale cookie (for example the language was changed on another device) is corrected at the next sign-in or save.
- A member who is signed in on a device without the cookie sees English until the next sign-in or save on that device.
- A new language means one more value in `LOCALES`, the check on `users.locale`, the function's allowed values and a message file.
