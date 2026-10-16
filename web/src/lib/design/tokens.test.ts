import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

// tokens.json is the shared source for web and iOS. globals.css mirrors its
// colors for Tailwind. This fails when the two drift apart.
const tokens = JSON.parse(readFileSync(join(process.cwd(), "..", "tokens.json"), "utf8")) as {
  color: Record<string, { $value: string }>;
  radius: Record<string, { $value: { value: number; unit: string } }>;
};
const css = readFileSync(join(process.cwd(), "src", "app", "globals.css"), "utf8");

function kebab(name: string): string {
  return name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

function cssValue(variable: string): string | undefined {
  return new RegExp(`${variable}:\\s*([^;]+);`).exec(css)?.[1].trim().toLowerCase();
}

describe("design tokens", () => {
  it.each(Object.entries(tokens.color))("color %s matches globals.css", (name, token) => {
    expect(cssValue(`--color-${kebab(name)}`)).toBe(token.$value.toLowerCase());
  });

  it.each(Object.entries(tokens.radius))("radius %s matches globals.css", (name, token) => {
    expect(cssValue(`--radius-${kebab(name)}`)).toBe(`${token.$value.value}${token.$value.unit}`);
  });
});
