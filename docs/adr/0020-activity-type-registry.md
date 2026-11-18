# ADR-0020: Activity type registry

Status: accepted (T-02)

## Context

ADR-0003 says type-specific fields live in a `details` JSON column validated in code, and ADR-0019 stores `activities.type` as plain text. The spec (sections 2 and 5) lists four Lobbying types with their own fields and requires that adding a type needs no database migration.

## Decision

- `lib/domain/activity-types/` has one file per type (`general`, `campaign`, `call-with-target`, `meeting`, `content-creation`) and an `index.ts` registry. Adding a type means adding a file, listing it in `DEFINITIONS` and adding its labels to both message files.
- A definition holds the stored `key`, i18n keys (`labelKey`, `descriptionKey`, relative to the `activityTypes` namespace), a `shape` (one Zod schema per `details` key), `detailsSchema` (the strict object built from the shape, so unknown keys are refused), ordered `fields` for form rendering (`name`, `labelKey`, `input` kind, `required`, `options`, `maxLength`, `itemKind`) and `summarize(details)` for one-line summaries.
- The registry exports `ACTIVITY_TYPES`, `getActivityType`, `selectableTypes` (the create form's picker; General is not selectable because the database creates it), `isActivityTypeKey` and `parseDetailsLoosely`. `createRegistry` builds a registry from definitions so a test can register a fifth type.
- Every URL is https only (the rule of `isValidLinkUrl`), free text is capped at 2000 characters, lists at 50 items. Date-times are stored as ISO instants; forms send local time in the app time zone and convert with `localToInstant`.
- `parseDetailsLoosely(type, details)` returns the known, valid fields of a stored row and never throws, so old rows stay readable after a schema change. Pages that display stored details use it; writes use the strict schema.
- Target fields (Campaign "targets contacted", Call "targets") are free-text names for now. G-06 (M4) turns them into links to the targets table; because `details` is JSON, that needs no migration, only a new schema version that old rows are read through the loose parser.
- A type is never removed or renamed once rows use it; it is marked `selectable: false` instead.

## Consequences

- A new type is a code change and a deploy; the database never sees its shape, so schema changes must keep old rows readable (the loose parser and tests cover this).
- The form is rendered from `fields`, so there is one definition of a type, not a schema duplicated on the client.
- Volunteers participating in a campaign are derived from the activity's participants and have no field.
