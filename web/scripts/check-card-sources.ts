// The weekly card data check (docs/card-data.md). Opens every card's issuer
// page (sourceUrl in src/lib/cards/rewards.ts) in a real browser, once, and
// reports per card: OK, changed (a stored rate or bonus is no longer on the
// page, a new reward figure appeared, a dated promotion is ending) or could
// not load. It never edits the data and always exits 0: it reports, people
// decide.
//
//   cd web && npx tsx scripts/check-card-sources.ts --out card-check.md
//
// Options:
//   --out FILE          write the Markdown report here (default: print it)
//   --summary FILE      write the counts as JSON (for the GitHub Action)
//   --only ID,ID        check only these cards
//   --save-pages DIR    keep what was read, one JSON file per page
//   --from-pages DIR    re-check from saved pages without opening any page
//   --channel chrome    use the installed Google Chrome instead of
//                       Playwright's Chromium (npx playwright install chromium)
//   --delay MS          pause between pages (default 4000)
//
// It reads public pages only: no sign-in, one visit per page, a pause
// between visits, images and fonts never requested. A page that blocks it is
// reported as could not load; it never tries to get around that.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

import cards from "../src/lib/cards/cards.json";
import { CARD_REWARDS } from "../src/lib/cards/rewards";
import { ACKNOWLEDGED } from "./card-sources/acknowledged";
import { openFetcher, unreadableReason, type Fetcher, type PageText } from "./card-sources/fetch";
import { checkCard, missingFromText, notReadable, notReadableWhy } from "./card-sources/match";
import { renderReport, summarize, type CardResult } from "./card-sources/report";

const { values: args } = parseArgs({
  options: {
    out: { type: "string" },
    summary: { type: "string" },
    only: { type: "string" },
    "save-pages": { type: "string" },
    "from-pages": { type: "string" },
    channel: { type: "string" },
    delay: { type: "string", default: "4000" },
  },
});

// Links to the card's own terms, read only when a stored figure is not on the
// card's page: Bank of America's "Terms and Conditions", Chime's Cash Rewards
// Program Addendum, American Express's "Offer & Benefit Terms".
const TERMS_LINK =
  /rewards terms|rewards program (?:terms|agreement|addendum)|cash rewards program addendum|terms (?:&|and) conditions for|^terms (?:&|and) conditions$|offer (?:&|and) benefit terms|pricing (?:&|and) terms|^additional (?:card )?information$|rates (?:&|and) fees/i;
const NOT_CARD_TERMS = /terms-of-use|terms-of-service|website-rules|digital\/terms-conditions|privacy|sms-terms|online-banking|\/policies\/?$|\.pdf(?:$|[?#])/i;

function termsLinks(page: PageText): string[] {
  const site = (url: string) => new URL(url).hostname.split(".").slice(-2).join(".");
  const urls: string[] = [];
  for (const link of page.links) {
    if (!TERMS_LINK.test(link.text) || !/^https:\/\//.test(link.href) || NOT_CARD_TERMS.test(link.href)) continue;
    if (site(link.href) !== site(page.finalUrl || page.url)) continue;
    const url = link.href.replace(/#.*$/, "");
    if (url !== page.url.replace(/#.*$/, "") && !urls.includes(url)) urls.push(url);
  }
  return urls.slice(0, 2);
}

const fileFor = (dir: string, url: string) => path.join(dir, `${createHash("sha1").update(url).digest("hex").slice(0, 12)}.json`);

function today(): string {
  // The check runs on Monday morning Eastern time; date it there.
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function displayName(id: string): string {
  const card = cards.find((entry) => entry.id === id);
  if (!card) return id;
  return card.name.startsWith(card.brand) ? card.name : `${card.brand} ${card.name}`;
}

async function main() {
  const date = today();
  const only = args.only?.split(",").map((id) => id.trim());
  const entries = Object.entries(CARD_REWARDS).filter(([id]) => !only || only.includes(id));
  const fromDir = args["from-pages"];
  const saveDir = args["save-pages"];
  if (saveDir) mkdirSync(saveDir, { recursive: true });

  let fetcher: Fetcher | null = null;
  const pages = new Map<string, Promise<PageText>>();
  const getPage = (url: string): Promise<PageText> => {
    const cached = pages.get(url);
    if (cached) return cached;
    const loading = (async (): Promise<PageText> => {
      if (fromDir) {
        const file = fileFor(fromDir, url);
        if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8")) as PageText;
        return {
          url,
          finalUrl: url,
          status: null,
          title: "",
          visibleText: "",
          fullText: "",
          termsText: "",
          termsFrom: [],
          links: [],
          error: "the page is not in the saved pages",
          fetchedAt: "",
        };
      }
      fetcher ??= await openFetcher({ channel: args.channel, delayMs: Number(args.delay) });
      const started = Date.now();
      const page = await fetcher.load(url);
      if (saveDir) writeFileSync(fileFor(saveDir, url), JSON.stringify(page));
      console.error(`read ${url} in ${Math.round((Date.now() - started) / 1000)}s: ${unreadableReason(page) ?? "ok"}`);
      return page;
    })();
    pages.set(url, loading);
    return loading;
  };

  const results: CardResult[] = [];
  try {
    for (const [id, rewards] of entries) {
      const acknowledged = ACKNOWLEDGED[id] ?? {};
      const base = { id, name: displayName(id), sourceUrl: rewards.sourceUrl, verifiedAt: rewards.verifiedAt };
      const page = await getPage(rewards.sourceUrl);
      const unreadable = unreadableReason(page);
      if (unreadable) {
        results.push({ ...base, status: "could-not-load", findings: [], unreadable, alsoRead: [], skipped: [] });
        continue;
      }

      // The page, plus the terms its pop-ups opened. If a stored figure is
      // still missing, read the terms pages it links to as well.
      let fullText = `${page.fullText}\n${page.termsText}`;
      const alsoRead = [...page.termsFrom];
      const stillMissing = () => missingFromText(rewards, fullText).filter((finding) => !notReadable(finding, acknowledged));
      if (stillMissing().length > 0) {
        for (const url of termsLinks(page)) {
          const terms = await getPage(url);
          if (unreadableReason(terms)) continue;
          fullText += `\n${terms.fullText}\n${terms.termsText}`;
          alsoRead.push(url, ...terms.termsFrom);
          if (stillMissing().length === 0) break;
        }
      }

      const findings = checkCard(
        rewards,
        { visibleText: page.visibleText, fullText, requestedUrl: rewards.sourceUrl, finalUrl: page.finalUrl },
        date,
        acknowledged,
      );
      const skipped = missingFromText(rewards, fullText)
        .filter((finding) => notReadable(finding, acknowledged))
        .map((finding) => `${finding.stored} (${notReadableWhy(finding, acknowledged)})`);
      results.push({ ...base, status: findings.length > 0 ? "changed" : "ok", findings, unreadable: null, alsoRead: [...new Set(alsoRead)], skipped });
    }
  } finally {
    // TypeScript cannot see the assignment inside getPage.
    await (fetcher as Fetcher | null)?.close();
  }

  // A promotion ending soon is worth a look even when the page could not load.
  for (const result of results) {
    if (result.status !== "could-not-load") continue;
    const rewards = CARD_REWARDS[result.id];
    result.findings = checkCard(rewards, emptyPage(rewards.sourceUrl), date).filter((finding) => finding.kind === "ended" || finding.kind === "ends-soon");
  }

  const report = renderReport(results, date);
  if (args.out) writeFileSync(args.out, report);
  else process.stdout.write(report);
  const summary = summarize(results, date);
  if (args.summary) writeFileSync(args.summary, `${JSON.stringify(summary, null, 2)}\n`);
  console.error(`Card data check ${date}: ${summary.ok} OK, ${summary.changed} changed, ${summary.couldNotLoad} could not load.`);
}

// A page with no text, for date checks on a card whose page did not load.
function emptyPage(url: string) {
  return { visibleText: "", fullText: "", requestedUrl: url, finalUrl: url };
}

main().catch((error: unknown) => {
  // Still exit 0: a broken run is reported, never a failed build. The Action
  // notices the missing summary and says so in the issue.
  console.error(error);
});
