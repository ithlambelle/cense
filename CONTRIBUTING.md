# Contributing to CENSE

How a piece of work goes from the Notion board to merged code.

## The loop

1. Pick a sub-task from the Notion board.
2. Make a branch from `main`, named for the story and the sub-task: `us06/click-tracking`.
3. Make the change. Keep it to that one sub-task.
4. Run the checks on your laptop: `cd web && npm run check`.
5. Push the branch and open a pull request into `main`. Fill in the template.
6. Wait for the checks to go green and for one teammate to approve.
7. Merge it yourself with "Squash and merge", then delete the branch.
8. Move the sub-task to Done in Notion.

## Branching

- `main` is the official version of the code. It is what gets deployed, so it should always work.
- All work happens on short-lived branches that come off `main` and merge back within a day or two. There is no long-running `dev` branch.
- Branch names start with the story number: `us01/quiz-flow`, `us08/reminder-engine`, `us11/fix-ci`.

## Pull requests

- One pull request per sub-task. A user story is several pull requests, never one.
- Keep them small. Around 100 changed lines is comfortable to review; 1,000 is usually too large. A big sub-task can be split into two pull requests.
- Title: the story number, then what changed. Example: `US-06: click tracking`.
- Link the story. Each user story will have one GitHub issue (created once the story revisions are final). Write `Part of #N` in the description, or `Closes #N` on the pull request that finishes the story. Until the issues exist, give the story number and its Notion link.
- Every pull request gets its own preview link from Vercel. Check anything a user would see there before asking for review.

## Review and merge

- One approval from a teammate who is not the author.
- All checks green: `web`, `api-contract`, `secret-scan` and `ios`.
- The author merges after approval and watches that `main` stays green.
- Use "Squash and merge", so each pull request lands on `main` as a single commit.

`main` will be protected so GitHub enforces these rules (a pull request, one approval, passing checks). That needs GitHub Pro on the owner's account. Until it is switched on, follow the rules anyway: no direct pushes to `main`.

## Secrets

- Never commit a key, token or password. CI scans every push for them.
- `web/.env.example` lists the variable names with no values. Copy it to `web/.env.local` and fill in the values from the Supabase dashboard.
- Do not paste keys into Slack or Notion.

## Where things live

| What | Where |
| --- | --- |
| User stories, sub-tasks, sprints, status | Notion backlog |
| Code, pull requests, one issue per story | This repository |
| Architecture and accounts | [README.md](README.md) |
