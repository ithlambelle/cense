# US-09 Plaid data contract, discussion draft

Status: **proposed for Mabelle, Yunho, and Ben to agree on**. This is a data boundary for the MVP2 sandbox work, not an approved schema or product promise. The [semester roadmap](https://happy-angora-265.notion.site/Rest-of-Semester-Roadmap-40d780cd9453802787fedbb04ddc2aca) assigns a joint data spec first, then Transactions and Liabilities work. Plaid and budgeting are for discussion, not the MVP2 demo.

## What exists now

- US-12 links one sandbox bank and reads account balances. The access token is encrypted in the private `plaid` schema. Disconnect removes the Plaid Item before deleting local rows.
- [PR #86](https://github.com/ithlambelle/cense/pull/86) computes a budget waterfall from manually supplied, whole-cent income, expenses, and savings. Its preview uses made-up students and has no bank data connection.
- The Link token asks for the Transactions product because Plaid requires a product for Link, but CENSE does not yet request transaction history. Account deletion's unlink integration is in draft [PR #84](https://github.com/ithlambelle/cense/pull/84).

## Proposed data boundary

| Stage | Minimum data | Purpose and limit |
| --- | --- | --- |
| Pull from Plaid | Transactions Sync changes: transaction ID, account ID, posted date, amount, currency, pending status, merchant or description, category when present, plus added, modified, removed, and cursor | Sandbox only. Read on the server using the existing encrypted Item token. A positive Transactions amount means money out and a negative amount means money in. Do not treat every deposit as pay or every outflow as a bill. |
| Show to student | Candidate income and recurring bill rows with source, amount, period, last update, and an editable include choice | Label candidates as estimates. Show missing history, pending data, and refresh failures. Do not imply that Plaid knows the student's income, needs, or payment responsibility. |
| Student enters or confirms | Pay amount and cadence, bill amount and cadence, need or want, who pays, exclusions, and savings goal | Their edits take priority over imported candidates. Keep manual entry available when no bank is linked or history is too short. |
| Keep for the budget | A minimal per-student transaction projection and sync cursor, plus student-confirmed budget items and overrides | Yunho owns the database shape, RLS, retention, and token handling. Do not put raw Plaid responses or access tokens in public tables, logs, analytics, or browser storage. Delete derived data on disconnect and account deletion. |
| Calculate | Confirmed income and expenses mapped to PR #86's `BudgetInput`, in whole cents per month | Avoid counting transfers between a student's own accounts, card payments, and refunds as new income or spending. Exclude pending transactions from totals until posted. Keep the calculation educational, without prescriptive advice. |

## Sync and failure rules to agree on

1. Use [Transactions Sync](https://plaid.com/docs/api/products/transactions/) rather than a full-history fetch on every visit. Apply each batch's added, modified, and removed entries and save the final cursor together. Finish all pages before publishing a new budget. A pagination mutation requires restarting from the first page's cursor.
2. Treat Plaid's [Recurring Transactions](https://plaid.com/docs/api/products/transactions/#transactionsrecurringget) endpoint as optional until product access and cost are confirmed. It is an add-on. Without it, the first sandbox slice should present candidates for student confirmation instead of claiming automatic recurring detection.
3. No linked bank, unavailable Plaid, unsupported currency, or incomplete history should leave the student with manual entry and an explicit freshness label. Never replace a confirmed amount silently after a later sync.
4. Plaid account IDs and transaction IDs are identifiers for deduplication, not student-visible account numbers. Keep institution and merchant text bounded. Do not send transaction descriptions to analytics or an AI model.

## Decisions needed before implementation

- **Ben:** Which income and bill fields does the student see and confirm? What language distinguishes an estimate from a known amount? How are a partial history and a shortfall shown?
- **Yunho:** Which minimum transaction fields and cursor are stored, for how long, and in which private tables? How do RLS, refresh, disconnect, and account deletion work? Liabilities card dates and balances remain Yunho's separate track.
- **Mabelle with team:** Which accounts count, what history window is enough to suggest recurring income or bills, and how are transfers, refunds, card payments, pending-to-posted changes, and duplicate account views excluded? Is the recurring add-on available in sandbox for this project?

## Acceptance for the first sandbox slice

- Fake Plaid and sandbox tests cover initial and paged sync, changed and removed transactions, retry after a failed page, and no double counting when a pending item posts.
- A student can inspect and change every proposed income or recurring bill before it reaches the waterfall. Manual entry works without Plaid.
- A second student cannot read the first student's transactions or overrides. No bank token or raw response reaches the browser, logs, or analytics.
- Disconnect and account deletion remove local transaction-derived data and the Plaid Item. A Plaid failure leaves the account and token available to retry.
- The resulting `BudgetInput` reproduces the student-confirmed amounts in whole cents, with source and freshness visible.

Sources: [Plaid Transactions API](https://plaid.com/docs/api/products/transactions/), [CENSE semester roadmap](https://happy-angora-265.notion.site/Rest-of-Semester-Roadmap-40d780cd9453802787fedbb04ddc2aca), and the existing US-12 implementation.
