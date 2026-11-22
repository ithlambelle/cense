// Created with Claude Code (2026-11-16). parseJson reads only JSON bodies, so a
// form on another site cannot post to the API without a preflight (login CSRF,
// found in the Testathon security audit).
import { describe, expect, it } from "vitest";

import { parseJson } from "./errors";

const post = (body: string, type?: string) =>
  new Request("https://cense.example/api/v1/auth/password/signin", {
    method: "POST",
    headers: type ? { "Content-Type": type } : undefined,
    body,
  });

describe("parseJson", () => {
  const json = '{"email":"a@b.co","password":"pw=1"}';

  it("reads a JSON body", async () => {
    expect(await parseJson(post(json, "application/json"))).toEqual({ email: "a@b.co", password: "pw=1" });
    expect(await parseJson(post(json, "Application/JSON; charset=utf-8"))).toEqual({ email: "a@b.co", password: "pw=1" });
  });

  it("ignores a body sent as text or a form, as a cross-site form would send it", async () => {
    expect(await parseJson(post(json, "text/plain"))).toBeUndefined();
    expect(await parseJson(post(json, "application/x-www-form-urlencoded"))).toBeUndefined();
    expect(await parseJson(post(json))).toBeUndefined();
  });
});
