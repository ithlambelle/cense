# Backend integration handoff

The API routes live under `/api/v1`. Student routes use the Supabase session
cookie and reject requests without a verified user. The browser must send
same-origin credentials on API requests. Responses with student data are not
cached.

## Sign-in contract for the screen owner

1. Send `POST /api/v1/auth/email` with `{ "email": "..." }` to request a code.
2. Send `POST /api/v1/auth/email/verify` with `{ "email": "...", "code": "123456" }`.
   A wrong or expired code returns `401` with code `invalid_code`; the user can
   request a new code through step 1.
3. The Google button navigates to `/api/v1/auth/google?next=/quiz`. The `next`
   value must be an app-relative path. Supabase returns through
   `/api/v1/auth/callback` and the API redirects to that path. A cancelled or
   failed flow returns to `/sign-in?error=cancelled` or
   `/sign-in?error=callback`.
4. `GET /api/v1/me` returns `{ id, email }` for a valid session and `401`
   otherwise. `POST /api/v1/auth/logout` ends the session.

The Supabase project needs Google OAuth enabled, the app origin and callback
URL allowed in Auth redirect settings, and an email template using
`{{ .Token }}` to send a six-digit code rather than a magic link. Set
`NEXT_PUBLIC_SUPABASE_URL` and either `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
or the existing `NEXT_PUBLIC_SUPABASE_ANON_KEY` in local and Vercel settings.
Only the dev project should be used by local and preview environments.

## Current API readiness

- Public cards, quiz drafts, applications, and issuer clicks have route
  contracts and implementations. Student tables must match
  [`api/data-contract.md`](../api/data-contract.md) before persistence can be
  verified.
- The card catalog intentionally returns `503 catalog_unavailable` until the
  approved dataset and issuer links are supplied. It does not return fake
  matches or links.
- The latest saved recommendation can be read. A recommendation write route is
  withheld until the server rules engine
  and approved catalog are ready. The client must never submit its own match.
- A full deployed sign-in test requires the screen owner's unstyled UI, dev
  Supabase configuration, and an accessible Vercel deployment.

The source schemas generate [`api/openapi.yaml`](../api/openapi.yaml) with
`cd web && npm run openapi:generate`. The spec generates
[`api/openapi.d.ts`](../api/openapi.d.ts) with `npm run openapi:types` for typed
API consumers. CI checks that both generated files are committed.
