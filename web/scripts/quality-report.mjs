// Builds one HTML page from the quality suite's output (test-results/quality):
// every screen's screenshot with what was found on it, and a cross-screen view
// that groups every heading, button and card by its exact style, so two
// "primary buttons" that differ sit next to each other. Run after the suite:
//   npm run quality:report   (writes test-results/quality/index.html)
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";

const DIR = "test-results/quality";
if (!existsSync(DIR)) {
  console.log(`${DIR} does not exist: the quality suite did not run.`);
  process.exit(0);
}
const records = readdirSync(DIR)
  .filter((file) => file.endsWith(".json"))
  .flatMap((file) => JSON.parse(readFileSync(`${DIR}/${file}`, "utf8")));

const esc = (value) => String(value ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

// Findings, de-duplicated per screen (the same issue at three sizes is one row with three sizes).
const screens = new Map();
for (const record of records) {
  const key = `${record.persona} / ${record.screen}`;
  const entry = screens.get(key) ?? { key, path: record.path, shot: null, skipped: record.skipped, findings: new Map() };
  if (record.shot) entry.shot = record.shot;
  for (const finding of record.findings) {
    const id = `${finding.level}|${finding.rule}|${finding.detail}|${finding.where ?? ""}`;
    const row = entry.findings.get(id) ?? { ...finding, sizes: [] };
    row.sizes.push(record.viewport);
    entry.findings.set(id, row);
  }
  screens.set(key, entry);
}

const totals = { error: 0, warn: 0 };
const byRule = new Map();
for (const entry of screens.values()) {
  for (const finding of entry.findings.values()) {
    totals[finding.level] += 1;
    byRule.set(`${finding.level} ${finding.rule}`, (byRule.get(`${finding.level} ${finding.rule}`) ?? 0) + 1);
  }
}

// Cross-screen consistency: role -> style -> where it appears.
const roles = new Map();
for (const record of records) {
  for (const sig of record.signatures ?? []) {
    const styles = roles.get(sig.role) ?? new Map();
    const list = styles.get(sig.style) ?? [];
    list.push(`${record.screen}: "${sig.text}"`);
    styles.set(sig.style, list);
    roles.set(sig.role, styles);
  }
}

const findingRows = (entry) =>
  [...entry.findings.values()]
    .sort((a, b) => (a.level === b.level ? a.rule.localeCompare(b.rule) : a.level === "error" ? -1 : 1))
    .map(
      (f) =>
        `<tr class="${f.level}"><td>${f.level}</td><td>${esc(f.rule)}</td><td>${esc(f.detail)}${f.where ? `<br><span class="where">${esc(f.where)}</span>` : ""}</td><td>${f.sizes.join(", ")}</td></tr>`,
    )
    .join("");

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Cense quality report</title>
<style>
:root{--ink:#0f0b2e;--muted:#5b5876;--line:#dcd7eb;--err:#b3261e;--warn:#8a5a00;--bg:#fff;--soft:#f6f5fb}
body{margin:0;font:14px/1.45 system-ui,sans-serif;color:var(--ink);background:var(--bg)}
header{padding:24px 16px;border-bottom:1px solid var(--line)}h1{margin:0 0 4px;font-size:22px}h2{font-size:18px;margin:28px 16px 12px}
.totals span{display:inline-block;margin-right:16px}.err{color:var(--err)}.wrn{color:var(--warn)}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:16px;padding:0 16px 24px}
.screen{border:1px solid var(--line);border-radius:12px;overflow:hidden;background:var(--soft)}
.screen h3{margin:0;padding:10px 12px;font-size:14px;background:#fff;border-bottom:1px solid var(--line)}.screen h3 small{color:var(--muted);font-weight:400}
.shot{max-height:520px;overflow:auto;background:#fff}.shot img{width:100%;display:block}
table{border-collapse:collapse;width:100%;font-size:12px}td{border-top:1px solid var(--line);padding:6px 8px;vertical-align:top}
tr.error td:first-child{color:var(--err);font-weight:600}tr.warn td:first-child{color:var(--warn)}.where{color:var(--muted)}
.ok{padding:8px 12px;color:var(--muted)}.role{margin:0 16px 16px;border:1px solid var(--line);border-radius:12px;padding:12px}
.role.mixed{border-color:var(--warn)}.style{font-family:ui-monospace,monospace;font-size:12px;margin-top:8px}.uses{color:var(--muted);font-size:12px}
ul.rules{columns:2;margin:8px 16px}
</style></head><body>
<header><h1>Cense quality report</h1>
<div class="totals"><span>${screens.size} screens</span><span class="err">${totals.error} errors</span><span class="wrn">${totals.warn} warnings</span><span>Generated ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC</span></div></header>
<h2>Findings by rule</h2><ul class="rules">${[...byRule.entries()].sort().map(([rule, n]) => `<li>${esc(rule)}: ${n}</li>`).join("")}</ul>
<h2>Consistency across screens</h2>
<p style="margin:0 16px 12px;color:var(--muted)">Each element role with every exact style it appears in. A role with more than one style (outlined) is worth a look: either the design differs on purpose, or one screen drifted.</p>
${[...roles.entries()]
  .map(
    ([role, styles]) =>
      `<div class="role${styles.size > 1 ? " mixed" : ""}"><strong>${esc(role)}</strong> (${styles.size} style${styles.size > 1 ? "s" : ""})${[...styles.entries()]
        .sort((a, b) => b[1].length - a[1].length)
        .map(([style, uses]) => `<div class="style">${esc(style)}</div><div class="uses">${uses.length} use${uses.length > 1 ? "s" : ""}: ${esc([...new Set(uses)].slice(0, 6).join("; "))}${uses.length > 6 ? "; …" : ""}</div>`)
        .join("")}</div>`,
  )
  .join("")}
<h2>Every screen</h2><div class="grid">
${[...screens.values()]
  .map(
    (entry) => `<section class="screen"><h3>${esc(entry.key)} <small>${esc(entry.path)}</small></h3>
${entry.skipped ? `<div class="ok">Skipped: ${esc(entry.skipped)}</div>` : ""}
${entry.shot ? `<div class="shot"><img loading="lazy" src="${esc(entry.shot)}" alt="${esc(entry.key)} at 390px"></div>` : ""}
${entry.findings.size ? `<table>${findingRows(entry)}</table>` : entry.skipped ? "" : `<div class="ok">Nothing found.</div>`}</section>`,
  )
  .join("")}
</div></body></html>`;

writeFileSync(`${DIR}/index.html`, html);
console.log(`${DIR}/index.html: ${screens.size} screens, ${totals.error} errors, ${totals.warn} warnings`);
