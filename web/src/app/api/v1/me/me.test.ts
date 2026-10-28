import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ authenticatedStudent: vi.fn() }));
vi.mock("@/lib/api/auth", () => auth);
const admin = vi.hoisted(() => ({ deleteUser: vi.fn() }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => ({ auth: { admin } }) }));
const deletion = vi.hoisted(() => ({ accountDeletionConfig: vi.fn(), deletePostHogPerson: vi.fn() }));
vi.mock("@/lib/account-deletion", () => deletion);
const bank = vi.hoisted(() => ({ removeBankLinksForStudent: vi.fn() }));
vi.mock("@/lib/plaid/unlink", () => bank);

import { DELETE } from "./route";

const STUDENT = "00000000-0000-4000-8000-000000000001";
const ADMIN = { apiKey: "not-a-real-key", projectId: "12345" };
const steps: string[] = [];
const signOut = vi.fn(async (options: unknown) => {
  steps.push(`sign out ${JSON.stringify(options)}`);
  return { error: null };
});

beforeEach(() => {
  steps.length = 0;
  bank.removeBankLinksForStudent.mockImplementation(async () => {
    steps.push("plaid");
    return { kind: "none" };
  });
  auth.authenticatedStudent.mockResolvedValue({ supabase: { auth: { signOut } }, studentId: STUDENT, email: null });
  deletion.deletePostHogPerson.mockImplementation(async () => {
    steps.push("posthog");
    return true;
  });
  admin.deleteUser.mockImplementation(async () => {
    steps.push("account");
    return { error: null };
  });
});

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("DELETE /me", () => {
  it("refuses a signed-out caller", async () => {
    auth.authenticatedStudent.mockResolvedValue(null);
    expect((await DELETE()).status).toBe(401);
    expect(steps).toEqual([]);
  });

  it("deletes the PostHog person, removes Plaid Items, then deletes the account and signs out", async () => {
    deletion.accountDeletionConfig.mockReturnValue({ ok: true, serviceRoleKey: "service", posthog: ADMIN });
    const response = await DELETE();
    expect(response.status).toBe(204);
    expect(steps).toEqual(["posthog", "plaid", "account", 'sign out {"scope":"local"}']);
    expect(deletion.deletePostHogPerson).toHaveBeenCalledWith(STUDENT, ADMIN);
    expect(admin.deleteUser).toHaveBeenCalledWith(STUDENT);
  });

  it("skips PostHog where analytics never ran", async () => {
    deletion.accountDeletionConfig.mockReturnValue({ ok: true, serviceRoleKey: "service", posthog: null });
    expect((await DELETE()).status).toBe(204);
    expect(steps).toEqual(["plaid", "account", 'sign out {"scope":"local"}']);
  });

  it("deletes nothing when a setting is missing", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    deletion.accountDeletionConfig.mockReturnValue({ ok: false, missing: ["POSTHOG_PERSONAL_API_KEY"] });
    const response = await DELETE();
    expect(response.status).toBe(503);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe("deletion_unavailable");
    expect(steps).toEqual([]);
    expect(error).toHaveBeenCalledWith(JSON.stringify({ event: "account_deletion_not_configured", missing: ["POSTHOG_PERSONAL_API_KEY"] }));
  });

  it("keeps the account when PostHog does not accept the deletion", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    deletion.accountDeletionConfig.mockReturnValue({ ok: true, serviceRoleKey: "service", posthog: ADMIN });
    deletion.deletePostHogPerson.mockResolvedValue(false);
    const response = await DELETE();
    expect(response.status).toBe(502);
    expect(admin.deleteUser).not.toHaveBeenCalled();
    expect(bank.removeBankLinksForStudent).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
  });

  it("finishes after removing a linked Item", async () => {
    deletion.accountDeletionConfig.mockReturnValue({ ok: true, serviceRoleKey: "service", posthog: null });
    bank.removeBankLinksForStudent.mockImplementation(async () => {
      steps.push("plaid");
      return { kind: "removed" };
    });
    expect((await DELETE()).status).toBe(204);
    expect(steps).toEqual(["plaid", "account", 'sign out {"scope":"local"}']);
    expect(bank.removeBankLinksForStudent).toHaveBeenCalledWith(expect.objectContaining({ studentId: STUDENT }));
  });

  it.each(["plaid_unreachable", "not_configured", "database_error"])("keeps the account and session after %s", async (kind) => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    deletion.accountDeletionConfig.mockReturnValue({ ok: true, serviceRoleKey: "service", posthog: null });
    bank.removeBankLinksForStudent.mockResolvedValue({ kind });
    expect((await DELETE()).status).toBe(kind === "not_configured" ? 503 : 502);
    expect(admin.deleteUser).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
  });

  it("stays signed in when the account deletion fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    deletion.accountDeletionConfig.mockReturnValue({ ok: true, serviceRoleKey: "service", posthog: null });
    admin.deleteUser.mockResolvedValue({ error: { code: "unexpected_failure", status: 500, message: "x" } });
    const response = await DELETE();
    expect(response.status).toBe(502);
    expect(signOut).not.toHaveBeenCalled();
  });
});
