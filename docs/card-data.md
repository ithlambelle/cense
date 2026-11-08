# Keeping card data current

Created with Claude Code (2026-11-07).

Every rate and sign-up bonus a card page shows comes from `web/src/lib/cards/rewards.ts`, read on the issuer's own page. Issuers change them without notice. Three checks find that for us, so one person can keep all 53 cards correct in about 15 minutes a week. Who owns the loop is the team's call; the natural fit is whoever owns the card data.

## What runs without anyone

| Check | When | What it does |
| --- | --- | --- |
| Card data check (`.github/workflows/card-data-check.yml`, `web/scripts/check-card-sources.ts`) | Mondays at 13:00 UTC (8 or 9am Eastern), or by hand: Actions, Card data check, Run workflow | Opens every card's `sourceUrl` in a browser, once, and compares it with the stored data. Opens or updates one issue, "Card data check: N cards need a look", and closes it when every card is OK. Never edits the data or commits. |
| Promotion end dates (`rewards.test.ts`) | Every `npm run check`, so every pull request | Fails once a rate or bonus is past its `expiresOn`, the last day the issuer states. An ended promotion cannot ship. |
| Re-read reminder (`rewards.test.ts`) | Every `npm run check` | Prints, without failing, each card whose `verifiedAt` is more than 120 days old. |

What the weekly check reports for each card:

- **Stored rate not found:** a rate's figure (or its first-year figure) is no longer on the page or its rewards terms near the words of its category.
- **Stored bonus not found:** the bonus amount, the spend needed or the bonus points are gone.
- **New rate on the page:** a percent or points-per-dollar figure next to reward words that the card's data has nowhere.
- **New bonus on the page:** a dollar or points sign-up bonus the data does not have.
- **Promotion ends soon / ended:** an `expiresOn` within 30 days, or past.
- **Page moved:** the source page now redirects, often because the card was renamed or withdrawn.
- **Could not load:** the issuer's bot protection or an outage. Nothing was checked; open the page yourself.

It is built to stay quiet: a stored figure only has to appear somewhere on the page or its terms near a word from its category, and wording and layout changes are ignored. It reads the card's page and the rewards terms the page opens in a pop-up, and reads the terms page a card links to (Bank of America's Terms and Conditions, Chime's addendum) only when something is missing from the page. Each run's report and the text of every page it read are kept as the run's artifact for 30 days.

## The weekly 15 minutes

1. **Open the issue** "Card data check: N cards need a look". No open issue means every card checked OK, and you are done.
2. **For each card listed, open its source page** (and the terms page the item names) and find what the issuer says now. Each item quotes the stored value and the page's words.
3. **If the issuer changed something,** edit that card in `rewards.ts` in the issuer's own words and set that card's `verifiedAt` to today's date (`verifiedAt: "2026-11-16"`, not the shared `READ` constant, which would claim every card was re-read). If the issuer names a last day, put it in `expiresOn` (`"through 09/30/2027"` is `"2027-09-30"`).
4. **If the item is a false alarm** (another card's rate in an upgrade sentence, an award name), add it to `web/scripts/card-sources/acknowledged.ts` with the reason, so it is not raised again. A rate the issuer states only where the check cannot read it goes there too, under `notReadable`.
5. **If a card could not load,** open the page in your own browser. It is usually the issuer blocking the runner, not a change; nothing to do if the page still matches.
6. **Run the tests and open a pull request:** `cd web && npm run check`, then a branch like `us01/card-data-2026-11-16` with what changed and the issuer's words. The next Monday's run closes the issue once every card is OK, or close it by hand.

To check a few cards yourself before opening the pull request:

```bash
cd web
npx playwright install chromium   # once
npx tsx scripts/check-card-sources.ts --only chase-freedom-unlimited,citi-double-cash
```

`--channel chrome` uses your installed Google Chrome instead. `--save-pages DIR` keeps what was read and `--from-pages DIR` re-checks it without opening any page, which is how to tune the check without visiting issuers again.

## Being a good visitor

The check reads public pages only and never signs in. It visits each page once per run with a pause of about four seconds between visits, asks for no images, video or fonts, and uses an ordinary desktop browser's user agent. If an issuer blocks it, it reports "could not load" and stops there; it never tries to get around bot protection.

## Setup

- The workflow needs no secrets: it uses the run's own `GITHUB_TOKEN` with `issues: write`.
- Issues must be turned on for the repository (Settings, General, Features).
- Scheduled runs only start from the default branch, so the check begins once this is merged to `main`. GitHub pauses scheduled workflows in a public repository after 60 days without activity; re-enable it on the Actions tab if that happens.
