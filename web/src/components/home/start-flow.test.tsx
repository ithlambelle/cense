// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StartFlow } from "./start-flow";

const replace = vi.fn();
const router = { push: vi.fn(), replace, refresh: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));

type Reply = { status: number; body: unknown };

function server(routes: Record<string, Reply>) {
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async (url) => {
      const reply = routes[String(url)];
      if (!reply) return new Response("crash", { status: 500 });
      return Response.json(reply.body, { status: reply.status });
    }),
  );
}

const MATCH: Reply = { status: 200, body: { id: "1", cardId: "sample", fitTier: "stretch", reason: "A reason.", createdAt: "x" } };
const NO_MATCH: Reply = { status: 404, body: { error: { code: "not_found", message: "Nothing saved." } } };
const applications = (list: unknown[]): Reply => ({ status: 200, body: { applications: list } });

afterEach(() => {
  vi.unstubAllGlobals();
  replace.mockClear();
});

// US-02: a saved match with no application goes to results; everyone else goes to Home.
describe("StartFlow", () => {
  it("goes to results with a saved match and no application", async () => {
    server({ "/api/v1/applications": applications([]), "/api/v1/recommendations/latest": MATCH });
    render(<StartFlow />);
    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith("/results"));
  });

  it("goes to Home once an application exists", async () => {
    server({ "/api/v1/applications": applications([{ id: "1" }]), "/api/v1/recommendations/latest": MATCH });
    render(<StartFlow />);
    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith("/home"));
  });

  it("goes to Home with no saved match", async () => {
    server({ "/api/v1/applications": applications([]), "/api/v1/recommendations/latest": NO_MATCH });
    render(<StartFlow />);
    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith("/home"));
  });

  it("goes to Home when the applications read fails, even with a saved match", async () => {
    server({ "/api/v1/recommendations/latest": MATCH });
    render(<StartFlow />);
    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith("/home"));
  });

  it("goes to Home, and records it, when the check itself breaks", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    // An answer in the wrong shape makes the landing check throw.
    server({ "/api/v1/applications": { status: 200, body: {} }, "/api/v1/recommendations/latest": MATCH });
    render(<StartFlow />);
    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith("/home"));
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });
});
