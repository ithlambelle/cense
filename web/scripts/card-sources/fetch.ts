import { chromium, type Browser, type BrowserContext, type Page, type Response } from "playwright-core";

// Loads issuer pages the way a person's browser would, once each, so the
// checker reads what JavaScript renders (Bank of America, Citi and Chime build
// their rates in the browser). It never signs in, never retries a page that
// refused it and never tries to get past bot protection: a page that blocks
// it is reported as "could not load" for a person to open.

export type PageText = {
  url: string;
  finalUrl: string;
  status: number | null;
  title: string;
  // what a reader sees (innerText) outside the site's header, menus and
  // footer, for spotting new figures
  visibleText: string;
  // every text node, including closed accordions and pop-ups, for confirming
  // that a stored figure is still there
  fullText: string;
  // the rewards terms the page opens in a pop-up ("Rewards terms", "See rates,
  // rewards, fees..."), read from the issuer's own response when it opened
  termsText: string;
  termsFrom: string[];
  links: { text: string; href: string }[];
  error: string | null;
  fetchedAt: string;
};

export type Fetcher = {
  load(url: string): Promise<PageText>;
  close(): Promise<void>;
};

const BLOCK_PAGE =
  /access denied|request unsuccessful|pardon our interruption|are you a (?:human|robot)|captcha|unusual (?:traffic|activity)|bot detection|request (?:was )?blocked|you don't have permission to access/i;

// Why the page cannot be checked, or null when it can.
export function unreadableReason(page: PageText): string | null {
  if (page.error) return page.error;
  if (page.status !== null && page.status >= 400) return `the issuer answered HTTP ${page.status}`;
  const head = `${page.title}\n${page.visibleText.slice(0, 2_000)}`;
  if (BLOCK_PAGE.test(head)) return "the issuer's bot protection served a block page instead of the card page";
  if (page.visibleText.trim().length < 400) return "the page loaded almost no text";
  return null;
}

function desktopUserAgent(version: string): string {
  const platform =
    process.platform === "darwin" ? "Macintosh; Intel Mac OS X 10_15_7" : process.platform === "win32" ? "Windows NT 10.0; Win64; x64" : "X11; Linux x86_64";
  const major = version.split(".")[0];
  return `Mozilla/5.0 (${platform}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Safari/537.36`;
}

const OUR_NETWORK = /ERR_INTERNET_DISCONNECTED|ERR_NETWORK_CHANGED|ERR_NAME_NOT_RESOLVED|ERR_NETWORK_IO_SUSPENDED|ERR_ADDRESS_UNREACHABLE/;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// These run in the page, in a separate JavaScript world of their own (see
// readInPage), as strings so the TypeScript runner's helpers never end up in
// browser code.

// What a reader sees, read before any pop-up is opened. Footnote markers
// (<sup>1</sup>, *, daggers) are dropped so "Earn 5%<sup>2</sup>" never reads
// as "5%2" and "<sup>3</sup>5%" never as "35%"; a <sup> holding a symbol such
// as "%" or "$" is kept. The site's own header, menus and footer list other
// cards' rates, so they are left out (inside <main> they are kept).
const READ_VISIBLE = `(() => {
  for (const sup of Array.from(document.querySelectorAll("sup"))) {
    const text = (sup.textContent || "").trim();
    if (/^[\\d\\s*†‡§¶,#]*$/.test(text)) sup.textContent = " ";
  }
  const hidden = [];
  for (const el of Array.from(document.querySelectorAll("header, nav, footer, [role=banner], [role=navigation], [role=contentinfo]"))) {
    if (el.closest("main, article, [role=main]")) continue;
    hidden.push([el, el.style.getPropertyValue("display")]);
    el.style.setProperty("display", "none", "important");
  }
  const visibleText = document.body.innerText;
  for (const [el, display] of hidden) display ? el.style.setProperty("display", display) : el.style.removeProperty("display");
  const links = Array.from(document.querySelectorAll("a[href]")).map((a) => ({
    text: (a.innerText || a.textContent || a.getAttribute("aria-label") || "").replace(/\\s+/g, " ").trim(),
    href: a.href,
  }));
  return { title: document.title, visibleText, links };
})()`;

// Every text node, including closed accordions and opened pop-ups.
const READ_ALL = `(() => {
  const skip = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "SVG", "IFRAME"]);
  const parts = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      for (let el = node.parentElement; el; el = el.parentElement) if (skip.has(el.tagName.toUpperCase())) return NodeFilter.FILTER_REJECT;
      return (node.textContent || "").trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    },
  });
  for (let node = walker.nextNode(); node; node = walker.nextNode()) parts.push((node.textContent || "").trim());
  return parts.join(" ");
})()`;

// Controls that open the card's rewards terms in a pop-up rather than a new
// page: Capital One's "View important rates and disclosures" (its "How do I
// earn rewards?" section states the Capital One Travel and Entertainment
// rates; its "Rewards terms" pop-up covers redeeming), Discover's "See rates,
// rewards, fees, and other cost information".
const TERMS_POPUP =
  /^\s*(?:(?:view )?important (?:rates and )?disclosures|rewards terms|see rates, rewards, fees,? and other cost information|rates,? (?:&|and) rewards(?: information)?|(?:see )?pricing (?:&|and) terms|rewards program terms(?: (?:&|and) conditions)?)\s*$/i;
// What those pop-ups load: a disclosure or terms document.
const TERMS_RESPONSE = /disclos|terms|addendum|agreement/i;

// Text from an HTML or plain-text response body.
export function htmlToText(body: string): string {
  return body
    .replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<sup>[\s\d*†‡§¶,#]*<\/sup>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&(?:rsquo|lsquo|#8217|#8216|#39);/g, "'")
    .replace(/&(?:rdquo|ldquo|quot|#8220|#8221);/g, '"')
    .replace(/&(?:ndash|mdash|#8211|#8212);/g, "-")
    .replace(/&reg;|&trade;|&copy;|&#174;|&#8482;/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/\s+/g, " ")
    .trim();
}

// Runs a script against the page's document in an isolated world: it sees
// the same page but none of the page's own JavaScript, so a site that turns
// off eval (American Express) or changes built-ins cannot break the reading.
async function readInPage<T>(page: Page, expression: string): Promise<T> {
  const cdp = await page.context().newCDPSession(page);
  try {
    const { frameTree } = await cdp.send("Page.getFrameTree");
    const { executionContextId } = await cdp.send("Page.createIsolatedWorld", { frameId: frameTree.frame.id, worldName: "card-data-check" });
    const { result, exceptionDetails } = await within(
      cdp.send("Runtime.evaluate", { expression, contextId: executionContextId, returnByValue: true }),
      15_000,
      "reading the page's text",
    );
    if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
    return result.value as T;
  } finally {
    await cdp.detach().catch(() => undefined);
  }
}

// The promise, or an error once `ms` have passed. A page that never settles
// (a stalled response, a script that keeps the browser busy) must not hold up
// the other cards, so every step that waits on the page has a ceiling.
function within<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${what} took over ${Math.round(ms / 1000)} seconds`)), ms);
  });
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timer));
}

// The most one page may take, start to finish, before it is reported as
// could not load.
const PAGE_DEADLINE_MS = 90_000;

function failed(url: string, finalUrl: string, fetchedAt: string, error: unknown): PageText {
  const message = error instanceof Error ? error.message.split("\n")[0] : String(error);
  return {
    url,
    finalUrl,
    status: null,
    title: "",
    visibleText: "",
    fullText: "",
    termsText: "",
    termsFrom: [],
    links: [],
    error: `the page did not load (${message})`,
    fetchedAt,
  };
}

export async function openFetcher(options: { channel?: string; delayMs: number }): Promise<Fetcher> {
  // Playwright's own Chromium in the new headless mode, a full browser, unless
  // another channel ("chrome") is asked for.
  const browser: Browser = await chromium.launch({ headless: true, channel: options.channel ?? "chromium" });
  const context: BrowserContext = await browser.newContext({
    userAgent: desktopUserAgent(browser.version()),
    viewport: { width: 1366, height: 900 },
    locale: "en-US",
    timezoneId: "America/New_York",
  });
  // Text only: images, video and fonts are never requested, which keeps each
  // visit light on the issuer's servers.
  await context.route("**/*", (route) => (["image", "media", "font"].includes(route.request().resourceType()) ? route.abort() : route.continue()));
  let last = 0;

  async function visit(url: string): Promise<PageText> {
    // A polite gap between pages, with a little jitter.
    const wait = last + options.delayMs + Math.floor(Math.random() * 1_000) - Date.now();
    if (wait > 0) await sleep(wait);
    const page = await context.newPage();
    const fetchedAt = new Date().toISOString();
    const reading = read(page, url, fetchedAt);
    // Once the deadline passes, the page is closed under the reading, which
    // then fails; that failure is already answered, so it is ignored.
    reading.catch(() => undefined);
    try {
      return await within(reading, PAGE_DEADLINE_MS, "loading the page");
    } catch (error) {
      return failed(url, page.url(), fetchedAt, error);
    } finally {
      last = Date.now();
      await within(page.close(), 10_000, "closing the page").catch(() => undefined);
    }
  }

  async function read(page: Page, url: string, fetchedAt: string): Promise<PageText> {
    const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
    // Issuer pages keep analytics running, so "idle" is a short wait at most.
    await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => undefined);
    // Some sections render only once scrolled into view.
    for (let step = 1; step <= 6; step++) {
      await page.mouse.wheel(0, 2_500);
      await page.waitForTimeout(400);
    }
    await page.waitForLoadState("networkidle", { timeout: 3_000 }).catch(() => undefined);
    const finalUrl = page.url();
    const status = response?.status() ?? null;
    const visible = await readInPage<Pick<PageText, "title" | "visibleText" | "links">>(page, READ_VISIBLE);

    // Open the rewards terms pop-up, as a reader would, and keep what the
    // issuer sends for it. At most three controls, each clicked once.
    const bodies: Promise<{ from: string; text: string } | null>[] = [];
    const keep = (reply: Response) => {
      const type = reply.request().resourceType();
      if (!["xhr", "fetch", "document"].includes(type) || (reply.request().frame() === page.mainFrame() && type === "document")) return;
      if (!TERMS_RESPONSE.test(reply.url()) || !/html|text\/plain/i.test(reply.headers()["content-type"] ?? "")) return;
      bodies.push(
        within(reply.text(), 5_000, "reading the terms").then(
          (body) => ({ from: reply.url(), text: htmlToText(body) }),
          () => null,
        ),
      );
    };
    page.on("response", keep);
    const popups = page.locator("a, button, [role=button]").filter({ hasText: TERMS_POPUP });
    const opened = new Set<string>();
    for (let index = 0; index < Math.min(await popups.count(), 6) && opened.size < 3; index++) {
      const control = popups.nth(index);
      const href = (await control.getAttribute("href").catch(() => null)) ?? "";
      const label = ((await control.textContent().catch(() => "")) ?? "").trim();
      // Only pop-ups: a link to another page is read separately, if needed.
      if (href && !/^(?:javascript:|#)/i.test(href)) continue;
      if (opened.has(label.toLowerCase())) continue;
      opened.add(label.toLowerCase());
      await control.click({ timeout: 2_000 }).catch(() => control.dispatchEvent("click").catch(() => undefined));
      await page.waitForLoadState("networkidle", { timeout: 3_000 }).catch(() => undefined);
    }
    await page.waitForTimeout(opened.size > 0 ? 1_000 : 0);
    page.off("response", keep);
    const terms = (await Promise.all(bodies)).filter((body): body is { from: string; text: string } => body !== null && body.text.length > 200);
    const fullText = await readInPage<string>(page, READ_ALL);
    return {
      url,
      finalUrl,
      status,
      ...visible,
      fullText,
      termsText: terms.map((body) => body.text).join("\n"),
      termsFrom: [...new Set(terms.map((body) => body.from))],
      error: null,
      fetchedAt,
    };
  }

  return {
    async load(url) {
      const first = await visit(url);
      // Our own connection dropped, so the issuer never saw the request: try
      // once more after a pause. A page the issuer refused is never retried.
      if (!first.error || !OUR_NETWORK.test(first.error)) return first;
      await sleep(30_000);
      return visit(url);
    },
    async close() {
      await context.close();
      await browser.close();
    },
  };
}
