# Architecture snapshots

A dated snapshot of how the system is built, written at the end of each milestone (M0 foundation, M1 sign-in and application, and so on). A snapshot describes the system as it is on that date; it is not edited later. To record a change, add a new snapshot.

Name files `YYYY-MM-DD-<milestone>.md`. Each one covers:

- **Overview:** what the system does now, in a few sentences.
- **Components:** routes and layers, the Supabase clients, `lib/` modules, email, scheduled jobs.
- **Data:** tables and their row-level security policies at a glance, with the admin-only fields.
- **Environments:** local, staging, production, and what runs where (CI, Vercel, Supabase).
- **Decisions:** the ADRs in force (see [`../adr/`](../adr/README.md)).
- **Known gaps:** what is not built or not yet verified.

| Snapshot                                       | Milestone          |
| ---------------------------------------------- | ------------------ |
| [2026-11-10](2026-11-10-m2-onboarding-live.md) | M2 onboarding live |
