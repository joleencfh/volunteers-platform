## What and why

<!-- Story ID (for example A-02), what changed, and why. -->

## Checklist

- [ ] Acceptance criteria met and checked by hand (list any that could not be tested automatically)
- [ ] Tests added: unit, database/RLS and end-to-end as relevant; a bug fix starts with a failing test
- [ ] New or changed tables have row-level security and policies, with an allowed and a denied test
- [ ] Server actions authorise first (`lib/authz`) and validate input with Zod
- [ ] No personal data, real contact details, keys or personal paths in code, fixtures, logs or this description (the repository is public)
- [ ] No literal UI text in components; strings are in `messages/*.json`
- [ ] Migration, generated types and seed updated if the schema changed
- [ ] ADR added or updated if a lasting decision was taken
- [ ] `bun run check` passes locally

## Notes for the reviewer

<!-- Anything risky, anything not done, anything that needs applying to staging. -->
