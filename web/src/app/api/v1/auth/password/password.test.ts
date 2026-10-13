import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
  signUp: vi.fn(),
  signInWithPassword: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  updateUser: vi.fn(),
  getUser: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createStudentClient: async () => ({ auth }) }));

import { POST as signUp } from "./signup/route";
import { POST as signIn } from "./signin/route";
import { POST as reset } from "./reset/route";
import { POST as confirm } from "./reset/confirm/route";

function request(path: string, payload: unknown): Request {
  return new Request(`https://cense.example${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

beforeEach(() => vi.clearAllMocks());

describe("optional password auth", () => {
  it("creates an account using the allowlisted callback and reports email confirmation", async () => {
    auth.signUp.mockResolvedValue({ data: { session: null }, error: null });
    const response = await signUp(request("/api/v1/auth/password/signup", {
      email: "student@example.com", password: "long-enough-password",
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "check_email" });
    expect(auth.signUp).toHaveBeenCalledWith({
      email: "student@example.com",
      password: "long-enough-password",
      options: { emailRedirectTo: "https://cense.example/api/v1/auth/callback?next=%2Fsign-in%3Fconfirmed%3D1" },
    });
  });

  it("does not call the provider for an invalid password", async () => {
    const response = await signUp(request("/api/v1/auth/password/signup", {
      email: "student@example.com", password: "short",
    }));
    expect(response.status).toBe(400);
    expect(auth.signUp).not.toHaveBeenCalled();
  });

  it("returns a generic sign-in failure", async () => {
    auth.signInWithPassword.mockResolvedValue({ error: new Error("provider detail") });
    const response = await signIn(request("/api/v1/auth/password/signin", {
      email: "student@example.com", password: "wrong",
    }));
    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe("invalid_credentials");
  });

  it("sends a reset link to the recovery screen", async () => {
    auth.resetPasswordForEmail.mockResolvedValue({ error: null });
    const response = await reset(request("/api/v1/auth/password/reset", { email: "student@example.com" }));
    expect(response.status).toBe(200);
    expect(auth.resetPasswordForEmail).toHaveBeenCalledWith("student@example.com", {
      redirectTo: "https://cense.example/api/v1/auth/callback?next=%2Freset-password",
    });
  });

  it("rejects password updates without an authenticated session", async () => {
    auth.getUser.mockResolvedValue({ data: { user: null }, error: null });
    const response = await confirm(request("/api/v1/auth/password/reset/confirm", {
      password: "new-long-password",
    }));
    expect(response.status).toBe(401);
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it("updates a password with an authenticated session", async () => {
    auth.getUser.mockResolvedValue({ data: { user: { id: "student-id" } }, error: null });
    auth.updateUser.mockResolvedValue({ error: null });
    const response = await confirm(request("/api/v1/auth/password/reset/confirm", {
      password: "new-long-password",
    }));
    expect(response.status).toBe(200);
    expect(auth.updateUser).toHaveBeenCalledWith({ password: "new-long-password" });
  });
});
