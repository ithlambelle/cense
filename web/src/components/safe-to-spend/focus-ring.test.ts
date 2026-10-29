import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

// outline-none sets Tailwind's --tw-outline-style to none, and a
// focus-visible:outline-2 ring reads its style from that variable, so the two
// in one class string draw no ring: the control shows no keyboard focus
// (audit H-P1-02, fixed app-wide in #75). This guards the safe-to-spend
// screens; #75's src/components/focus-ring.test.ts covers the whole app once
// it is on main. A ring drawn on ::after is not affected.
const HIDES_OUTLINE = /(^|[\s"'`])outline-(none|hidden)(?=[\s"'`]|$)/;
const FOCUS_RING = /focus-visible:outline(-\d+|-solid|(?![-:\w]))/;

describe("safe-to-spend focus rings", () => {
  it("never pair outline-none with a focus-visible outline in one class string", () => {
    const broken = readdirSync(__dirname)
      .filter((name) => name.endsWith(".tsx"))
      .flatMap((name) =>
        readFileSync(join(__dirname, name), "utf8")
          .split("\n")
          .flatMap((line, index) => (HIDES_OUTLINE.test(line) && FOCUS_RING.test(line) ? [`${name}:${index + 1}`] : [])),
      );
    expect(broken).toEqual([]);
  });
});
