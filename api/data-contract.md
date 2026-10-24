# MVP1 backend data contract

This is the handoff between the API branch and the database branch. SQL migrations,
row level security policies, and Supabase project setup belong to the database
owner. The API uses the student's Supabase Auth UUID as `student_id` and always
queries as that student, never with a service role key.

## Required tables

| Table | Required columns | API behavior |
| --- | --- | --- |
| `profiles` | `student_id` UUID primary key, `time_zone` text, `updates_seen_at` timestamp nullable, `reminders_unsubscribed_at` timestamp nullable, `remind_statement_closing`, `remind_payment_due`, `remind_check_autopay` booleans (default true), `created_at`, `updated_at` | A profile belongs to `auth.users.id`. Use an IANA time zone for reminder scheduling; an unknown name falls back to America/New_York. Unsubscribing stops every reminder email; each kind can also be turned off. |
| `quiz_drafts` | `student_id` UUID primary key, `answers` JSONB, `updated_at` | One resumable draft per student. Partial answers are allowed. |
| `recommendations` | `id` UUID primary key, `student_id` UUID, `card_id` text (null when no card fits, with `fit_tier` not_yet), `fit_tier` text, `reason` text, `answer_snapshot` JSONB, `result_snapshot` JSONB, `created_at` | Store the exact server-generated result and inputs shown to the student. Never let the client write a recommendation directly. |
| `issuer_clicks` | `id` UUID primary key, `student_id` UUID, `card_id` text, `kind` text, `clicked_at` | Append one row for each preapproval or apply click. A click is not an application. |
| `card_applications` | `id` UUID primary key, `student_id` UUID, `card_id` text nullable, `card_name` text nullable, `source` text, `status` text, `credit_limit_cents` bigint nullable, `applied_at` timestamp nullable, `rejected_at`, `denial_reason` text nullable, `denial_reason_note` text nullable (at most 200 characters, never sent to analytics), `autopay_status` text (`on`, `off`, `unknown`), `autopay_updated_at`, `statement_closing_day` and `payment_due_day` (1 to 31) nullable, `card_set_up_at` (server-set), `updated_at` timestamp, `created_at` | A student may have several card records. Status is `applied`, `approved`, or `rejected`. Leaving `rejected` clears the denial reason and note. |
| `reminders` | `id` UUID primary key, `student_id` UUID, `card_application_id` UUID, `kind` text (`statement_closing`, `payment_due`, `check_autopay`, `reapply`), `occurrence` date, `due_at`, `claimed_at`, `attempts`, `sent_at`, `acted_at`, `created_at` | One row per reminder email, unique on card, kind and occurrence. The database schedules them (`refresh_reminders`) from the card's days and the student's time zone; students only read them, set `acted_at` on a sent one, and pick the day of the reapply reminder through `create_reapply_reminder`. Only the send job (service role) claims and marks them sent. |
| `plan_steps` | `student_id` UUID, `card_application_id` UUID, `plan` text (`first_month`, `denial`), `step` text, `completed_at`; primary key (card, plan, step) | One row per finished plan step; undo deletes it. first_month steps are `planned_purchase`, `payment_reminder` (autopay reads `autopay_status`); denial steps are `read_letter`, `check_reports`, `pause_applications`, `build_credit`, `reapply`. A first_month step needs an approved card, a denial step a rejected one. |

`created_at`, `updated_at`, `clicked_at`, and `applied_at` are UTC timestamptz
values. IDs are random UUIDs. The database should cascade student-owned records
on account deletion. The database prevents duplicate active records for the same
identified card while allowing a rejected card to be applied for again. Only an
approved card may have a credit limit.

Card setup (closing day, due day, credit limit, autopay) is saved through
`PATCH /api/v1/applications/{id}`. Saving the days, the status or autopay
re-plans that card's reminders.

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
| `POST /api/v1/auth/password/signup`, `POST /api/v1/auth/password/signin` | Optional password account creation and sign-in. Sign-up gives the same answer whether or not the email has an account; an existing account is emailed a sign-in code instead. |
| `POST /api/v1/auth/password/reset`, `POST /api/v1/auth/password/reset/confirm` | Request a reset email and set a password with an authenticated session. |
| `GET /api/v1/auth/google`, `GET /api/v1/auth/callback`, `POST /api/v1/auth/logout` | Google sign-in, PKCE callback, and logout. |
| `GET /api/v1/me` | Verify the session and return the student ID and email. |
| `GET /api/v1/cards`, `GET /api/v1/cards/{id}` | Public curated card catalog. Card facts and issuer links live in typed repository files. |
| `GET /api/v1/quiz`, `PUT /api/v1/quiz` | Read and save a resumable partial quiz. |
| `GET /api/v1/recommendations/latest`, `POST /api/v1/recommendations` | Read or compute and save the server-generated result. |
| `POST /api/v1/issuer-clicks` | Record a click on an issuer preapproval or apply link. |
| `GET /api/v1/applications`, `POST /api/v1/applications` | List and add tracked cards (the short `Application` shape). |
| `GET /api/v1/applications/{id}`, `PATCH /api/v1/applications/{id}` | One card with its denial reason and note, autopay and closing and due days (`ApplicationDetail`). PATCH takes any of those fields plus status and credit limit; a limit and the days need an approved card, a reason and note a rejected one. |
| `GET /api/v1/applications/{id}/plans/{plan}`, `PUT` and `DELETE /api/v1/applications/{id}/plans/{plan}/steps/{step}` | Read, mark done and undo first-month and denial plan steps. |
| `GET /api/v1/reminders`, `POST /api/v1/reminders` | List the student's reminders (sent and upcoming, with `remindOn` on their calendar), and set the reapply reminder for a denied application, tomorrow to a year out, through `create_reapply_reminder`. |
| `POST /api/v1/reminders/{id}/acted` | Mark a sent reminder acted on ("I paid it down"). The first time is kept. |
| `GET /api/v1/me/reminder-settings`, `PATCH /api/v1/me/reminder-settings` | Read and change `emailsOn` and the three per-kind toggles. |

The API route owner will implement a route only when its underlying dataset or
table is available. No route will claim a successful recommendation based on an
empty catalog or on client-authored ranking.
