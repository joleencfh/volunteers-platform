# ADR-0003: Extension fields as JSON validated in code

Status: accepted (F-08)

## Context

Every working group, activity and task has the same core fields, but activities and targets also have a type, and each type needs its own extra fields (for example the Lobbying activity types). New types must not need a database migration, and an admin UI for custom fields is out of scope.

## Decision

- Core fields are ordinary columns. Type-specific fields live in a `details` JSON (`jsonb`) column on the row.
- Each type and its `details` schema is defined in code, with a Zod schema, and validated on the server before every write.
- The type itself is a column, so queries and policies can filter by it without reading the JSON.
- Anything that policies or promotion rules depend on is never stored in `details`.

## Consequences

- Adding a type is a code change and a deploy, with no migration.
- The database does not enforce the shape of `details`; code is the only guard, so schemas need tests and changes to a schema need to keep old rows readable.
- Imports (for example the existing Notion data) can keep unmapped columns in `details` so nothing is lost.
- Queries on fields inside `details` are slower and less convenient; promote a field to a column if it needs filtering often.
