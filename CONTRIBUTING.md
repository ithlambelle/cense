# Contributing to CENSE

How a piece of work goes from the Notion board to merged code.

## The loop

1. Pick a sub-task from the Notion board.
2. Make a branch from `main`, named for the story and the sub-task: `us06/click-tracking`.
3. Make the change. Keep it to that one sub-task.
4. Run the checks on your laptop: `cd web && npm run check`, and for a change a student would see, the journey tests (see Testing a screen change).
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
- Link the story. Each user story will have one GitHub issue (created once the story revisions are final). Write `Part of #N` in the description, or `Closes #N` on the pull request that finishes the story. Until the issues exist, give the story number.
- Every pull request gets its own preview link from Vercel. Check anything a user would see there before asking for review.

## Review and merge

- One approval from a teammate who is not the author.
- All checks green: `web`, `e2e`, `api-contract`, `secret-scan` and `ios`.
- The author merges after approval and watches that `main` stays green.
- Use "Squash and merge", so each pull request lands on `main` as a single commit.

`main` will be protected so GitHub enforces these rules (a pull request, one approval, passing checks). That is free on a public repository like this one; only a private repository would need GitHub Pro, which the GitHub Student Developer Pack includes. Until it is switched on, follow the rules anyway: no direct pushes to `main`.

## Testing a screen change

Unit tests and a green build do not show that a screen works. On Oct 24 three Home bugs shipped with every check green: a star that did not stay lit after a reload, an "Edit" that opened the wrong screen, and a card that no longer opened its page. Each one shows up only when you use the app as a student. So a change a student would see is done when:

1. **You used it as a student on the local stack** (see the README: `npx supabase start`, the app on :3300). Sign up a fresh account, get it to the state the screen needs, and walk the flow at phone size (390 by 844).
2. **Every control you touched was used, then the page reloaded,** and the result was still there. A save is not done until it survives a reload.
3. **Every link and button you touched was followed** to the screen it should open, and Back returned where the student came from.
4. **The edges were tried:** an empty or bad value, a failed save (offline), a slow load, Back after a save, a second card, a signed-out visit, another student's id.
5. **A journey test in `web/e2e` does what you did,** so CI repeats it on every pull request. It fails on the code before your fix.
6. **The pull request shows the evidence:** what you walked, and screenshots of the screens it changed.

Agents follow the same list. An agent never reports a screen as working because it compiled or matched a Figma frame; it reports what it did as a student and what it saw.

## AI use

- Using AI tools to write code is expected on this team. You are still responsible for everything in your pull request, and you should be able to explain what each change does without the tool.
- In the pull request, say which tool you used and for what, and what you checked by hand. The second part is useful because it tells the reviewer where a person has already looked.
- Commits made with an AI tool keep the tool's `Co-Authored-By` line.
- AI tools work against the dev database only, never production.
- These notes feed the AI Usage Log the course requires: [docs/ai-usage-log.md](docs/ai-usage-log.md).

## Secrets

- Never commit a key, token or password. CI scans every push for them.
- A pre-commit hook also scans what you are about to commit, so a secret is caught on your laptop. It turns on when you run `npm install` in `web/` and needs [gitleaks](https://github.com/gitleaks/gitleaks) (macOS: `brew install gitleaks`). If it flags something that is not a secret, such as a made-up test password, change the value or add `gitleaks:allow` as a comment on that line. Skip the hook only in an emergency: `git commit --no-verify`.
- `web/.env.example` lists the variable names with no values. Copy it to `web/.env.local` and fill in the values from the Supabase dashboard.
- Do not paste keys into Slack or Notion.

## Where things live

| What | Where |
| --- | --- |
| User stories, sub-tasks, sprints, status | Notion backlog |
| Code, pull requests, one issue per story | This repository |
| Architecture and accounts | [README.md](README.md) |
