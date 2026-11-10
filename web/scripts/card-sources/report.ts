import type { Finding } from "./match";

export type CardResult = {
  id: string;
  name: string;
  sourceUrl: string;
  verifiedAt: string;
  status: "ok" | "changed" | "could-not-load";
  findings: Finding[];
  // why the page could not be read, for status could-not-load
  unreadable: string | null;
  // other pages read for this card: the terms it opens or links to
  alsoRead: string[];
  // stored rates skipped because they are marked notReadable
  skipped: string[];
};

export type Summary = { date: string; total: number; ok: number; changed: number; couldNotLoad: number; needsLook: number };

export function summarize(results: CardResult[], date: string): Summary {
  const count = (status: CardResult["status"]) => results.filter((result) => result.status === status).length;
  const changed = count("changed");
  const couldNotLoad = count("could-not-load");
  return { date, total: results.length, ok: count("ok"), changed, couldNotLoad, needsLook: changed + couldNotLoad };
}

const LABEL: Record<Finding["kind"], string> = {
  "rate-missing": "Stored rate not found",
  "bonus-missing": "Stored bonus not found",
  "new-rate": "New rate on the page",
  "new-bonus": "New bonus on the page",
  ended: "Promotion ended",
  "ends-soon": "Promotion ends soon",
  moved: "Page moved",
};

// Page text is quoted, never rendered: no Markdown, links or mentions from it.
function quote(text: string): string {
  return `\`${text.replace(/`/g, "'").replace(/\s+/g, " ").trim()}\``;
}

function renderFinding(finding: Finding): string {
  const lines = [`- **${LABEL[finding.kind]}.** ${finding.note}`];
  if (finding.stored !== null) lines.push(`  - Stored: ${quote(finding.stored)}`);
  if (finding.page !== null) lines.push(`  - Page: ${quote(finding.page)}`);
  return lines.join("\n");
}

function renderCard(result: CardResult): string {
  const lines = [`### ${result.name} (\`${result.id}\`)`, "", `Source: ${result.sourceUrl} (last read ${result.verifiedAt})`];
  if (result.alsoRead.length > 0) lines.push(`Also read: ${result.alsoRead.join(", ")}`);
  lines.push("");
  if (result.unreadable) lines.push(`- **Could not load.** ${result.unreadable}. Open the page in a browser and check it by hand.`);
  lines.push(...result.findings.map(renderFinding));
  return lines.join("\n");
}

export function renderReport(results: CardResult[], date: string): string {
  const summary = summarize(results, date);
  const changed = results.filter((result) => result.status === "changed");
  const unreadable = results.filter((result) => result.status === "could-not-load");
  const ok = results.filter((result) => result.status === "ok");
  const skipped = results.filter((result) => result.skipped.length > 0);

  const parts = [
    `# Card data check, ${date}`,
    "",
    `Checked ${summary.total} cards against their issuer's pages: **${summary.ok} OK**, **${summary.changed} changed**, **${summary.couldNotLoad} could not load**.`,
    "",
    "Each item is a lead, not a verdict. Open the issuer's page, read its words, and change `web/src/lib/cards/rewards.ts` only if the issuer's terms changed. The weekly steps are in `docs/card-data.md`.",
  ];
  if (changed.length > 0) parts.push("", `## Changed (${changed.length})`, "", changed.map(renderCard).join("\n\n"));
  if (unreadable.length > 0) parts.push("", `## Could not load (${unreadable.length})`, "", unreadable.map(renderCard).join("\n\n"));
  parts.push("", `## OK (${ok.length})`, "", ok.length > 0 ? ok.map((result) => result.name).join(", ") : "None.");
  if (skipped.length > 0) {
    parts.push(
      "",
      "<details><summary>Not checked automatically</summary>",
      "",
      "Stored rates the issuer states only where this check cannot read them (web/scripts/card-sources/acknowledged.ts). The 120-day re-read covers them.",
      "",
      ...skipped.map((result) => `- ${result.name}: ${result.skipped.join("; ")}`),
      "",
      "</details>",
    );
  }
  return `${parts.join("\n")}\n`;
}
