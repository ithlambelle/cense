// The quality suite: every screen in every state (e2e/support/screens.ts), at
// three phone sizes, judged the way a careful reviewer would: nothing off the
// screen or under the bottom bar, real fonts and weights, type on the scale,
// copy rules, touch targets, accessibility, console errors and broken links.
// Each screen's screenshot and findings go to test-results/quality/, and
// `npm run quality:report` turns them into one HTML page to review, with a
// cross-screen view of every heading, button and card style.
import { mkdirSync, writeFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { blockExternalRequests } from "./helpers";
import { auditPage, type Finding, type Signature } from "./support/audit";
import { PERSONAS, signIn, type Ids } from "./support/screens";

const OUT = "test-results/quality";
const VIEWPORTS = [
  { name: "320", width: 320, height: 568 },
  { name: "390", width: 390, height: 844 },
  { name: "430", width: 430, height: 932 },
];
const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
// Requests that answer 4xx on purpose: a new student has no saved quiz yet,
// and the not-found screen is a 404 by design.
const EXPECTED_4XX = [/^GET \/api\/v1\/quiz 404$/, /^GET \/this-page-does-not-exist 404$/];

type ScreenRecord = {
  persona: string;
  screen: string;
  viewport: string;
  path: string;
  shot?: string;
  skipped?: string;
  findings: Finding[];
  signatures: Signature[];
};

mkdirSync(OUT, { recursive: true });
const checkedLinks = new Map<string, number>();

async function visit(page: Page, path: string) {
  const problems: string[] = [];
  const onConsole = (m: { type(): string; text(): string }) => {
    if (m.type() === "error" && !/Failed to load resource/.test(m.text())) problems.push(`console: ${m.text().slice(0, 160)}`);
  };
  const onError = (e: Error) => problems.push(`page error: ${e.message.slice(0, 160)}`);
  const onResponse = (r: { url(): string; status(): number; request(): { method(): string } }) => {
    const url = new URL(r.url());
    if (url.hostname !== "localhost" || r.status() < 400) return;
    const line = `${r.request().method()} ${url.pathname} ${r.status()}`;
    if (!EXPECTED_4XX.some((pattern) => pattern.test(line))) problems.push(`request: ${line}`);
  };
  page.on("console", onConsole);
  page.on("pageerror", onError);
  page.on("response", onResponse);
  const response = await page.goto(path);
  await page.waitForLoadState("networkidle").catch(() => {});
  return {
    status: response?.status() ?? 0,
    done() {
      page.off("console", onConsole);
      page.off("pageerror", onError);
      page.off("response", onResponse);
      return problems;
    },
  };
}

for (const persona of PERSONAS) {
  test(`quality: ${persona.name}`, async ({ page, context }, testInfo) => {
    testInfo.setTimeout(240_000);
    await blockExternalRequests(context);
    let ids: Ids = {};
    if (persona.signedIn) {
      await page.goto("/sign-in");
      await signIn(page, persona.name);
      ids = (await persona.setup?.(page)) ?? {};
    }
    const records: ScreenRecord[] = [];

    for (const screen of persona.screens) {
      const path = screen.path(ids);
      for (const viewport of VIEWPORTS) {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        const record: ScreenRecord = { persona: persona.name, screen: screen.name, viewport: viewport.name, path, findings: [], signatures: [] };
        records.push(record);
        const visitResult = await visit(page, path);
        if (screen.optional && visitResult.status === 404) {
          visitResult.done();
          record.skipped = "route not on this branch";
          break;
        }
        if (screen.act) {
          try {
            await screen.act(page);
          } catch {
            visitResult.done();
            record.skipped = "the control this state needs is not on this branch";
            break;
          }
        }
        await expect(page.locator("h1, [role=dialog]").first()).toBeVisible();
        if (viewport.name === "390") {
          record.shot = `${persona.name}--${screen.name}.png`;
          await page.screenshot({ path: `${OUT}/${record.shot}`, fullPage: true });
        }
        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
        const audit = await auditPage(page);
        record.findings.push(...audit.findings);
        if (viewport.name === "390") record.signatures.push(...audit.signatures);
        if (viewport.name === "390") {
          // Still scrolled to the end: content under the fixed bar at the top of the
          // page is not obscured once a student scrolls to it.
          const axe = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
          for (const violation of axe.violations) {
            record.findings.push({
              rule: `a11y:${violation.id}`,
              level: "error",
              detail: violation.help,
              where: violation.nodes.map((node) => node.target.join(" ")).slice(0, 3).join(", "),
            });
          }
          const hrefs = await page.locator("a[href^='/']").evaluateAll((links) => [...new Set(links.map((a) => a.getAttribute("href") ?? ""))]);
          for (const href of hrefs) {
            if (!checkedLinks.has(href)) checkedLinks.set(href, (await page.request.get(href, { maxRedirects: 0 })).status());
            const status = checkedLinks.get(href) ?? 0;
            if (status >= 400) record.findings.push({ rule: "broken-link", level: "error", detail: `${href} answers ${status}` });
          }
        }
        await page.evaluate(() => window.scrollTo(0, 0));
        for (const problem of visitResult.done()) record.findings.push({ rule: "runtime", level: "error", detail: problem });
        // Written after every screen, so a run that stops early still reports what it saw.
        writeFileSync(`${OUT}/${persona.name}.json`, JSON.stringify(records, null, 2));
      }
    }

    for (const record of records) {
      for (const finding of record.findings.filter((f) => f.level === "error")) {
        expect.soft(finding, `${record.screen} at ${record.viewport}px: ${finding.rule}`).toBeUndefined();
      }
    }
  });
}
