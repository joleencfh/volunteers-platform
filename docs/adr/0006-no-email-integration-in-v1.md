# ADR-0006: No email integration in v1

Status: accepted (F-08)

## Context

Volunteers contact targets (parliamentarians, organisations) by email, and it would be convenient if the platform recorded those exchanges. Reading or sending mail on a user's behalf needs OAuth access to personal mailboxes, which adds security and privacy risk, legal review and a lot of build effort for a volunteer-run project.

## Decision

- v1 has no integration with volunteers' mailboxes. The interaction log on a target is entered manually: date, direction, channel, summary, link to the related activity, and who logged it.
- Resend is used only for the platform's own transactional emails (sign-in links, application decisions, assignments).
- The contact email lives in the admin-only table (ADR-0004), never in the log.

## Consequences

- No access to anyone's mailbox, which keeps the privacy notice and the processor list short.
- Logging is manual work for volunteers; the form should be quick to fill in.
- An integration can be added later behind the same log model if real use shows the need.
