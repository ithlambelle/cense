import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

// outline-none (and outline-hidden) set Tailwind's --tw-outline-style to none,
// and a focus-visible:outline-2 ring reads its style from that variable, so
// the two in one class string draw no ring at all: a focused control measured
// "none 2px" in Chrome (audit H-P1-02). A ring drawn on ::after
// (focus-visible:after:outline-2) is not affected and is allowed.
const SRC = join(__dirname, "..");
const HIDES_OUTLINE = /(^|[\s"'`])outline-(none|hidden)(?=[\s"'`]|$)/;
const FOCUS_RING = /focus-visible:outline(-\d+|-solid|(?![-:\w]))/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

describe("focus rings", () => {
  it("never pair outline-none or outline-hidden with a focus-visible outline in one class string", () => {
    const broken = sourceFiles(SRC).flatMap((file) =>
      readFileSync(file, "utf8")
        .split("\n")
        .flatMap((line, index) => (HIDES_OUTLINE.test(line) && FOCUS_RING.test(line) ? [`${relative(SRC, file)}:${index + 1}`] : [])),
    );
    expect(broken).toEqual([]);
  });

  it("recognises the broken pair, and leaves rings on ::after alone", () => {
    const broken = (line: string) => HIDES_OUTLINE.test(line) && FOCUS_RING.test(line);
    expect(broken('"rounded outline-none focus-visible:outline-2 focus-visible:outline-ring"')).toBe(true);
    expect(broken('"rounded outline-hidden focus-visible:outline-2"')).toBe(true);
    expect(broken('"rounded focus-visible:outline-2 focus-visible:outline-ring"')).toBe(false);
    expect(broken('"outline-none after:inset-0 focus-visible:after:outline-2"')).toBe(false);
    expect(broken('"outline-none focus:border-violet"')).toBe(false);
  });
});
