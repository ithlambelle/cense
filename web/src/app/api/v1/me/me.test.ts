import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ authenticatedStudent: vi.fn() }));
vi.mock("@/lib/api/auth", () => auth);
const admin = vi.hoisted(() => ({ deleteUser: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => ({ auth: { admin }, rpc: admin.rpc }) }));
const deletion = vi.hoisted(() => ({ accountDeletionConfig: vi.fn(), deletePostHogPerson: vi.fn() }));
vi.mock("@/lib/account-deletion", () => deletion);
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
  admin.rpc.mockResolvedValue({ data: true, error: null });
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

  it("checks cleanup, deletes PostHog, then deletes the account without calling Plaid", async () => {
    deletion.accountDeletionConfig.mockReturnValue({ ok: true, serviceRoleKey: "service", posthog: ADMIN });
    const response = await DELETE();
    expect(response.status).toBe(204);
    expect(steps).toEqual(["posthog", "account", 'sign out {"scope":"local"}']);
    expect(deletion.deletePostHogPerson).toHaveBeenCalledWith(STUDENT, ADMIN);
    expect(admin.deleteUser).toHaveBeenCalledWith(STUDENT);
  });

  it("skips PostHog where analytics never ran", async () => {
    deletion.accountDeletionConfig.mockReturnValue({ ok: true, serviceRoleKey: "service", posthog: null });
    expect((await DELETE()).status).toBe(204);
    expect(steps).toEqual(["account", 'sign out {"scope":"local"}']);
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
    expect(signOut).not.toHaveBeenCalled();
  });

  it.each([{ data: false, error: null }, { data: null, error: { code: "PGRST202" } }])("keeps the account when the cleanup migration is unavailable", async (answer) => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    deletion.accountDeletionConfig.mockReturnValue({ ok: true, serviceRoleKey: "service", posthog: ADMIN });
    admin.rpc.mockResolvedValue(answer);
    expect((await DELETE()).status).toBe(503);
    expect(admin.rpc).toHaveBeenCalledWith("plaid_account_cleanup_ready");
    expect(admin.deleteUser).not.toHaveBeenCalled();
    expect(deletion.deletePostHogPerson).not.toHaveBeenCalled();
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
