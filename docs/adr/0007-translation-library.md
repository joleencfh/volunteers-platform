# ADR-0007: Translation library and locale routing

Status: accepted (F-05)

## Context

The app is English, except the application form, consent text, pending and rejected screens and the privacy notice, which are Italian from v1 (CLAUDE.md rule 1). Both languages need typed keys, ICU messages (plurals) and locale-aware dates and numbers. The project runs Next.js 16.4 with Cache Components, where anything that reads cookies or headers at request time must sit behind `<Suspense>`. Most visitors to the Italian screens are not signed in, so the locale cannot come from a user preference.

## Decision

- **Library: `use-intl`**, the framework-independent core of next-intl. We do not use next-intl's routing, middleware or request config: the locale is decided by the URL path alone, and those parts add a second routing layer to maintain.
- **Locale rule** lives in `lib/domain/locale.ts` (`localeForPath`): `/apply`, `/apply/*` and `/privacy` are Italian, everything else English. An optional `preferred` argument is the seam for a future user language preference; it never overrides the legal routes.
- **Routing:** every page sits under `app/[lang]`, and `proxy.ts` rewrites (never redirects) each request to `/<locale>/<path>`. URLs stay `/apply`, `/privacy`; `/en/...` and `/it/...` typed by hand are 404 because the proxy prefixes them again. `lang` is a root param, read with `next/root-params`, so the locale needs no cookies or headers and pages can still prerender under Cache Components. `generateStaticParams` lists both locales, as Cache Components requires.
- **Messages:** `messages/en.json` is the complete catalogue and defines the key types. `messages/it.json` holds only translated keys; `getMessages('it')` overlays it on English, so a missing Italian key falls back to English. A test fails if Italian has a key English lacks.
- **Helpers:** `lib/i18n/server.ts` (`getTranslations`, `getFormatter`, `getLocale`) for server components; `lib/i18n/client.tsx` (`I18nProvider`, `useTranslations`, `useFormatter`) for client components.
- **Time zone:** all dates are formatted in `Europe/Rome`, on server and client, so output matches and times are the volunteers' local times.
- **No literal UI text:** `tests/unit/no-literal-ui-text.test.ts` parses every `.tsx` under `app/` and `components/` and fails on JSX text, `{'string'}` children and string `alt`, `title`, `placeholder`, `label` and `aria-*` attributes. A test rather than an ESLint plugin, to avoid a dependency for one rule.

## Consequences

- Root params are not available in Server Actions or Route Handlers. Code there must pass the locale explicitly: `getTranslations(namespace, locale)`. Emails (Resend) do the same.
- The root layout gives client components the whole catalogue. Fine while it is small; pass only the namespaces client components use if it grows.
- Adding a language means: add it to `LOCALES`, add `messages/<locale>.json`, and decide how a path or preference selects it.
- `app/[lang]` also builds `/en/apply` and `/it/` pages that nothing can reach. Harmless, a little extra build output.
- A signed-in user's language preference will need session access; that must happen behind `<Suspense>`, so it will probably be applied in the app shell layout rather than the proxy.
