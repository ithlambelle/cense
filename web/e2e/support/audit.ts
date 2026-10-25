// The quality audit run on every screen, in every state, at every phone size.
// It looks at what a student sees, not at the code: layout, type, color, copy
// and touch targets. "error" findings fail the suite; "warn" findings go in
// the report for a person to judge (design drift, not breakage).
import type { Page } from "@playwright/test";

export type Finding = { rule: string; level: "error" | "warn"; detail: string; where?: string };

// Element signatures the cross-screen report groups to spot inconsistencies
// (two primary buttons that differ, an H1 that is not like the others).
export type Signature = { role: string; text: string; style: string };

export type AuditResult = { findings: Finding[]; signatures: Signature[] };

// Fonts the app loads (src/app/layout.tsx) and the weights each one has.
// Any other weight is faked by the browser (synthetic bold), which looks off.
const FONTS: Record<string, number[] | "any"> = {
  Sora: [500],
  Inter: "any",
  Unbounded: [400, 500],
  "Google Sans": [500],
};

export async function auditPage(page: Page): Promise<AuditResult> {
  return page.evaluate((fonts) => {
    const findings: { rule: string; level: "error" | "warn"; detail: string; where?: string }[] = [];
    const signatures: { role: string; text: string; style: string }[] = [];
    const add = (rule: string, level: "error" | "warn", detail: string, el?: Element) =>
      findings.push({ rule, level, detail, where: el ? describe(el) : undefined });

    function describe(el: Element): string {
      const text = (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 50);
      return `${el.tagName.toLowerCase()}${text ? ` "${text}"` : ""}`;
    }
    function visible(el: Element): boolean {
      const box = el.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) return false;
      for (let node: Element | null = el; node; node = node.parentElement) {
        const cs = getComputedStyle(node);
        if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) === 0) return false;
        if (node.getAttribute("aria-hidden") === "true" && node !== el) return false;
      }
      return true;
    }
    const ownText = (el: Element) =>
      [...el.childNodes]
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => n.textContent ?? "")
        .join("")
        .replace(/\s+/g, " ")
        .trim();
    const firstFamily = (family: string) => family.split(",")[0].replace(/["']/g, "").trim();

    // 1. Nothing wider than the screen.
    const width = window.innerWidth;
    if (document.documentElement.scrollWidth > width + 1) {
      add("horizontal-overflow", "error", `page is ${document.documentElement.scrollWidth}px wide on a ${width}px screen`);
    }
    for (const el of document.body.querySelectorAll("*")) {
      if (!visible(el)) continue;
      const box = el.getBoundingClientRect();
      if (box.right > width + 1 && getComputedStyle(el).position !== "fixed") {
        // Only report the outermost offender.
        const parent = el.parentElement?.getBoundingClientRect();
        if (!parent || parent.right <= width + 1) add("off-screen", "error", `extends ${Math.round(box.right - width)}px past the right edge`, el);
      }
    }

    // 2. Type: loaded fonts, real weights, sizes on the scale.
    const scale = new Set([11, 12, 13, 14, 15, 16, 17, 18, 20, 24, 28, 32, 36]);
    const offScale = new Set([11, 13, 36]); // used on purpose by single frames; reported once each below
    const seenType = new Set<string>();
    for (const el of document.body.querySelectorAll("*")) {
      const text = ownText(el);
      if (!text || !visible(el)) continue;
      const cs = getComputedStyle(el);
      const family = firstFamily(cs.fontFamily);
      const weight = Number(cs.fontWeight);
      const size = Math.round(parseFloat(cs.fontSize) * 10) / 10;
      const allowed = (fonts as Record<string, number[] | "any">)[family];
      if (!allowed) add("unknown-font", "error", `${family} is not a font the app loads`, el);
      else if (allowed !== "any" && !allowed.includes(weight)) {
        add("synthetic-weight", "error", `${family} at weight ${weight}: only ${allowed.join(", ")} is loaded, so the browser fakes it`, el);
      }
      const key = `${family}/${weight}/${size}`;
      if (!scale.has(size) && !seenType.has(key)) add("off-scale-size", "warn", `${size}px ${family} is not on the type scale`, el);
      else if (offScale.has(size) && !seenType.has(key)) add("rare-size", "warn", `${size}px ${family} (outside the token scale)`, el);
      seenType.add(key);
    }

    // 3. Copy.
    const bodyText = document.body.innerText;
    const copyRules: [RegExp, string, "error" | "warn"][] = [
      [/—/, "em dash", "error"],
      [/~\s?\$/, "tilde before an amount", "error"],
      [/\bundefined\b|\bNaN\b|\[object Object\]|\bnull\b/, "a code value shown to the student", "error"],
      [/lorem ipsum|\bTODO\b|\bFIXME\b/i, "placeholder text", "error"],
      [/[A-Za-z]'[A-Za-z]/, "straight apostrophe (the app uses ’)", "warn"],
      [/\b(\w+) \1\b/i, "repeated word", "warn"],
    ];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const raw = node.textContent ?? "";
      if (/\S {2,}\S/.test(raw) && node.parentElement && visible(node.parentElement)) {
        add("copy", "warn", `double space: "${raw.trim().slice(0, 60)}"`, node.parentElement);
        break;
      }
    }
    for (const [pattern, label, level] of copyRules) {
      const match = pattern.exec(bodyText);
      if (match) {
        const at = Math.max(0, match.index - 30);
        add("copy", level, `${label}: "…${bodyText.slice(at, match.index + 30).replace(/\s+/g, " ")}…"`);
      }
    }

    // 4. Touch targets, and anything left under the bottom bar. The page is
    // scrolled to the end before this runs, so a control still overlapping
    // the docked bar can never be reached.
    const nav = [...document.querySelectorAll("nav")].find(
      (n) => visible(n) && Math.abs(n.getBoundingClientRect().bottom - window.innerHeight) < 2,
    );
    const barTop = nav ? nav.getBoundingClientRect().top : Infinity;
    const controls = [...document.querySelectorAll("a[href], button, input, select, textarea, [role=checkbox], [role=button]")].filter(
      (el) => visible(el) && !el.closest("nav"),
    );
    // The tappable area, including a hit area grown by a pseudo-element
    // (the app's after:-inset-3 pattern on small text links).
    const hitArea = (el: Element) => {
      const box = el.getBoundingClientRect();
      let { top, right, bottom, left } = box;
      for (const pseudo of ["::before", "::after"]) {
        const ps = getComputedStyle(el, pseudo);
        if (ps.content === "none" || ps.position !== "absolute") continue;
        const inset = (value: string) => (value.endsWith("px") ? parseFloat(value) : 0);
        top = Math.min(top, box.top + inset(ps.top));
        left = Math.min(left, box.left + inset(ps.left));
        right = Math.max(right, box.right - inset(ps.right));
        bottom = Math.max(bottom, box.bottom - inset(ps.bottom));
      }
      return { width: right - left, height: bottom - top };
    };
    for (const el of controls) {
      const box = el.getBoundingClientRect();
      const hit = hitArea(el);
      // WCAG 2.5.8 (24px, with its spacing and inline exceptions) is checked by axe;
      // this flags what is hard to tap on a phone (44px is Apple's and Google's guidance).
      if (hit.width < 16 || hit.height < 16) add("tap-target", "error", `${Math.round(hit.width)}x${Math.round(hit.height)}px tappable area`, el);
      else if (hit.height < 44 && hit.width < 44) add("tap-target-small", "warn", `${Math.round(hit.width)}x${Math.round(hit.height)}px tappable area (44px recommended)`, el);
      if (box.bottom > barTop + 1 && box.top < window.innerHeight) add("under-bottom-bar", "error", "still under the bottom bar at the end of the page", el);
    }

    // 5. Structure: one H1, named controls.
    const dialog = [...document.querySelectorAll("[role=dialog], dialog[open]")].find(visible);
    if (dialog) {
      if (!dialog.querySelector("h1, h2, h3") && !dialog.getAttribute("aria-label") && !dialog.getAttribute("aria-labelledby")) {
        add("dialog-title", "error", "an open sheet with no heading or name", dialog);
      }
    } else {
      const h1s = [...document.querySelectorAll("h1")].filter(visible);
      if (h1s.length !== 1) add("h1-count", "error", `${h1s.length} H1 headings (expected 1)`);
    }
    for (const el of controls) {
      const name = (el.getAttribute("aria-label") ?? el.textContent ?? (el as HTMLInputElement).placeholder ?? "").trim();
      const labelled = el.getAttribute("aria-labelledby") || (el as HTMLInputElement).labels?.length;
      if (!name && !labelled) add("unnamed-control", "error", "a control with no name", el);
    }

    // 6. Signatures for the cross-screen consistency report.
    const sig = (role: string, el: Element) => {
      const cs = getComputedStyle(el);
      const box = el.getBoundingClientRect();
      signatures.push({
        role,
        text: (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 40),
        style: [
          `${firstFamily(cs.fontFamily)} ${cs.fontWeight} ${cs.fontSize}/${cs.lineHeight}`,
          `color ${cs.color}`,
          // Buttons keep their height (it is part of the design); cards grow with content, so not theirs.
          role.startsWith("button") || role.startsWith("choice") ? `h${Math.round(box.height)} r${cs.borderTopLeftRadius} bg ${cs.backgroundColor} border ${cs.borderTopWidth} ${cs.borderTopColor}` : "",
          role.startsWith("card") ? `r${cs.borderTopLeftRadius} bg ${cs.backgroundColor} border ${cs.borderTopWidth} ${cs.borderTopColor} pad ${cs.paddingTop} ${cs.paddingLeft}` : "",
        ]
          .filter(Boolean)
          .join(" | "),
      });
    };
    for (const level of [1, 2, 3]) for (const el of document.querySelectorAll(`h${level}`)) if (visible(el)) sig(`h${level}`, el);
    for (const el of controls) {
      const cs = getComputedStyle(el);
      if (!["A", "BUTTON"].includes(el.tagName)) continue;
      const filled = cs.backgroundColor !== "rgba(0, 0, 0, 0)" && cs.backgroundColor !== "rgb(255, 255, 255)";
      const bordered = parseFloat(cs.borderTopWidth) > 0;
      const box = el.getBoundingClientRect();
      // Violet fill = primary action; a light fill = a tinted row (first-month stars, matches).
      const violet = /rgba?\(151, 64, 197/.test(cs.backgroundColor);
      if (box.height >= 44 && box.width > window.innerWidth * 0.6) {
        sig(violet ? "button-primary" : filled ? "row-tinted" : bordered ? "choice-or-outline" : "button-text", el);
      }
    }
    for (const el of document.querySelectorAll("section, [role=region], li > button, li > a")) {
      const cs = getComputedStyle(el);
      if (!visible(el) || el.closest("nav") || parseFloat(cs.borderTopLeftRadius) < 10) continue;
      sig(parseFloat(cs.borderTopWidth) > 0 ? "card-outlined" : "card-filled", el);
    }
    return { findings, signatures };
  }, FONTS);
}
