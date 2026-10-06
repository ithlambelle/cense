# CENSE

CENSE helps students choose a first credit card with clear, personalized guidance and build healthy credit habits afterward.

## Repository layout

- `web/` — Next.js 16, TypeScript, Tailwind CSS, shadcn/ui, Zod, and Supabase
- `ios/` — native SwiftUI app shell
- `api/openapi.yaml` — shared REST contract for web and iOS clients
- `tokens.json` — shared design tokens for both platforms

## Architecture

### Stack

| Layer | Choice |
| --- | --- |
| Frontend | Next.js 16 and TypeScript, styled with Tailwind CSS. Mobile-first web app that can be installed to the Home Screen. A native SwiftUI app follows in MVP2 and calls the same API. |
| Backend | TypeScript on Node.js. Next.js route handlers under `/api/v1`, described by `api/openapi.yaml`. Business rules run on the server only. Vercel Cron runs the reminder job. |
| Database | Supabase Postgres. Schema changes only through SQL migrations in this repo. Row level security on every table that holds user data. |
| Auth | Supabase Auth with Google and a 6-digit email code. No passwords. Sign in with Apple is added later. |
| Hosting | Vercel. Every pull request gets a preview deployment; `main` is production. |
| Email | Resend, for sign-in codes and reminders. |
| Analytics and errors | PostHog, with pseudonymous IDs. |
| Testing and CI | Vitest for unit and integration tests, Playwright for end-to-end tests (planned), GitHub Actions on every pull request. |

### Diagram

Solid boxes ship in MVP1 (Oct 26). Dashed boxes come in MVP2 (Nov 9) or by Demo Day (Dec 11).

```mermaid
%%{init: {"flowchart": {"nodeSpacing": 80, "rankSpacing": 60}}}%%
flowchart TB
    student(["Student, 18 to 21<br/>phone first"])

    subgraph FE["1. Frontend"]
        web["Web app<br/>Next.js + TypeScript<br/>mobile first, installable to Home Screen"]
        ios["iOS app, MVP2<br/>Swift and SwiftUI<br/>calls the same API"]
    end

    subgraph BE["2. Backend: Next.js route handlers on Vercel"]
        api["REST API /api/v1<br/>TypeScript route handlers<br/>OpenAPI contract"]
        authz["Authorization<br/>checked in server code on every request"]
        rules["Rules engine<br/>eligibility, ranking and fit tiers<br/>runs on the server only"]
        remind["Reminder jobs<br/>each reminder sent once"]
        notify["notify()<br/>email now, push at MVP2"]
        cron["Vercel Cron, every 15 min"]
    end

    subgraph DATA["3. Data"]
        cards["Card dataset<br/>typed files in the repo"]
        db[("Supabase Postgres<br/>system of record")]
        auth["Supabase Auth<br/>Google and email code sign-in"]
    end

    subgraph EXT["4. External services"]
        resend["Resend<br/>sign-in codes and reminder emails"]
        posthog["PostHog<br/>product analytics and error tracking"]
        issuers["Card issuers<br/>preapproval check and application"]
        plaid["Plaid, MVP2<br/>linked bank data"]
        apns["Apple Push, MVP2<br/>iOS notifications"]
        ai["AI model, Dec 11<br/>question router over vetted content"]
    end

    subgraph OPS["Build and operations"]
        github["GitHub<br/>pull request review + CI checks<br/>merges to main deploy to Vercel"]
    end

    student --> web
    student -.-> ios
    web -->|"sign in"| auth
    ios -.->|"sign in"| auth
    web -->|"HTTPS + sign-in token"| api
    ios -.-> api
    api --> authz
    authz --> rules
    authz --> remind
    cron --> api
    cards -->|"card facts"| rules
    rules --> db
    remind -->|"finds what is due"| db
    remind --> notify
    auth -->|"sign-in codes"| resend
    notify -->|"reminder emails"| resend
    notify -.->|"push"| apns
    api -->|"links out"| issuers
    api -->|"copies of events"| posthog
    api -.-> plaid
    api -.-> ai
    github --> BE

    classDef later stroke-dasharray: 6 4
    class ios,plaid,apns,ai later
```

### External services

| Service | What we use it for | When |
| --- | --- | --- |
| Supabase | Postgres database and sign-in | MVP1 |
| Vercel | Hosting, preview deployments, scheduled jobs | MVP1 |
| Resend | Sign-in codes and reminder emails | MVP1 |
| PostHog | Product analytics and error tracking | MVP1 |
| Google OAuth | "Sign in with Google" through Supabase Auth | MVP1 |
| Card issuer websites | Links out to each issuer's own preapproval check and application. No API; Cense never submits an application. | MVP1 |
| GitHub Actions | CI checks on every pull request | MVP1 |
| Plaid | Linked bank data | MVP2 |
| Apple Push Notification service | iOS notifications | MVP2 |
| An AI model (provider not chosen) | Routing questions to vetted content. It never makes the recommendation. | By Dec 11 |

### Environments

| Environment | Where it runs | Database |
| --- | --- | --- |
| Local | Your laptop, `npm run dev` | Supabase dev project |
| Preview | Vercel, one per pull request | Supabase dev project |
| Production | Vercel, from `main` | Supabase production project (created before the first real student uses the app) |

### Technical risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Google sign-in may not work inside the app once it is saved to the iPhone Home Screen. An installed web app keeps its own storage, separate from Safari, and redirect-based sign-in has reported failures there. | The 6-digit email code works in that setting and is always offered. Google sign-in is tested on a real iPhone, in Safari and from the Home Screen, before MVP1. |
| A signed-in user can reach Supabase's data API directly, without going through our server. | Row level security and explicit grants on every table that holds user data, plus an automated test in CI that signs in as one user and proves they cannot read another user's records. |
| Card terms and links go stale, so a recommendation could rest on old facts. | Card data lives in typed files in this repo, each card with a last-verified date. It is validated in CI and changes only through a reviewed pull request. |
| The reminder job could send a reminder twice, or stop without anyone noticing. | Each reminder is claimed once by a unique key, so a rerun cannot send it again. A heartbeat check alerts the team if the job stops running. |

### Mentor feedback on the stack

Comments from our mentors on Oct 5, 2026, and what we did with each.

| Mentor | Comment | What we did |
| --- | --- | --- |
| Steven (Slack) | The diagram showed no backend | Redrew it to show the route handlers, rules and reminder jobs |
| Steven (Slack) | Had you considered Flutter | Staying with Next.js and eventually SwiftUI for higher quality UX at the cost of managing multiple languages and temporarily excluding Android. |
| Steven (meeting) | Wants more backend detail: monolith or microservices, tiers | Diagram to be refined. Workshop meeting with mentors to be scheduled to improve specificity. |
| Kumar (meeting) | Vercel plus Supabase is right for an MVP; moving to AWS later is common | No change |

## Local setup

```bash
cd web
cp .env.example .env.local
npm install
npm run dev
```

The starter intentionally runs without credentials. Add the Supabase values when the development project is available.

Setup verified from a fresh clone by a second teammate: verified by Yunho on 2026-10-04 (macOS, Node v25.1.0).

## Quality checks

```bash
cd web
npm run check
```

CI runs linting, type checking, tests, a production build, secret scanning, OpenAPI validation, and an iOS simulator build on every pull request and push to `main`.

## Installed packages

| Area | Package | Purpose |
| --- | --- | --- |
| Framework | `next`, `react`, `react-dom` | Web application and server route handlers |
| Styling | `tailwindcss`, `shadcn`, `@base-ui/react`, `class-variance-authority`, `clsx`, `tailwind-merge`, `tw-animate-css`, `lucide-react` | Accessible UI components, icons, and styling |
| Data | `@supabase/supabase-js` | Authentication and database client |
| Validation/API | `zod`, `@asteasolutions/zod-to-openapi`, `openapi-typescript` | Runtime schemas and generated API contracts |
| Quality | `eslint`, `typescript`, `vitest` | Linting, type checking, and tests |

See `web/package.json` and `web/package-lock.json` for exact versions.

## Accounts and keys

Who holds each account. Key values are never stored in this repo or sent over Slack. They live in Vercel's environment variables and in the Supabase dashboard; `web/.env.example` lists the variable names.

| Account | Held by | Status (Oct 4) |
| --- | --- | --- |
| GitHub repository | Mabelle (owner) | Active |
| Vercel | Mabelle | Connected to this repo on Oct 4; `main` deploys to production |
| Supabase, dev project | Ben (organization owner); Mabelle and Yunho as admins | Created |
| Supabase, production project | Ben | Not created yet; needed before real students use the app |
| Resend | Ben | Being set up |
| PostHog | Not assigned yet | Not created yet |
| Google OAuth client | Yunho, with the sign-in work | Not created yet |
| Domain | Ben | Not purchased yet |

## How we work

- Branching, pull requests, review and merging: see [CONTRIBUTING.md](CONTRIBUTING.md).
- Project board: the [CENSE backlog in Notion](https://app.notion.com/p/CENSE-e65780cd945383649fc6813e1593290a) holds the user stories, sub-tasks, sprints and status.
- AI Usage Log: [docs/ai-usage-log.md](docs/ai-usage-log.md).
