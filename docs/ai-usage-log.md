# AI Usage Log

The course requires that AI use in our process is disclosed and logged. This file is that log.

## How it works

- **Code.** Every pull request has an "AI use" section saying which tool was used, what it did, and what a person checked by hand. Those sections are the record for code. See the [merged pull requests](https://github.com/ithlambelle/cense/pulls?q=is%3Apr+is%3Amerged).
- **Everything else** (stories, research, design, copy) is logged in the table below, one line per piece of work, by whoever did it.
- Whoever submits the work is responsible for it being correct, secure and explainable, whatever tool helped write it.

## Tools the team uses

| Tool | Used for |
| --- | --- |
| Claude Code | Writing and reviewing code and documentation, diagnosing CI failures, revising user stories |

Add a row when you start using another tool.

## Work outside pull requests

| Date | Who | Tool | What it did | What a person checked |
| --- | --- | --- | --- | --- |
| 2026-10-03 | Ben | Claude Code | Revised the user stories in the Master User Story Doc in response to the TA's feedback | Ben made each decision; every edit was re-read against the doc after it was applied; teammates asked to review the stories they wrote |
| 2026-10-03 | Ben | Claude Code | Wrote the skill that loads the user stories into the Notion backlog | The reading step was run against the real doc and its counts checked (11 stories, 45 sub-tasks); the Notion-writing step has not been run yet |

## Work in pull requests so far

| Pull request | Tool | What it did | What a person checked |
| --- | --- | --- | --- |
| #1 CI fix | Claude Code | Found the two causes of the failing check and prepared the two-file fix | Reproduced from a fresh clone; all checks passed on GitHub before merge; reviewed by Ben |
| #2 README, CONTRIBUTING, template | Claude Code | Drafted the documents from the team's recorded stack decisions | Diagram rendered to confirm it is valid; Ben reviewed and edited the text |
