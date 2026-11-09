import type { CardRewards, RewardRate, SignUpBonus } from "../../src/lib/cards/rewards";

// Compares one card's stored rewards with the text of its issuer's page. It
// is built to stay quiet: a stored figure only has to appear somewhere on the
// page (or the terms it links to) near a word from its category, and a figure
// counts as new only when it is a reward rate in the page's own visible text
// that the stored data has nowhere. Layout, wording and unrelated changes are
// ignored. Every finding is a lead for a person, never a verdict.

export type Finding = {
  kind: "rate-missing" | "bonus-missing" | "new-rate" | "new-bonus" | "ended" | "ends-soon" | "moved";
  // the stored value it concerns, in words, or null for something only on the page
  stored: string | null;
  // what the page says, a short excerpt, or null when there is nothing to quote
  page: string | null;
  note: string;
};

export type CardPage = {
  // what a reader sees on the card's page, without the site's menus
  visibleText: string;
  // all of the card page's text, plus any terms page it links to
  fullText: string;
  requestedUrl: string;
  finalUrl: string;
};

// What a person has already looked at for one card, so the weekly report
// does not raise it again (web/scripts/card-sources/acknowledged.ts).
export type Acknowledged = {
  // A figure on the page that is not this card's reward: another card's rate
  // in an upgrade or comparison sentence, an award name. `context` is a few
  // words from the page around it; the finding is dropped only when both
  // match, so the same figure in new wording is reported again.
  notThisCard?: { figure: string; context: string; why: string }[];
  // A stored figure the issuer states only where this check cannot read it
  // (a pop-up that loads on click, a PDF). `figure` and `category` must both
  // match the stored rate, so editing the rate brings the check back.
  notReadable?: { figure: string; category: string; why: string }[];
};

export function normalize(text: string): string {
  return text
    .replace(/[®™℠©]/g, "")
    .replace(/[    ]/g, " ")
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[‐-―−]/g, "-")
    .replace(/×/g, "x")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n[\s]*/g, "\n");
}

// "1.5" also matches "1.50"; never part of a longer number ("15", "2.5").
function numberPattern(amount: number): string {
  const [whole, fraction] = String(amount).split(".");
  return `(?<![\\d.,])${whole}${fraction ? `\\.${fraction}0?` : "(?:\\.0+)?"}(?![\\d,]|\\.\\d)`;
}

// The ways an issuer writes a rate in its unit: "3%" or "3 percent" for cash
// back; "3X", "3 points per $1" or "3 miles" for points. Units never cross, so
// another card's "4X points at supermarkets" on the page cannot stand in for
// a stored 4%.
function ratePattern(amount: number, unit: RewardRate["unit"]): RegExp {
  const written = unit === "percent" ? "%|percent\\b" : "x(?![a-z])|(?:\\s(?:total|bonus|base|[A-Z][A-Za-z]*))?\\s(?:points?|miles?)\\b";
  return new RegExp(`${numberPattern(amount)}\\s?(?:${written})`, "gi");
}

// "$1,000", "$1000", "$1,000.00", "$ 50"
function dollarPattern(cents: number): RegExp {
  const dollars = cents / 100;
  const whole = Math.floor(dollars);
  const grouped = whole.toLocaleString("en-US").replace(/,/g, ",?");
  const fraction = Number.isInteger(dollars) ? "(?:\\.00)?" : `\\.${String(Math.round((dollars - whole) * 100)).padStart(2, "0")}`;
  return new RegExp(`\\$\\s?${grouped}${fraction}(?![\\d,]|\\.\\d)`, "g");
}

const STOPWORDS = new Set(
  (
    "a an the and or of on in at to for with from by as is are be you your each every all other any one two three your own " +
    "purchase purchases eligible made bought through via including includes include like choose chosen category categories " +
    "select selected that this these those it its plus more most up only per new card cards everyday different places " +
    "change changes quarter quarterly month monthly year shop booked directly products services product service " +
    "capital chase citi discover bank america wells fargo apple chime amex american express us u.s usbank"
  ).split(" "),
);

// Words from a stored category worth finding near the figure, as patterns:
// "Hotels, vacation rentals and rental cars booked through Capital One
// Travel" gives hotel, vacat, renta, cars?, trave. A long word is matched by
// its first five letters, so "groceries" finds "grocery"; a short one only as
// a whole word, so "app" never matches "Apply".
export function keywordStems(category: string): string[] {
  const words = category
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((word) => word.length >= 3 && !STOPWORDS.has(word));
  return [...new Set(words.map((word) => (word.length > 5 ? word.slice(0, 5) : `${word.length > 3 ? word.replace(/s$/, "") : word}s?\\b`)))];
}

const BASE_RATE_WORDS = ["purch", "everything\\b", "every\\b", "all\\b", "other\\b", "everyday\\b", "spend"];

function hasStemNear(text: string, start: number, end: number, stems: string[], reach = 250): boolean {
  const window = text.slice(Math.max(0, start - reach), end + reach).toLowerCase();
  return stems.some((stem) => new RegExp(`\\b${stem}`).test(window));
}

export function excerpt(text: string, start: number, end: number, reach = 110): string {
  let from = Math.max(0, start - reach);
  let to = Math.min(text.length, end + reach);
  // Start and end on a word boundary.
  if (from > 0) from = text.indexOf(" ", from) + 1 || from;
  if (to < text.length) to = text.lastIndexOf(" ", to) > end ? text.lastIndexOf(" ", to) : to;
  const body = text.slice(from, to).replace(/\s+/g, " ").trim();
  return `${from > 0 ? "..." : ""}${body}${to < text.length ? "..." : ""}`;
}

function formatRate(rate: Pick<RewardRate, "amount" | "unit">, amount = rate.amount): string {
  return rate.unit === "percent" ? `${amount}%` : `${amount}X`;
}

// --- Stored rates and bonus still on the page -------------------------------

function checkRate(rate: RewardRate, text: string, quoteFrom: string): Finding[] {
  const stems = rate.earnsOn === "all" ? BASE_RATE_WORDS : keywordStems(rate.category);
  const findings: Finding[] = [];
  const amounts = [rate.amount, ...(rate.yearOneAmount !== null ? [rate.yearOneAmount] : [])];
  for (const amount of amounts) {
    const stored = `${formatRate(rate, amount)} on "${rate.category}"${amount === rate.yearOneAmount ? " in the first year" : ""}`;
    const matches = [...text.matchAll(ratePattern(amount, rate.unit))];
    if (matches.length === 0) {
      findings.push({
        kind: "rate-missing",
        stored,
        page: nearbyRate(quoteFrom, stems) ?? nearbyRate(text, stems),
        note: `${formatRate(rate, amount)} is not on the page or its terms.`,
      });
      continue;
    }
    const near = matches.some((match) => hasStemNear(text, match.index, match.index + match[0].length, stems.length > 0 ? stems : BASE_RATE_WORDS));
    if (!near) {
      const first = matches[0];
      findings.push({
        kind: "rate-missing",
        stored,
        page: excerpt(text, first.index, first.index + first[0].length),
        note: `${formatRate(rate, amount)} is on the page, but never near the words of its category.`,
      });
    }
  }
  return findings;
}

// Where the page talks about this category with a rate, to show what it says now.
function nearbyRate(text: string, stems: string[]): string | null {
  const lower = text.toLowerCase();
  for (const stem of stems) {
    for (const match of lower.matchAll(new RegExp(`\\b${stem}`, "g"))) {
      const window = text.slice(Math.max(0, match.index - 120), match.index + 120);
      if (/\d\s?(?:%|x\b|points|miles)/i.test(window)) return excerpt(text, match.index, match.index + match[0].length);
    }
  }
  return null;
}

function bonusPoints(summary: string): string[] {
  return [...summary.matchAll(/(\d{1,3}(?:,\d{3})+|\d{4,})\s+(?:online\s+)?(?:bonus\s+)?(?:points|miles)\b/gi)].map((match) => match[1]);
}

// Words around a sign-up bonus, so a stray "$200" elsewhere does not count.
const BONUS_WORDS = /bonus|welcome offer|statement credit|cash back|rewards|earn|spend|purchases/i;

function hasDollarsNearBonusWords(text: string, cents: number): boolean {
  return [...text.matchAll(dollarPattern(cents))].some((match) =>
    BONUS_WORDS.test(text.slice(Math.max(0, match.index - 150), match.index + match[0].length + 150)),
  );
}

function checkBonus(bonus: SignUpBonus, text: string, quoteFrom: string): Finding[] {
  const findings: Finding[] = [];
  const missing = (what: string, note: string) =>
    findings.push({ kind: "bonus-missing", stored: `${what} (bonus: "${bonus.summary}")`, page: nearbyBonus(quoteFrom) ?? nearbyBonus(text), note });
  if (bonus.valueCents !== null && !hasDollarsNearBonusWords(text, bonus.valueCents)) {
    missing(`$${(bonus.valueCents / 100).toLocaleString("en-US")} bonus`, "The bonus amount is not on the page or its terms.");
  }
  if (bonus.spendCents !== null && !hasDollarsNearBonusWords(text, bonus.spendCents)) {
    missing(`$${(bonus.spendCents / 100).toLocaleString("en-US")} to spend`, "The spending needed for the bonus is not on the page or its terms.");
  }
  for (const points of bonusPoints(bonus.summary)) {
    if (!new RegExp(`(?<![\\d,])${points.replace(/,/g, ",?")}(?![\\d,])`).test(text))
      missing(`${points} bonus points`, "The bonus points are not on the page or its terms.");
  }
  if (
    bonus.valueCents === null &&
    bonus.spendCents === null &&
    bonusPoints(bonus.summary).length === 0 &&
    /\bmatch/i.test(bonus.summary) &&
    !/\bmatch/i.test(text)
  ) {
    missing("first-year match", "The first-year match is not on the page or its terms.");
  }
  return findings;
}

// Where the page states a bonus with a figure, to show what it offers now.
function nearbyBonus(text: string): string | null {
  for (const match of text.matchAll(/\b(?:bonus|welcome offer|new cardmember offer)\b/gi)) {
    const window = text.slice(Math.max(0, match.index - 80), match.index + 80);
    if (/\$\s?\d|\d{1,3},\d{3}/.test(window)) return excerpt(text, match.index, match.index + match[0].length);
  }
  return null;
}

// --- New figures on the page -------------------------------------------------

// Figures the stored data already has for this card, in any of its words.
export function knownFigures(rewards: CardRewards): { rates: Set<number>; dollars: Set<number>; points: Set<number> } {
  const rates = new Set<number>();
  const dollars = new Set<number>();
  const points = new Set<number>();
  const words: string[] = [];
  for (const rate of rewards.rates) {
    rates.add(rate.amount);
    if (rate.yearOneAmount !== null) rates.add(rate.yearOneAmount);
    if (rate.cap) dollars.add(rate.cap.cents / 100);
    words.push(rate.category, rate.condition ?? "", rate.requires ?? "");
  }
  if (rewards.bonus) {
    if (rewards.bonus.valueCents !== null) dollars.add(rewards.bonus.valueCents / 100);
    if (rewards.bonus.spendCents !== null) dollars.add(rewards.bonus.spendCents / 100);
    words.push(rewards.bonus.summary);
  }
  for (const text of words) {
    for (const match of text.matchAll(/(?<![\d.,])(\d{1,2}(?:\.\d{1,2})?)\s?(?:%|x\b|(?:\s\w+)?\s(?:points?|miles?)\b)/gi)) rates.add(Number(match[1]));
    for (const match of text.matchAll(/\$\s?(\d[\d,]*(?:\.\d{2})?)/g)) dollars.add(Number(match[1].replace(/,/g, "")));
    for (const count of bonusPoints(text)) points.add(Number(count.replace(/,/g, "")));
  }
  return { rates, dollars, points };
}

// A percent or points-per-dollar figure, 12 or under (no card earns more;
// "50% off" and "70% of reviewers" are larger), in a line about rewards.
const RATE_FIGURE =
  /(?<![\d.,$])(\d{1,2}(?:\.\d{1,2})?)\s?(?:%|percent\b|x(?![a-z0-9])|(?:\s(?:total|bonus|base|[A-Z][A-Za-z]*))?\s(?:points?|miles?)\s(?:per|for every|on every|for each|on each)\b)/gi;
const REWARD_WORDS = /cash ?back|\bpoints?\b|\bmiles?\b|\brewards?\b|\bearn/i;
// Not an earn rate: APRs and fees, "% of" a balance, discounts, savings,
// "25% more rewards" multipliers, review scores.
const NOT_A_RATE_AFTER =
  /^\s?(?:%|percent|x)?\s*(?:-\s*\d|to \d|APR|variable|intro|of (?:the|your|each|its|their|a|all|new|balance|purchases)\b|off\b|more\b|discount|savings|minimum|fee|interest|balance transfer|cash advance|foreign|penalty|of reviewers|of customers|winner|award)/i;
const NOT_A_RATE_NEAR =
  /\bAPR\b|interest|balance transfer|cash advance|foreign transaction|late fee|penalty|minimum payment|reviewers|\boff\b|discount|you(?:'d| would)? save|savings|\bmore rewards\b|\bmore on every\b|% more|tip\b/i;

// A line about another product: an upgrade, a cross-sell, a question.
const OTHER_PRODUCT = /\?\s*$|^\s*(?:looking for|explore cards|compare cards|you (?:may|might) also)|cards? that (?:offer|earn|gets?)|\bupgrade\b/i;

// A card comparison or "more cards" section lists other cards' rates. It runs
// from a heading like "More from" or "Compare cards" to the next "Compare
// these cards" or "Frequently asked questions", at most 40 lines.
const OTHER_CARDS_START = /^\s*(?:more from\b|more cards\b|compare (?:similar |other |more )?cards\b|you (?:may|might) also like|similar cards\b|other cards\b|explore (?:other|more) cards\b)/i;
const OTHER_CARDS_END = /^\s*(?:compare these cards|frequently asked questions)/i;

// The page's lines, without its card comparison sections.
export function ownLines(visibleText: string): string[] {
  const lines: string[] = [];
  let skipping = 0;
  for (const line of visibleText.split("\n")) {
    if (skipping > 0) {
      skipping = OTHER_CARDS_END.test(line) ? 0 : skipping - 1;
      continue;
    }
    if (OTHER_CARDS_START.test(line)) {
      skipping = 40;
      continue;
    }
    lines.push(line);
  }
  return lines;
}

export function newFigures(rewards: CardRewards, visibleText: string, acknowledged: Acknowledged["notThisCard"] = []): Finding[] {
  const known = knownFigures(rewards);
  // "1 base point plus 3 bonus points" and "an additional 4%" on top of the
  // base rate: a part of a stored rate, not a new one.
  const base = rewards.rates.find((rate) => rate.earnsOn === "all")?.amount ?? 1;
  const findings: Finding[] = [];
  const seen = new Set<string>();
  for (const line of ownLines(visibleText)) {
    if (!REWARD_WORDS.test(line) || OTHER_PRODUCT.test(line)) continue;
    for (const match of line.matchAll(RATE_FIGURE)) {
      const value = Number(match[1]);
      if (value <= 0 || value > 12 || known.rates.has(value) || known.rates.has(value + base)) continue;
      const after = line.slice(match.index + match[1].length, match.index + match[0].length + 30);
      if (NOT_A_RATE_AFTER.test(after)) continue;
      const near = line.slice(Math.max(0, match.index - 45), match.index + match[0].length + 45);
      if (NOT_A_RATE_NEAR.test(near) || !REWARD_WORDS.test(line.slice(Math.max(0, match.index - 80), match.index + match[0].length + 80))) continue;
      const figure = /x/i.test(match[0].slice(match[1].length)) || /points?|miles?/i.test(match[0]) ? `${value}X` : `${value}%`;
      const page = excerpt(line, match.index, match.index + match[0].length, 90);
      if (isAcknowledged(acknowledged, figure, page) || seen.has(`${figure}|${page}`)) continue;
      seen.add(`${figure}|${page}`);
      findings.push({ kind: "new-rate", stored: null, page, note: `${figure} reads as a reward rate, and the stored data has no ${figure} for this card.` });
    }
  }
  return dedupeByFigure(findings);
}

// A dollar or points sign-up bonus in the page's visible text that the stored
// data does not have (for a card stored with no bonus, any bonus).
const BONUS_LINE = /\bbonus\b|welcome offer|new cardmember offer|(?:after|once|when) you spend|in the first \d+ (?:days|months)/i;
export function newBonuses(rewards: CardRewards, visibleText: string, acknowledged: Acknowledged["notThisCard"] = []): Finding[] {
  const known = knownFigures(rewards);
  const findings: Finding[] = [];
  for (const line of ownLines(visibleText)) {
    if (
      !BONUS_LINE.test(line) ||
      /secured card(?:s| products)? (?:are|is) not eligible|not be eligible for (?:a )?new (?:account|cardmember) bonus|won't be eligible for new cardmember/i.test(
        line,
      )
    )
      continue;
    for (const match of line.matchAll(/\$\s?(\d{1,3}(?:,\d{3})*|\d+)(?:\.00)?(?![\d,]|\.\d)/g)) {
      const value = Number(match[1].replace(/,/g, ""));
      // No sign-up bonus is under $10; "$1" is "per $1 spent".
      if (value < 10 || known.dollars.has(value)) continue;
      // The dollar figure has to be part of the bonus wording, not elsewhere in a long line.
      const near = line.slice(Math.max(0, match.index - 70), match.index + match[0].length + 70);
      const close = line.slice(Math.max(0, match.index - 25), match.index + match[0].length + 25);
      if (!BONUS_LINE.test(near) || OTHER_PRODUCT.test(line)) continue;
      if (
        /annual fee|statement credit (?:each|every)|credit (?:each|every|per) (?:month|year)|per month|a month|in cash back per year|could earn|you'd earn|you could|calculat/i.test(
          near,
        )
      )
        continue;
      if (/\bfee\b|minimum|balance transfer|cash advance|\b(?:per|every|each)\s*\$|\bspent\b|deposit|credit line|credit limit/i.test(close)) continue;
      const page = excerpt(line, match.index, match.index + match[0].length, 90);
      if (isAcknowledged(acknowledged, `$${match[1]}`, page)) continue;
      findings.push({
        kind: "new-bonus",
        stored: null,
        page,
        note: `$${match[1]} reads as part of a sign-up bonus, and the stored bonus has no $${match[1]}.`,
      });
    }
    for (const points of bonusPoints(line)) {
      const value = Number(points.replace(/,/g, ""));
      if (known.points.has(value)) continue;
      const at = line.indexOf(points);
      const page = excerpt(line, at, at + points.length, 90);
      if (isAcknowledged(acknowledged, points, page)) continue;
      findings.push({ kind: "new-bonus", stored: null, page, note: `${points} bonus points or miles are on the page, and the stored bonus has none.` });
    }
  }
  return dedupeByFigure(findings);
}

function isAcknowledged(acknowledged: NonNullable<Acknowledged["notThisCard"]>, figure: string, page: string): boolean {
  const flat = normalize(page).toLowerCase();
  return acknowledged.some((entry) => entry.figure.toLowerCase() === figure.toLowerCase() && flat.includes(normalize(entry.context).toLowerCase()));
}

// One finding per figure: the same new rate repeated in a page's hero, body
// and footnotes is one thing to look at.
function dedupeByFigure(findings: Finding[]): Finding[] {
  const byFigure = new Map<string, Finding>();
  for (const finding of findings) {
    const key = finding.note.split(" ")[0];
    if (!byFigure.has(key)) byFigure.set(key, finding);
  }
  return [...byFigure.values()];
}

// --- Dates -------------------------------------------------------------------

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

export function endDates(rewards: CardRewards, today: string, warnDays = 30): Finding[] {
  const dated = [
    ...rewards.rates.map((rate) => ({ stored: `${formatRate(rate)} on "${rate.category}"`, expiresOn: rate.expiresOn })),
    ...(rewards.bonus ? [{ stored: `bonus: "${rewards.bonus.summary}"`, expiresOn: rewards.bonus.expiresOn }] : []),
  ];
  const findings: Finding[] = [];
  for (const { stored, expiresOn } of dated) {
    if (expiresOn == null) continue;
    const left = daysBetween(today, expiresOn);
    if (left < 0)
      findings.push({ kind: "ended", stored, page: null, note: `The issuer's last day was ${expiresOn}. The unit tests fail until it is updated or removed.` });
    else if (left <= warnDays)
      findings.push({
        kind: "ends-soon",
        stored,
        page: null,
        note: `Ends ${expiresOn}, in ${left} day${left === 1 ? "" : "s"}. Check whether the issuer extended it.`,
      });
  }
  return findings;
}

// --- One card ----------------------------------------------------------------

function samePage(a: string, b: string): boolean {
  const key = (url: string) => {
    try {
      const parsed = new URL(url);
      return `${parsed.hostname.replace(/^www\./, "")}${parsed.pathname.replace(/\/+$/, "").replace(/\.html$/, "")}`.toLowerCase();
    } catch {
      return url;
    }
  };
  return key(a) === key(b);
}

// Stored rates and bonus that the given text does not confirm, quoting what
// `quoteFrom` (the visible page, when given) says instead.
export function missingFromText(rewards: CardRewards, text: string, quoteFrom = ""): Finding[] {
  const flat = normalize(text).replace(/\n/g, " ");
  const quote = normalize(quoteFrom).replace(/\n/g, " ");
  return [...rewards.rates.flatMap((rate) => checkRate(rate, flat, quote)), ...(rewards.bonus ? checkBonus(rewards.bonus, flat, quote) : [])];
}

// Why a person marked this rate-missing finding as not readable by the
// check, or null when they did not.
export function notReadableWhy(finding: Finding, acknowledged: Acknowledged): string | null {
  if (finding.kind !== "rate-missing" || finding.stored === null) return null;
  const stored = finding.stored;
  return (acknowledged.notReadable ?? []).find((entry) => stored.startsWith(`${entry.figure} on "`) && stored.includes(entry.category))?.why ?? null;
}

export function notReadable(finding: Finding, acknowledged: Acknowledged): boolean {
  return notReadableWhy(finding, acknowledged) !== null;
}

export function checkCard(rewards: CardRewards, page: CardPage, today: string, acknowledged: Acknowledged = {}): Finding[] {
  const visible = normalize(page.visibleText);
  const findings: Finding[] = [];
  if (!samePage(page.requestedUrl, page.finalUrl)) {
    findings.push({
      kind: "moved",
      stored: page.requestedUrl,
      page: page.finalUrl,
      note: "The source page now redirects elsewhere. The card may be renamed or no longer offered; update sourceUrl once you find its page.",
    });
  }
  findings.push(
    ...missingFromText(rewards, page.fullText, page.visibleText).filter((finding) => !notReadable(finding, acknowledged)),
    ...newFigures(rewards, visible, acknowledged.notThisCard),
    ...newBonuses(rewards, visible, acknowledged.notThisCard),
    ...endDates(rewards, today),
  );
  return findings;
}
