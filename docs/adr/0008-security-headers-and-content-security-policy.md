# ADR-0008: Security headers and Content-Security-Policy

Status: accepted (F-07)

## Context

The app shows volunteers' personal data to admins, so a script injection (XSS) or clickjacking must be hard. We want a Content-Security-Policy (CSP), and the other standard headers, on every route. The project runs Next.js 16.4 with Cache Components and Partial Prefetching, so the pages are meant to be prerendered with a static shell.

Next.js documents two ways to a strict CSP. A **nonce** per request needs every page to be rendered dynamically; the guide states that Partial Prerendering is incompatible with it because the static shell cannot know the nonce. **Subresource Integrity** hashes keep static rendering but are experimental.

## Decision

- A **static CSP** set from `next.config.ts` `headers()` on every path, built by `lib/security-headers.ts`. Scripts and styles allow `'self'` and `'unsafe-inline'` (Next.js emits inline hydration scripts and styles). No nonce.
- The policy still forbids what matters most: `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, and `connect-src` limited to the site and the Supabase project (https and wss). Production adds `upgrade-insecure-requests`; only development allows `'unsafe-eval'` and a localhost websocket.
- Also on every route: `Strict-Transport-Security` (two years, includeSubDomains), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, and a `Permissions-Policy` that disables camera, microphone, geolocation, payment and USB.
- **Environment variables** are declared in `.env.schema` and validated with Zod in `lib/env.ts` when the app builds or starts (`next.config.ts`). The error names the variables, never their values. Builds that cannot have secrets (the CI static-checks job) set `SKIP_ENV_VALIDATION=1`. `next typegen` and `next dev` are not validated, so typecheck works without secrets.
- Client components cannot import server-only modules: the local ESLint rule `local/no-server-only-in-client` (`eslint-rules/`) fails on `server-only`, the service-role client, email and audit imports in a file with `'use client'`. A unit test runs the rule against a deliberate violation.
- `lib/rate-limit.ts` is an in-memory sliding-window limiter. It is per serverless instance, so it is a brake, not a boundary.

## Consequences

- Inline script injection is not blocked by the CSP; defence against XSS rests on React's escaping, never using `dangerouslySetInnerHTML` with user input, and Zod validation. Revisit with a nonce-based CSP, or SRI hashes once stable, if the app moves off Cache Components or the risk grows.
- Any new external origin (analytics, fonts from a CDN, an embed) must be added to `lib/security-headers.ts` deliberately; this is the intent.
- Supabase Auth redirects to Google and back are top-level navigations, so they need no CSP entry. If the app ever embeds a third-party frame, `frame-src` is needed.
- The rate limiter's counts reset on every cold start and differ per instance.
