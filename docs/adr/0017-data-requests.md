# ADR-0017: Data requests

Status: accepted (P-03)

## Context

Spec section 9 ("Privacy and GDPR, Rights") says admins export a person's data and delete or anonymise it on request. Members need a way to ask, and admins need to see the asks and know when one is done. The spec does not list a table or a notification for this.

## Decision

- A table `data_requests` (`user_id`, `kind` export or deletion, `status` open or done, `created_at`, `handled_at`, `handled_by`) with row-level security. An active member may insert a row only for themselves, only as `open`, and read only their own rows. Admins read all rows and update them to mark a request handled. Column grants limit a member to setting `user_id` and `kind`, and an update to `status`, `handled_at` and `handled_by`.
- A partial unique index allows one open request per member and kind. The `requestData` action treats the unique violation as success: a second click is a quiet no-op, the member sees the same "recorded" message and the admins are not mailed twice.
- The action writes through the RLS client, then emails every active admin (English, plain text: the kind, the member's display name and a link to `/admin/data-requests`, never an email address or real name). The row is saved even if the email cannot be sent, and the member is told only that the request was recorded. A small in-memory rate limit (5 per hour per member) is a brake, as in the application form.
- `/admin/data-requests` is a read-only list with a "mark as handled" action. It runs `requireAdmin()` first, updates through the RLS client and writes the audit entry `data_request.handled` (ids and kind only) with the service-role client, which is used for the audit write alone.
- No export or deletion tooling yet: an admin acts on the request by hand until story D-03.

## Consequences

- Members see only their own requests; there is no way to cancel one (an admin marks it handled).
- Marking a request handled does not itself export or delete anything.
- Deleting a member removes their requests with them (`on delete cascade`); the audit entry keeps the request id and kind.

## Proposed spec edit

Not applied: `docs/spec.md` is for the maintainer to edit.

- Section 9, Notifications: add "data request received (to admins)".
- Section 10, table list: add `data_requests`.
