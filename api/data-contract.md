# MVP1 backend data contract

This is the handoff between the API branch and the database branch. SQL migrations,
row level security policies, and Supabase project setup belong to the database
owner. The API uses the student's Supabase Auth UUID as `student_id` and always
queries as that student, never with a service role key.

## Required tables

| Table | Required columns | API behavior |
| --- | --- | --- |
| `profiles` | `student_id` UUID primary key, `time_zone` text, `created_at`, `updated_at` | A profile belongs to `auth.users.id`. Use an IANA time zone for reminder scheduling. |
| `quiz_drafts` | `student_id` UUID primary key, `answers` JSONB, `updated_at` | One resumable draft per student. Partial answers are allowed. |
| `recommendations` | `id` UUID primary key, `student_id` UUID, `card_id` text (null when no card fits, with `fit_tier` not_yet), `fit_tier` text, `reason` text, `answer_snapshot` JSONB, `result_snapshot` JSONB, `created_at` | Store the exact server-generated result and inputs shown to the student. Never let the client write a recommendation directly. |
| `issuer_clicks` | `id` UUID primary key, `student_id` UUID, `card_id` text, `kind` text, `clicked_at` | Append one row for each preapproval or apply click. A click is not an application. |
| `card_applications` | `id` UUID primary key, `student_id` UUID, `card_id` text nullable, `card_name` text nullable, `source` text, `status` text, `credit_limit_cents` bigint nullable, `applied_at` timestamp nullable, `updated_at` timestamp, `created_at` | A student may have several card records. Status is `applied`, `approved`, or `rejected`. |

`created_at`, `updated_at`, `clicked_at`, and `applied_at` are UTC timestamptz
values. IDs are random UUIDs. The database should cascade student-owned records
on account deletion. The database prevents duplicate active records for the same
identified card while allowing a rejected card to be applied for again. Only an
approved card may have a credit limit.

The second migration includes card setup columns. Card setup and reminder APIs
are not required for this first deployed vertical slice.

Quiz drafts use the fit-rules v1.2 answers: `under21`, `incomeBand`, `student`,
`standing` (including `not_sure`), `recentDenial`, and `canDeposit`, plus
monthly spending and goal. The draft is partial until the student finishes the
quiz. Card records carry the published eligibility fields, the issuer's
conditions, a `catalogRole` (only `recommend` cards are tiered; `explore` cards
are for browsing) and `eligibilityEvidence`, which gives each fact a basis
(`issuer`, `silent`, `estimate` or `decision`), its source URLs and a
verification date. The catalog holds 53 cards read from issuer pages, and
review sites for estimates, on 2026-10-15; 13 are `recommend`.

## Authorization and response rules

- Enable row level security on every student table. Grant access only where its
  owner column equals `auth.uid()` for the current signed-in student.
- Every protected route verifies the Supabase user before querying. Return
  `401` for an absent or invalid session and `404` for another user's record.
- The API never uses the service role key in student routes. Scheduled jobs may
  use it later and must be isolated from request handlers.
- Money is integer cents. Timestamps in API responses are UTC ISO 8601 strings.
- Errors use `{ "error": { "code": string, "message": string, "details"?: unknown } }`.
- Responses containing student data send `Cache-Control: no-store`.

## API handoff

| Endpoint | Role |
| --- | --- |
| `POST /api/v1/auth/email`, `POST /api/v1/auth/email/verify` | Send and verify a six-digit email code. |
| `POST /api/v1/auth/password/signup`, `POST /api/v1/auth/password/signin` | Optional password account creation and sign-in. Sign-up answers 409 `account_exists` when the email already has an account. |
| `POST /api/v1/auth/password/reset`, `POST /api/v1/auth/password/reset/confirm` | Request a reset email and set a password with an authenticated session. |
| `GET /api/v1/auth/google`, `GET /api/v1/auth/callback`, `POST /api/v1/auth/logout` | Google sign-in, PKCE callback, and logout. |
| `GET /api/v1/me` | Verify the session and return the student ID and email. |
| `GET /api/v1/cards`, `GET /api/v1/cards/{id}` | Public curated card catalog. Card facts and issuer links live in typed repository files. |
| `GET /api/v1/quiz`, `PUT /api/v1/quiz` | Read and save a resumable partial quiz. |
| `GET /api/v1/recommendations/latest`, `POST /api/v1/recommendations` | Read or compute and save the server-generated result. |
| `POST /api/v1/issuer-clicks` | Record a click on an issuer preapproval or apply link. |
| `GET /api/v1/applications`, `POST /api/v1/applications`, `PATCH /api/v1/applications/{id}` | Read and update self-reported status. |

The API route owner will implement a route only when its underlying dataset or
table is available. No route will claim a successful recommendation based on an
empty catalog or on client-authored ranking.
