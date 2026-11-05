# ADR-0011: Application review and transactional email

Status: accepted (A-04)

## Context

An admin approves or rejects each application (spec section 4). Approval must create the Supabase Auth user (ADR-0010: magic links never create users) and the member row, and tell the applicant. Spec section 9 and ADR-0006 keep email integration out of v1 except for these transactional messages.

## Decision

- **Decisions run server-side with the service role, after `requireAdmin`.** Creating an Auth user and writing the audit log are things no member may do. The review page itself reads applications through the row-level-security client, so only an admin's policies show them.
- **Idempotent by claiming the row.** Approval first ensures the Auth user and the member row exist (an existing Auth user is reused, an existing member row is accepted), then flips the application from `pending` with a conditional update. Only the request that flips it writes the audit entry and sends the email, so a double click or a second admin changes nothing. A half-finished approval can be retried. Approving a rejected application, or the reverse, is refused as a conflict.
- **A higher starting level needs a reason**, stored in the audit entry (`details.reason`) next to the level and the new user id. The audit log holds ids and that reason only.
- **The sign-in email links to `/login`**, not to a one-time link. The person asks for a magic link there with the same address. This avoids a second sign-in path and token handling in email, and the PKCE rule from ADR-0010 still applies.
- **Email is a thin Resend wrapper over its HTTP API** (`lib/email`, `server-only`, no new dependency). The transport is a function that tests replace with `setEmailTransport`. Errors carry the HTTP status only. A failed email never undoes a decision: the admin sees "decision saved, email not sent".
- **Languages:** applicant emails Italian, admin emails English. The admin notification (new application) names no applicant and links to the review page.
- **Pending badge:** the header shows an admin link with the number of pending applications, read in a `<Suspense>` boundary so the rest of the shell stays prerenderable.
- Configuration: `RESEND_API_KEY` and `EMAIL_FROM` stay optional in `lib/env.ts` so builds and CI work without them; without them no email is sent and the admin is told.

## Consequences

- Emails to applicants are only as reliable as Resend and the sender domain; the maintainer must verify the sending domain before launch (F-09).
- The audit entry is written after the state change; if it fails the action throws and a retry finds the application already decided, so the entry would be missing. Acceptable at this scale; revisit with a database function if the audit log must be exact.
- Listing users to find an existing Auth user is a paginated scan, fine for a few hundred volunteers.
