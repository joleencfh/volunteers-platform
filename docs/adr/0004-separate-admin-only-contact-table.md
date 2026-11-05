# ADR-0004: Separate admin-only table for target contact details

Status: accepted (F-08)

## Context

Targets (parliamentarians, organisations) have email addresses, phone numbers and contact persons. Volunteers need to see and log interactions with a target without seeing how to reach them directly, and contact details are personal data that must be protected and audited. The repository is public, so none of it may appear in code or fixtures either.

## Decision

- Contact details live in their own table, with row-level security limited to admins. They are never columns on the target table.
- Lists, exports and pages shown to non-admins never join this table.
- Admin views and edits of contact details are recorded in the audit log.
- A later version may let the current working-group lead see them; that is a new policy, not a schema change.

## Consequences

- The most sensitive data has a small, easy-to-audit surface, and a policy mistake on the target table cannot leak it.
- Imports split each row in two: the target, and its contact details.
- Admin screens that show a target with its contact details need two reads.
