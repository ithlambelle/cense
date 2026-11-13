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
| `card_applications` | `id` UUID primary key, `student_id` UUID, `card_id` text nullable, `card_name` text nullable, `source` text, `status` text, `credit_limit_cents` bigint nullable, `applied_at` timestamp nullable, `rejected_at`, `denial_reason` text nullable, `denial_reason_note` text nullable (at most 200 characters, never sent to analytics), `autopay_status` text (`on`, `off`, `unknown`), `autopay_updated_at`, `autopay_payment_type` text nullable (`statement_balance`, `minimum`, `fixed_amount`; only while autopay is `on`, what the student said, never an amount), `spend_limit_cents` bigint nullable (the monthly spend limit the student saved; above zero, at most `credit_limit_cents` when one is saved, approved cards only), `statement_closing_day` and `payment_due_day` (1 to 31) nullable, `card_set_up_at` (server-set), `updated_at` timestamp, `created_at` | A student may have several card records. Status is `applied`, `approved`, or `rejected`. Leaving `rejected` clears the denial reason and note. Leaving `approved`, or a credit limit below the spend limit, clears the spend limit, and the PATCH that clears it also deletes the card's `spend_limit` plan step. |
| `reminders` | `id` UUID primary key, `student_id` UUID, `card_application_id` UUID, `kind` text (`statement_closing`, `payment_due`, `check_autopay`, `reapply`), `occurrence` date, `due_at`, `claimed_at`, `attempts`, `attempted_at` (the last send attempt), `sent_at`, `acted_at`, `read_at`, `snoozed_until`, `dismissed_at`, `follow_up_at` (in-app state, empty until sent; `follow_up_at` only for `statement_closing`), `created_at` | One row per reminder email, unique on card, kind and occurrence. Once sent it is also an in-app card in Updates: students mark it read, snooze it or dismiss it for its billing cycle only through `snooze_reminder`, `dismiss_reminder` and `mark_reminders_read`, which check it is theirs and sent; the cron job sets `follow_up_at` once through `raise_reminder_follow_ups`. The database schedules them (`refresh_reminders`) from the card's days and the student's time zone; students only read them, set `acted_at` on a sent one, and pick the day of the reapply reminder through `create_reapply_reminder`. Only the send job (service role) claims and marks them sent, through `claim_due_reminders`, `mark_reminder_sent` and `release_reminder_claim`. |
| `plan_steps` | `student_id` UUID, `card_application_id` UUID, `plan` text (`first_month`, `denial`), `step` text, `completed_at`; primary key (card, plan, step) | One row per finished plan step; undo deletes it. first_month steps are `planned_purchase` (kept for saved rows), `spend_limit`, `payment_reminder` (autopay reads `autopay_status`); denial steps are `read_letter`, `check_reports`, `pause_applications`, `build_credit`, `reapply`. A first_month step needs an approved card, a denial step a rejected one. |
| `bank_links` | `student_id` UUID primary key, `institution_name`, `status` (`active`, `reconnect_needed`, `relink_needed`), `linked_at`, `refreshed_at` nullable, `set_aside_cents` bigint, `answered_at` nullable | One sandbox bank per student (US-12). Students read it and change only `set_aside_cents` and `answered_at` (through `save_safe_to_spend_answers`). Created by `save_bank_link`, kept current by `save_bank_balances` and `mark_bank_link_status`, deleted by `delete_bank_link`, which cascades to the two tables below. Disconnect removes the Item at Plaid first (`removeBankLinksForStudent`). Account deletion queues its encrypted token atomically with auth deletion, so a Plaid outage never holds the account open. |
| `bank_balances` | `student_id` UUID, `position`, `name`, `mask` (up to 4 letters or digits) nullable, `kind` (`cash`, `card`, `other`), `balance_cents` bigint; primary key (student, position) | The accounts read at the last refresh, replaced each time. Loans and investments are never stored. Students read them only. |
| `bill_coverage` | `student_id` UUID, `bill` (`rent`, `phone`, `tuition`, `groceries`, `car`), `covered_by` (`me`, `family`, `split`, `none`), `monthly_cents` (only for me and split); primary key (student, bill) | The student's own answers, read and written by them. |
| `plaid.transactions` | `student_id` UUID, `transaction_id`, `account_id`, `posted_on` date, `amount_cents` bigint (Plaid's sign: positive is money out), `pending`, `category`, `category_detailed`, `merchant_name` (up to 100 characters); primary key (student, transaction) | US-14. In the `plaid` schema, no grants to students. Only the last 180 days are kept: older rows are never saved and `purge_old_plaid_transactions()` deletes them daily from the reminders cron (service role only). At most 10,000 rows per student. Written only by `apply_plaid_transactions_sync(item, starting cursor, …)`, which saves nothing and answers false unless the student's linked Item and saved cursor are still the ones the sync started from (`20261113000000_plaid_transactions_item_binding.sql`); students read only monthly totals through `spending_by_category` and `income_by_month`. Deleted with the Item. |
| `plaid.items` | `student_id` UUID primary key, `item_id` unique, `token_ciphertext`, `created_at` | In the `plaid` schema, which the Data API does not serve; no grants to students. The access token is stored only as AES-256-GCM ciphertext made by the app (`PLAID_TOKEN_KEY`). `bank_link_secret()` returns the caller's own ciphertext to the server routes, which decrypt it; it never reaches the browser. |
| `plaid.account_cleanup` | `id`, `student_id`, `item_id`, `token_ciphertext`, `created_at`, `retry_at`, `claim_id`, `attempts` | Private queue populated by the BEFORE DELETE trigger on `auth.users`. Only the encrypted token and its student/item encryption binding survive account deletion; no auth foreign key, bank details or transactions. No direct access, including service role. Service-only claim/finish functions lease at most five rows for 15 minutes; failed work retries after a day, with no automatic abandonment. Successful or already-completed Plaid removal deletes the queue row. |
| `penny_asks` | `id` bigint identity, `student_id` UUID, `asked_at` | One row per typed question sent to Ask Penny's model, never the question. Students cannot read or write it; `claim_penny_ask()` checks the limits (20 per student per calendar day in their time zone, 300 across all students per day in America/New_York), records the question and returns `ok`, `student_limit` or `daily_limit`. Rows older than two days are deleted. |

`created_at`, `updated_at`, `clicked_at`, and `applied_at` are UTC timestamptz
values. IDs are random UUIDs. The database should cascade student-owned records
on account deletion. The database prevents duplicate active records for the same
identified card while allowing a rejected card to be applied for again. Only an
approved card may have a credit limit.

Card setup (closing day, due day, credit limit, autopay and its payment type, spend limit) is saved through
`PATCH /api/v1/applications/{id}`. Saving the days, the status or autopay
re-plans that card's reminders.

Quiz drafts use the fit-rules answers: `under21`, `incomeBand`, `student`,
`standing` (including `not_sure`), `recentDenial`, and `canDeposit`, plus goal
and the optional spending answer: `spendingCategories` (one or two of
`food_and_dining`, `groceries`, `gas_and_rides`, `travel_home`,
`shopping_and_subscriptions`) and `spendingBand` (`under_200`, `200_to_500`,
`over_500`). The spending answer never decides fit and is never sent to
analytics; since fit rules v1.3 (2026-11-07) estimated year-one value breaks
the last ties in the card order. A draft without it is still complete. The unused
`monthlySpendingCents` stays for older drafts. The draft is partial until the
student finishes the quiz. A saved recommendation's `card_data_version` covers
the card facts and each card's rewards, since rewards now change the order. Card records carry the published eligibility fields, the issuer's
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
- The API never uses the service role key in student routes. The one exception
  is the two reminder routes below, which are not student requests: the daily
  cron job has no student session at all, and the unsubscribe link is opened
  by a student who is not signed in, so a signed token stands in for the
  session. Both create the service client in `web/src/lib/supabase/service.ts`
  (server only) and call only the functions made for them, never a table,
  with one read-only exception: before sending a server analytics event they
  read the student's `profiles.analytics_opted_out_at` (the Analytics switch)
  and send nothing for a student who turned it off or when the read fails.
- Money is integer cents. Timestamps in API responses are UTC ISO 8601 strings.
- `DELETE /me` also uses the service client solely to check the cleanup trigger
  and delete the authenticated student's own auth record. The auth trigger
  queues encrypted Plaid cleanup in the same transaction as deletion.
- Errors use `{ "error": { "code": string, "message": string, "details"?: unknown } }`.
- Responses containing student data send `Cache-Control: no-store`.

## API handoff

| Endpoint | Role |
| --- | --- |
| `POST /api/v1/auth/email`, `POST /api/v1/auth/email/verify` | Send and verify a six-digit email code. When the code is what confirms the account, any password set before it is replaced with a random one and other sessions end. |
| `POST /api/v1/auth/password/signup`, `POST /api/v1/auth/password/signin` | Optional password account creation and sign-in. Sign-up gives the same answer whether or not the email has an account; an existing account is emailed a sign-in code instead. |
| `POST /api/v1/auth/password/signup/confirm` | Confirm a password sign-up with the emailed code. When this code is what confirms the account, set the chosen password and end other sessions. An account confirmed earlier keeps its password and sessions and answers `passwordChanged: false`. |
| `POST /api/v1/auth/password/reset`, `POST /api/v1/auth/password/reset/confirm` | Request a reset email and set a password with an authenticated session. |
| `GET /api/v1/auth/google`, `GET /api/v1/auth/callback`, `POST /api/v1/auth/logout` | Google sign-in, PKCE callback, and logout. |
| `GET /api/v1/me` | Verify the session and return the student ID and email. |
| `GET /api/v1/cards`, `GET /api/v1/cards/{id}` | Public curated card catalog. Card facts and issuer links live in typed repository files. |
| `GET /api/v1/quiz`, `PUT /api/v1/quiz` | Read and save a resumable partial quiz. |
| `GET /api/v1/recommendations/latest`, `POST /api/v1/recommendations` | Read or compute and save the server-generated result. |
| `POST /api/v1/issuer-clicks` | Record a click on an issuer preapproval or apply link. |
| `GET /api/v1/applications`, `POST /api/v1/applications` | List and add tracked cards (the short `Application` shape). |
| `GET /api/v1/applications/{id}`, `PATCH /api/v1/applications/{id}` | One card with its denial reason and note, autopay, the autopay payment type (`autopayPaymentType`), the spend limit (`spendLimitCents`) and closing and due days (`ApplicationDetail`). PATCH takes any of those fields plus status and credit limit; a limit and the days need an approved card, a reason and note a rejected one, a payment type autopay on (autopay off or unknown clears it), a spend limit an approved card and at most the credit limit (400 otherwise). |
| `GET /api/v1/applications/{id}/plans/{plan}`, `PUT` and `DELETE /api/v1/applications/{id}/plans/{plan}/steps/{step}` | Read, mark done and undo first-month and denial plan steps. |
| `GET /api/v1/reminders`, `POST /api/v1/reminders` | List the student's reminders (sent and upcoming, with `remindOn` on their calendar), and set the reapply reminder for a denied application, tomorrow to a year out, through `create_reapply_reminder`. The `201` carries the reminder and `confirmation` (`sent`, `skipped` or `failed`) for its confirmation email. |
| `POST /api/v1/applications/{id}/reminder-confirmation` | Emails the student a confirmation of an approved card's payment reminders, called after its statement and due days are saved or changed. It reads the unsent reminders the database scheduled for the card and keeps the ones the daily job would send (each kind's switch; no due-date or autopay-check email while autopay is on; the autopay check only for a card got through Cense), then names them with the card's next closing and due dates, never a send day. One email per save of the days, keyed to the card's `updated_at`; not a reminder row, so it does not count toward the one-email-a-day limit. Answers `confirmation`: `sent`, `skipped` or `failed`; `409` until the card is approved and both days are saved. |
| `POST /api/v1/penny` | One typed question to Ask Penny. Personal details are removed, a crisis gets the 988 line, then `claim_penny_ask` counts it and the model answers from the checked answers in `web/src/lib/penny/answers.ts`. 429 `penny_limit` at the limit, 503 `penny_unavailable` without a key or when the model fails. Tapped questions never call it. |
| `POST /api/v1/reminders/{id}/acted` | Mark a sent reminder acted on ("I paid it down", or "I paid it" on a follow-up). The first time is kept. |
| `POST /api/v1/reminders/{id}/snooze` | Body `{ choice }`: `tomorrow`, `in_2_days` or `day_before_due`, each 9:00 on the student's calendar, worked out by the server, through `snooze_reminder`. A choice past the reminder's due date, or already gone, is `409 past_due`; a dismissed or paid one is `409 closed`. |
| `POST /api/v1/reminders/{id}/dismiss` | Hide a sent reminder for the rest of its billing cycle, through `dismiss_reminder`. The first time is kept. |
| `POST /api/v1/reminders/read` | "Mark all read", through `mark_reminders_read`. Answers `{ marked }`. |
| `GET /api/v1/me/reminder-settings`, `PATCH /api/v1/me/reminder-settings` | Read and change `emailsOn` and the three per-kind toggles. |

## Server-only reminder routes

Not part of the student API, so not in `api/openapi.yaml`: no client calls them.

| Route | Who calls it | What it does |
| --- | --- | --- |
| `GET /api/v1/cron/reminders` | Vercel Cron, daily at 13:00 UTC (`web/vercel.json`), with `Authorization: Bearer <CRON_SECRET>`; anything else gets `401` | `purge_old_plaid_transactions()` first (best effort; a failure is logged with its code and never fails the job or the heartbeat), then `raise_reminder_follow_ups()` (never stops the emails; a failed call makes the heartbeat say fail, a skipped reminder does not), then `refresh_all_reminders()`, then `claim_due_reminders(50)`, sends each through Resend, then `mark_reminder_sent(id)` or, on failure, `release_reminder_claim(id)`. Answers and logs counts only. |
| `GET`, `POST /api/v1/reminders/unsubscribe?token=` | The unsubscribe link and the `List-Unsubscribe` header in every reminder email | GET shows a confirm button and changes nothing (mail scanners open links). POST, the button or the inbox's one-click unsubscribe, calls `unsubscribe_reminders(student_id)`. The token is the student id and an HMAC-SHA256 of it keyed with `REMINDER_UNSUBSCRIBE_SECRET`; it never holds the email. |

The functions, all service role only (`supabase/migrations/20261024220000_reminder_sender.sql`, changed by `20261025200000_reminder_fixes.sql`):

| Function | Rule |
| --- | --- |
| `claim_due_reminders(p_limit)` | Reminders whose day has come on the student's calendar, unsent, at most one per student a day (none for a student who had one sent today or has one being sent), never to an unsubscribed student or for a kind turned off, only while the card still fits, never about a closing or due date already passed, never a due-date email (`payment_due`) while the card's autopay is `on`, the first-statement email (`check_autopay`) only for a new card (`source` `application`) and at most 3 days after its first close, at most one attempt a day and 3 in all. When two are due, the one whose date runs out first goes. Sets `claimed_at`, `attempted_at` and `attempts` and returns the email, card, credit limit, autopay status, due day and time zone. One claimer at a time. |
| `mark_reminder_sent(id)` | Sets `sent_at` once. |
| `release_reminder_claim(id)` | After a failed send: claimable again on the student's next day, attempts kept. True when that was the last attempt (the job reports it as abandoned). |
| `unsubscribe_reminders(student_id)` | Sets `reminders_unsubscribed_at` once. True only when this call turned emails off, so a second click is not counted again. |
| `raise_reminder_follow_ups()` | (`20261108210000_in_app_reminders.sql`) Sets `follow_up_at` once on a sent `statement_closing` reminder 2 days after its close on the student's calendar, when it is not marked paid, not dismissed and not snoozed past now, the card is approved, the student is subscribed with statement reminders on, and the payment due after that close has not passed. No email. Each reminder on its own: one that fails is skipped with a warning. Answers `raised` and `skipped`. |

The API route owner will implement a route only when its underlying dataset or
table is available. No route will claim a successful recommendation based on an
empty catalog or on client-authored ranking.

## Account deletion and deferred Plaid cleanup

`20261109160000_plaid_account_cleanup.sql` is applied to cense-preview, the hosted Supabase project the live site uses, by hand in the SQL editor (2026-11-09), before the code that calls it merges. It follows the bank-link schema and is independent of #94's transaction-storage migration; it neither modifies nor purges transactions. The route checks `plaid_account_cleanup_ready()` before deleting analytics or auth, and returns 503 on an unmigrated database rather than losing a token.

The existing authenticated daily reminders cron also runs `runAccountCleanup` concurrently, even if email settings are missing. It decrypts tokens only on the server and calls Plaid `/item/remove`. The response includes `plaidCleanup` counts only. Cleanup reuses the service client after the cron’s service-role check and keeps claiming five-row batches until no due work remains or 30 seconds from request start have elapsed. Each batch uses at most five parallel 10-second Plaid requests. A separate optional `PLAID_CLEANUP_HEARTBEAT_URL` check reports failures, unreadable tokens, unavailable cleanup, or a drain deferred by the budget; it never changes the reminder-delivery heartbeat. Encrypted rows remain for retry. Preserve `PLAID_TOKEN_KEY` until all tokens sealed under it have been cleaned up. A crashed worker's lease expires after 15 minutes; claim IDs prevent a stale worker acknowledging a newer attempt.

Local transaction/privilege checks: `psql <local-db-url> -v ON_ERROR_STOP=1 -f supabase/checks/plaid_account_cleanup.sql`. CI runs these on its disposable Supabase stack. The hosted migration is applied by hand, as above.

Rollback: revert the app to synchronous unlink before using `supabase/rollbacks/20261109160000_plaid_account_cleanup.down.sql`. The transaction locks account deletion, refuses a nonempty cleanup queue, and leaves the schema intact on refusal. `supabase/checks/plaid_account_cleanup_rollback.py` exercises refusal with a queued token, successful empty rollback, and reapplication on a disposable local database.
