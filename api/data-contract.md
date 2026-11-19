# MVP1 backend data contract

This is the handoff between the API branch and the database branch. SQL migrations,
row level security policies, and Supabase project setup belong to the database
owner. The API uses the student's Supabase Auth UUID as `student_id` and always
queries as that student, never with a service role key.

## Required tables

| Table | Required columns | API behavior |
| --- | --- | --- |
| `profiles` | `student_id` UUID primary key, `time_zone` text, `updates_seen_at` timestamp nullable, `reminders_unsubscribed_at` timestamp nullable, `remind_statement_closing`, `remind_payment_due`, `remind_check_autopay` booleans (default true), `created_at`, `updated_at` | A profile belongs to `auth.users.id`. Use an IANA time zone for reminder scheduling; an unknown name falls back to America/New_York. Unsubscribing stops every reminder email; each kind can also be turned off. Students read their profile and change only `remind_statement_closing`, `remind_payment_due`, `remind_check_autopay`, `reminders_unsubscribed_at` and `analytics_opted_out_at`; they cannot add or delete one (`handle_new_student` makes it) or set `time_zone`, which nothing saves yet (`20261117100000_security_db_limits.sql`). |
| `quiz_drafts` | `student_id` UUID primary key, `answers` JSONB, `updated_at` | One resumable draft per student. Partial answers are allowed. `answers` is at most 8 KB as JSON text (a full draft is about 260 bytes). |
| `recommendations` | `id` UUID primary key, `student_id` UUID, `card_id` text (null when no card fits, with `fit_tier` not_yet), `fit_tier` text, `reason` text, `answer_snapshot` JSONB, `result_snapshot` JSONB, `created_at` | Store the exact server-generated result and inputs shown to the student. Never let the client write a recommendation directly. `save_recommendation` refuses (22023) an answer snapshot over 8 KB, a result snapshot over 64 KB (all 53 cards is about 4.2 KB), a reason over 1,000 characters, and a card id or version over 100, and refuses (54000) a 21st save in 24 hours; the results page logs a failed save and never shows it. |
| `issuer_clicks` | `id` UUID primary key, `student_id` UUID, `card_id` text, `kind` text, `clicked_at` | Append one row for each preapproval or apply click. A click is not an application. `card_id` at most 100 characters; at most 50 clicks per student in any 24 hours (54000 past that); `clicked_at` is always the server's time. A click that cannot be recorded never stops the student: the API still answers the issuer's address. |
| `card_applications` | `id` UUID primary key, `student_id` UUID, `card_id` text nullable, `card_name` text nullable, `source` text, `status` text, `credit_limit_cents` bigint nullable, `applied_at` timestamp nullable, `rejected_at`, `denial_reason` text nullable, `denial_reason_note` text nullable (at most 200 characters, never sent to analytics), `autopay_status` text (`on`, `off`, `unknown`), `autopay_updated_at`, `autopay_payment_type` text nullable (`statement_balance`, `minimum`, `fixed_amount`; only while autopay is `on`, what the student said, never an amount), `spend_limit_cents` bigint nullable (the monthly spend limit the student saved; above zero, at most `credit_limit_cents` when one is saved, approved cards only), `statement_closing_day` and `payment_due_day` (1 to 31) nullable, `card_set_up_at` (server-set), `updated_at` timestamp, `created_at` | A student may have several card records. Status is `applied`, `approved`, or `rejected`. Leaving `rejected` clears the denial reason and note. Leaving `approved`, or a credit limit below the spend limit, clears the spend limit, and the PATCH that clears it also deletes the card's `spend_limit` plan step. At most 25 records per student, whatever their status (54000 past that, which POST answers as `409 limit_reached`; a real student tracks one to three). `card_id` at most 100 characters and `card_name` at most 160, as in the API. Students add only `student_id`, `card_id`, `card_name`, `source`, `status`, `credit_limit_cents`, `applied_at` (POST), change only `status`, `credit_limit_cents`, `spend_limit_cents`, `denial_reason`, `denial_reason_note`, the two days, `autopay_status`, `autopay_updated_at`, `autopay_payment_type` (PATCH), and never delete one (`20261117100000_security_db_limits.sql`). |
| `reminders` | `id` UUID primary key, `student_id` UUID, `card_application_id` UUID, `kind` text (`statement_closing`, `payment_due`, `check_autopay`, `reapply`), `occurrence` date, `due_at`, `claimed_at`, `attempts`, `attempted_at` (the last send attempt), `sent_at`, `acted_at`, `read_at`, `snoozed_until`, `dismissed_at`, `follow_up_at` (in-app state, empty until sent; `follow_up_at` only for `statement_closing`), `created_at` | One row per reminder email, unique on card, kind and occurrence. Once sent it is also an in-app card in Updates: students mark it read, snooze it or dismiss it for its billing cycle only through `snooze_reminder`, `dismiss_reminder` and `mark_reminders_read`, which check it is theirs and sent (`snooze_reminder` also checks the API's rule: the snooze day, on the student's calendar, is not before today and not after the date the reminder runs out on, or at most 2 days out when it has none); the cron job sets `follow_up_at` once through `raise_reminder_follow_ups`. The database schedules them (`refresh_reminders`) from the card's days and the student's time zone; students only read them, set `acted_at` on a sent one, and pick the day of the reapply reminder through `create_reapply_reminder`. Only the send job (service role) claims and marks them sent, through `claim_due_reminders`, `mark_reminder_sent` and `release_reminder_claim`. |
| `plan_steps` | `student_id` UUID, `card_application_id` UUID, `plan` text (`first_month`, `denial`), `step` text, `completed_at`; primary key (card, plan, step) | One row per finished plan step; undo deletes it. first_month steps are `planned_purchase` (kept for saved rows), `spend_limit`, `payment_reminder` (autopay reads `autopay_status`); denial steps are `read_letter`, `check_reports`, `pause_applications`, `build_credit`, `reapply`. A first_month step needs an approved card, a denial step a rejected one. |
| `bank_links` | `student_id` UUID primary key, `institution_name`, `status` (`active`, `reconnect_needed`, `relink_needed`), `linked_at`, `refreshed_at` nullable, `set_aside_cents` bigint, `answered_at` nullable | One sandbox bank per student (US-12). Students read it and change only `set_aside_cents` and `answered_at` (through `save_safe_to_spend_answers`). Created by `save_bank_link`, kept current by `save_bank_balances` and `mark_bank_link_status`, deleted by `delete_bank_link`, which cascades to the two tables below. Disconnect removes the Item at Plaid first (`removeBankLinksForStudent`). Account deletion queues its encrypted token atomically with auth deletion, so a Plaid outage never holds the account open. |
| `bank_balances` | `student_id` UUID, `position`, `name`, `mask` (up to 4 letters or digits) nullable, `kind` (`cash`, `card`, `other`), `balance_cents` bigint; primary key (student, position) | The accounts read at the last refresh, replaced each time. Loans and investments are never stored. Students read them only. |
| `bill_coverage` | `student_id` UUID, `bill` (`rent`, `phone`, `tuition`, `groceries`, `car`), `covered_by` (`me`, `family`, `split`, `none`), `monthly_cents` (only for me and split); primary key (student, bill) | The student's own answers, read and written by them. |
| `plaid.transactions` | `student_id` UUID, `transaction_id`, `account_id`, `posted_on` date, `amount_cents` bigint (Plaid's sign: positive is money out), `pending`, `category`, `category_detailed`, `merchant_name` (up to 100 characters); primary key (student, transaction) | US-14. In the `plaid` schema, no grants to students. Only the last 180 days are kept: older rows are never saved and `purge_old_plaid_transactions()` deletes them daily from the reminders cron (service role only). At most 10,000 rows per student. Written only by `apply_plaid_transactions_sync(item, starting cursor, …)`, which saves nothing and answers false unless the student's linked Item and saved cursor are still the ones the sync started from (`20261113000000_plaid_transactions_item_binding.sql`); students read only monthly totals through `spending_by_category` and `income_by_month`. Income counts money marked INCOME, money in from family and other people (TRANSFER_IN with a sender name that is not a payment app cash-out) and deposits with or without a name; never the student's own transfers, savings, investments, loans or cash-outs (D34, D37, D38; `20261114120000_income_counts_family_money.sql`, the same rule as the US-16 detector). Deleted with the Item. |
| `budget_amounts` | `student_id` UUID, `line` (`income` or a Cense spending category: `groceries`, `eating_out`, `rent_and_bills`, `transportation`, `school_supplies`, `entertainment`, `subscriptions`, `shopping_and_personal_care`, `health`, `travel`, `other`, `student_loans`), `amount_cents` bigint (0 to 100,000,000), `updated_at`; primary key (student, line) | US-12, Your money's This month tab. The number a student typed over the bank's for one line; a line with no row follows the bank. Students read and write only their own rows (row level security). References `bank_links`, so disconnecting and deleting the account delete it. Saving is not here: it is `bank_links.set_aside_cents`. The bank's numbers come from `spending_by_detailed_category(month)` (`20261113120000_your_money_budget.sql`): the caller's posted totals for one calendar month by Plaid detailed category, money out and money in apart; `web/src/lib/budget/categories.ts` maps them to Cense's categories, leaves out income, own transfers and card payments, counts cash taken out, payment app payments (Venmo, Zelle, Cash App, PayPal, named or not) and payments to a named person as Other (the function already drops moves to savings or investments, transfers out with no name, general transfers that are not a payment app, and transfers matched by money into another of the student's accounts), and nets refunds (D35). |
| `plaid.items` | `student_id` UUID primary key, `item_id` unique, `token_ciphertext`, `created_at` | In the `plaid` schema, which the Data API does not serve; no grants to students; row level security on with no policies, as on every `plaid` table (`20261117110000_security_quotas.sql`), so only the security definer functions, which run as the table owner, read it. `save_bank_link` refuses (22023) a value not shaped like a sealed token. The access token is stored only as AES-256-GCM ciphertext made by the app (`PLAID_TOKEN_KEY`). `bank_link_secret()` returns the caller's own ciphertext to the server routes, which decrypt it; it never reaches the browser. |
| `plaid.account_cleanup` | `id`, `student_id`, `item_id`, `token_ciphertext`, `created_at`, `retry_at`, `claim_id`, `attempts` (claims, informational), `unreadable_failures`, `gave_up_at` | Private queue populated by the BEFORE DELETE trigger on `auth.users`. Only the encrypted token and its student/item encryption binding survive account deletion; no auth foreign key, bank details or transactions. No direct access, including service role. Service-only claim/finish functions lease at most five rows for 15 minutes; failed work retries after a day. The app passes why a removal failed to `finish_plaid_account_cleanup(id, claim, removed, reason)` (`20261117110000_security_quotas.sql`): `undecryptable` (the token does not open with the configured key) adds to `unreadable_failures`, and the 5th in a row gives the row up (`gave_up_at`): it stays encrypted for an operator and is never claimed again. The claim's `gives_up_if_unreadable` tells the cron to log `plaid_cleanup_gave_up` once and count it in `plaidCleanup.gaveUp`; that run fails the cleanup check once, later runs stay green. `plaid_error` and `not_configured` are retried every day for ever and keep failing the check; a `plaid_error` also resets `unreadable_failures`, since the token opened. Claims alone (a crashed worker) count nothing. To retry a given-up row, for example after fixing a missing or rotated `PLAID_TOKEN_KEY`, set `gave_up_at` to null, `unreadable_failures` to 0 and `retry_at` to now. Successful or already-completed Plaid removal deletes the queue row. |
| `penny_asks` | `id` bigint identity, `student_id` UUID (no foreign key), `asked_at` | One row per typed question sent to Ask Penny's model, never the question. Students cannot read or write it; `claim_penny_ask(p_student_id)`, service role only, checks the limits (20 per student and 300 across all students, each in the last 24 hours), records the question and returns `ok`, `student_limit` or `daily_limit`. The server calls it with the id of the student in the verified session (`web/src/lib/api/quota.ts`). Rows keep only the id and the time, outlive account deletion so deleting cannot reset a count, and are deleted once two days old, by each claim and by `purge_old_quota_rows()` (service role only) from the daily reminders cron (`20261117110000_security_quotas.sql`). |
| `confirmation_email_sends` | `id` bigint identity, `student_id` UUID (no foreign key), `sent_at` | One row per reminder confirmation email sent. Students cannot read or write it; `claim_confirmation_email(p_student_id)`, service role only, allows 5 per student and 100 across all students in the last 24 hours, records the send and returns true, or false to skip the email (the save still succeeds). Called by the server like `claim_penny_ask`. Same retention: only the id and the time, outlives account deletion, deleted once two days old by each claim and by the daily `purge_old_quota_rows()` (`20261116090000_confirmation_email_limit.sql`, `20261117110000_security_quotas.sql`). |

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
  A second exception: the daily limits on typed Penny questions and
  confirmation emails (`web/src/lib/api/quota.ts`) use the service client only
  to call `claim_penny_ask` and `claim_confirmation_email` with the id of the
  student in the verified session, so a student cannot call the claims
  directly and use up the shared allowance for everyone.
- The sign-in routes (`/auth/email`, `/auth/email/verify`, `/auth/password/signup`,
  `/auth/password/signup/confirm`, `/auth/password/signin`, `/auth/password/reset`
  and `POST /auth/password/reset/verify`) also use the service client, before
  anyone is signed in, for one call only: `claim_auth_attempt(action, email, ip)`
  (`web/src/lib/auth/throttle.ts`). It counts tries in `auth_throttle_events`,
  which nobody else can read or write. Per email and IP together, over 10
  minutes: 5 emails sent, 10 code checks, 10 password tries (and 20 code checks
  a day). Per email alone: 30 emails and 50 password tries per 10 minutes, 50
  code checks a day. Per IP: 300 emails and 600 checks per 10 minutes. Emails
  are counted lowercased, trimmed and without a +tag; IPv6 by its /64; the IP
  is Vercel's `x-forwarded-for`, trusted only on Vercel. The tight limits are
  per email and IP so nobody can use up another student's tries from their own
  address. What is left: an attacker with many addresses can still reach the
  per-email ceilings and block that email for up to 10 minutes (up to a day
  for code checks, which takes at least 3 addresses); Google sign-in is never
  blocked. Past a limit the route answers `429` `rate_limited`, "Too many
  tries. Try again in N minutes." (or hours), with `Retry-After`, before
  Supabase is called. A refused try is not counted. When the count cannot be
  checked (the call fails or takes over 3 seconds, or production has no key),
  code and password checks answer `503` `sign_in_busy`, "Sign-in is busy right
  now. Try again in a minute.", and emails and reset links go ahead; both are
  logged.
- Opening a reset link cannot protect a student who is signed out: if they
  tap Continue on a link someone else asked for, they are signed in to that
  person's account. Set a new password names the account's email, so they can
  see it is not theirs; that is the guard.
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
| `POST /api/v1/auth/password/reset`, `POST /api/v1/auth/password/reset/confirm` | Request a reset email (its link, built from `APP_BASE_URL`, opens `/reset-password/confirm`) and set a password with an authenticated session. |
| `POST /api/v1/auth/password/reset/verify`, `GET /api/v1/auth/password/reset/verify` | POST, from the confirm screen's Continue button, verifies the reset link (`tokenHash` or `code`) and starts its session; `409` `signed_in_as_other` when a different account is signed in in that browser, whose session is left as it was. GET verifies nothing and only forwards an older link to the confirm screen, so opening a link never signs anyone in. |
| `GET /api/v1/auth/google`, `GET /api/v1/auth/callback`, `POST /api/v1/auth/logout` | Google sign-in, PKCE callback, and logout. |
| `GET /api/v1/me` | Verify the session and return the student ID and email. |
| `GET /api/v1/cards`, `GET /api/v1/cards/{id}` | Public curated card catalog. Card facts and issuer links live in typed repository files. |
| `GET /api/v1/quiz`, `PUT /api/v1/quiz` | Read and save a resumable partial quiz. |
| `GET /api/v1/recommendations/latest`, `POST /api/v1/recommendations` | Read or compute and save the server-generated result. |
| `POST /api/v1/issuer-clicks` | Record a click on an issuer preapproval or apply link. `201` with the saved click; `200` with the same address and a null `id` and `clickedAt` when it could not be recorded, so the student still reaches the issuer. |
| `GET /api/v1/applications`, `POST /api/v1/applications` | List and add tracked cards (the short `Application` shape). POST answers `409 already_exists` for a card already tracked and `409 limit_reached` at the card limit. |
| `GET /api/v1/applications/{id}`, `PATCH /api/v1/applications/{id}` | One card with its denial reason and note, autopay, the autopay payment type (`autopayPaymentType`), the spend limit (`spendLimitCents`) and closing and due days (`ApplicationDetail`). PATCH takes any of those fields plus status and credit limit; a limit and the days need an approved card, a reason and note a rejected one, a payment type autopay on (autopay off or unknown clears it), a spend limit an approved card and at most the credit limit (400 otherwise). |
| `GET /api/v1/applications/{id}/plans/{plan}`, `PUT` and `DELETE /api/v1/applications/{id}/plans/{plan}/steps/{step}` | Read, mark done and undo first-month and denial plan steps. |
| `GET /api/v1/reminders`, `POST /api/v1/reminders` | List the student's reminders (sent and upcoming, with `remindOn` on their calendar), and set the reapply reminder for a denied application, tomorrow to a year out, through `create_reapply_reminder`. The `201` carries the reminder and `confirmation` (`sent`, `skipped` or `failed`) for its confirmation email. |
| `POST /api/v1/applications/{id}/reminder-confirmation` | Emails the student a confirmation of an approved card's payment reminders, called after its statement and due days are saved or changed. It reads the unsent reminders the database scheduled for the card and keeps the ones the daily job would send (each kind's switch; no due-date or autopay-check email while autopay is on; the autopay check only for a card got through Cense), then names them with the card's next closing and due dates, never a send day. One email per save of the days, keyed to the card's `updated_at`; not a reminder row, so it does not count toward the one-email-a-day limit. Answers `confirmation`: `sent`, `skipped` or `failed`; `409` until the card is approved and both days are saved. |
| `GET /api/v1/budget`, `PUT /api/v1/budget/lines/{line}`, `DELETE /api/v1/budget/lines/{line}` | Your money, This month (US-12): the last full calendar month's income (`income_by_month`), spending by Cense category, the set-aside as saving, the student's typed numbers over the bank's, and what is left over or short (`remainingCents`, `shortfallCents`, `fixedOverIncome`). PUT saves `{ amountCents }` for `income` or one category; DELETE removes that typed number so the line follows the bank's again (the undo on a typed line); both answer the budget. Saving goes through `PUT /safe-to-spend/answers`. 404 `not_linked` without a bank. |
| `POST /api/v1/penny` | One typed question to Ask Penny. Personal details are removed, a crisis gets the 988 line, then the server counts it with `claim_penny_ask` (service role, the session's student) and the model answers from the checked answers in `web/src/lib/penny/answers.ts`. 429 `penny_limit` at the limit, 503 `penny_unavailable` without a model key or `SUPABASE_SERVICE_ROLE_KEY`, or when the model fails. Tapped questions never call it. |
| `POST /api/v1/reminders/{id}/acted` | Mark a sent reminder acted on ("I paid it down", or "I paid it" on a follow-up). The first time is kept. |
| `POST /api/v1/reminders/{id}/snooze` | Body `{ choice }`: `tomorrow`, `in_2_days` or `day_before_due`, each 9:00 on the student's calendar, worked out by the server, through `snooze_reminder`. A choice past the reminder's due date, or already gone, is `409 past_due`; a dismissed or paid one is `409 closed`. |
| `POST /api/v1/reminders/{id}/dismiss` | Hide a sent reminder for the rest of its billing cycle, through `dismiss_reminder`. The first time is kept. |
| `POST /api/v1/reminders/read` | "Mark all read", through `mark_reminders_read`. Answers `{ marked }`. |
| `GET /api/v1/me/reminder-settings`, `PATCH /api/v1/me/reminder-settings` | Read and change `emailsOn` and the three per-kind toggles. |

## Server-only reminder routes

Not part of the student API, so not in `api/openapi.yaml`: no client calls them.

| Route | Who calls it | What it does |
| --- | --- | --- |
| `GET /api/v1/cron/reminders` | Vercel Cron, daily at 13:00 UTC (`web/vercel.json`), with `Authorization: Bearer <CRON_SECRET>`; anything else gets `401` | `purge_old_plaid_transactions()` first, then `purge_old_quota_rows()` (both best effort; a failure is logged with its code and never fails the job or the heartbeat), then `raise_reminder_follow_ups()` (never stops the emails; a failed call makes the heartbeat say fail, a skipped reminder does not), then `refresh_all_reminders(p_after)` in batches until it answers null (no new call 5 seconds after the first; a refresh that does not finish makes the heartbeat say fail, and the answer's `refreshed` false), then `claim_due_reminders(50)`, sends each through Resend, then `mark_reminder_sent(id)` or, on failure, `release_reminder_claim(id)`. Answers and logs counts only. |
| `GET`, `POST /api/v1/reminders/unsubscribe?token=` | The unsubscribe link and the `List-Unsubscribe` header in every reminder email | GET shows a confirm button and changes nothing (mail scanners open links). POST, the button or the inbox's one-click unsubscribe, calls `unsubscribe_reminders(student_id)`. The token is the student id and an HMAC-SHA256 of it keyed with `REMINDER_UNSUBSCRIBE_SECRET`; it never holds the email. |

The functions, all service role only (`supabase/migrations/20261024220000_reminder_sender.sql`, changed by `20261025200000_reminder_fixes.sql`):

| Function | Rule |
| --- | --- |
| `claim_due_reminders(p_limit)` | Reminders whose day has come on the student's calendar, unsent, at most one per student a day (none for a student who had one sent today or has one being sent), never to an unsubscribed student or for a kind turned off, only while the card still fits, never about a closing or due date already passed, never a due-date email (`payment_due`) while the card's autopay is `on`, the first-statement email (`check_autopay`) only for a new card (`source` `application`) and at most 3 days after its first close, at most one attempt a day and 3 in all. When two are due, the one whose date runs out first goes. Sets `claimed_at`, `attempted_at` and `attempts` and returns the email, card, credit limit, autopay status, due day and time zone. One claimer at a time. |
| `refresh_all_reminders(p_after, p_budget)` | (`20261117100000_security_db_limits.sql`) Re-plans every approved or rejected card with `refresh_reminders`, one student at a time in id order after `p_after`, skipping a card that fails with a warning. Stops after about `p_budget` (3 seconds) and answers the last student done, so the job carries on from there in a new statement; null when everyone is done. `reminder_refresh_state` (one row, no student access) keeps where a pass starts and the last student done, so a run after one that stopped early starts right after that student and wraps around, and nobody is skipped day after day. |
| `mark_reminder_sent(id)` | Sets `sent_at` once. |
| `release_reminder_claim(id)` | After a failed send: claimable again on the student's next day, attempts kept. True when that was the last attempt (the job reports it as abandoned). |
| `unsubscribe_reminders(student_id)` | Sets `reminders_unsubscribed_at` once. True only when this call turned emails off, so a second click is not counted again. |
| `raise_reminder_follow_ups()` | (`20261108210000_in_app_reminders.sql`) Sets `follow_up_at` once on a sent `statement_closing` reminder 2 days after its close on the student's calendar, when it is not marked paid, not dismissed and not snoozed past now, the card is approved, the student is subscribed with statement reminders on, and the payment due after that close has not passed. No email. Each reminder on its own: one that fails is skipped with a warning. Answers `raised` and `skipped`. |

The API route owner will implement a route only when its underlying dataset or
table is available. No route will claim a successful recommendation based on an
empty catalog or on client-authored ranking.

## Account deletion and deferred Plaid cleanup

`20261109160000_plaid_account_cleanup.sql` is applied to cense-preview, the hosted Supabase project the live site uses, by hand in the SQL editor (2026-11-09), before the code that calls it merges. It follows the bank-link schema and is independent of #94's transaction-storage migration; it neither modifies nor purges transactions. The route checks `plaid_account_cleanup_ready()` before deleting analytics or auth, and returns 503 on an unmigrated database rather than losing a token.

The existing authenticated daily reminders cron also runs `runAccountCleanup` concurrently, even if email settings are missing. It decrypts tokens only on the server and calls Plaid `/item/remove`. The response includes `plaidCleanup` counts only. Cleanup reuses the service client after the cron’s service-role check and keeps claiming five-row batches until no due work remains or 30 seconds from request start have elapsed. Each batch uses at most five parallel 10-second Plaid requests. A separate optional `PLAID_CLEANUP_HEARTBEAT_URL` check reports failures, unreadable tokens, unavailable cleanup, or a drain deferred by the budget, until a row has had 5 unreadable failures in a row and is given up (`gaveUp`, logged once, failing the check for that run only; Plaid errors are never given up); it never changes the reminder-delivery heartbeat. Encrypted rows remain for retry. Preserve `PLAID_TOKEN_KEY` until all tokens sealed under it have been cleaned up. A crashed worker's lease expires after 15 minutes; claim IDs prevent a stale worker acknowledging a newer attempt.

Local transaction/privilege checks: `psql <local-db-url> -v ON_ERROR_STOP=1 -f supabase/checks/plaid_account_cleanup.sql`. CI runs these on its disposable Supabase stack. The hosted migration is applied by hand, as above.

Rollback: revert the app to synchronous unlink before using `supabase/rollbacks/20261109160000_plaid_account_cleanup.down.sql`. The transaction locks account deletion, refuses a nonempty cleanup queue, and leaves the schema intact on refusal. `supabase/checks/plaid_account_cleanup_rollback.py` exercises refusal with a queued token, successful empty rollback, and reapplication on a disposable local database.
