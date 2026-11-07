import { afterEach, describe, expect, it, vi } from "vitest";

// The config is read once, when Playwright loads it, so each case loads a
// fresh copy with CI set or not.
async function loadConfig(ci: string | undefined) {
  vi.resetModules();
  vi.stubEnv("CI", ci);
  return (await import("./playwright.config")).default;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("playwright config", () => {
  // A test.only left in a spec would run that one test and skip the rest,
  // and CI would still pass (audit H-T2).
  it("fails the run on a stray test.only in CI", async () => {
    expect((await loadConfig("true")).forbidOnly).toBe(true);
  });

  it("allows test.only on a laptop, to run one journey while working on it", async () => {
    expect((await loadConfig(undefined)).forbidOnly).toBe(false);
  });
});
