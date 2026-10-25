// Development-only answers for the pending endpoints (see pending.ts). Loaded
// only when mocks are on.

// CENSE_FIXTURE_SENTINEL: `npm run fixtures:check` (part of `npm run check`)
// fails if this string shows up in the browser bundle.
const FIXTURE_SENTINEL = "CENSE_FIXTURE_SENTINEL";

export class MockApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function mockPending(endpoint: string, body: unknown): Promise<unknown> {
  switch (endpoint) {
    case "POST /auth/password/signup":
      return { status: "signed_in" };
    case "POST /auth/password/signin":
      // Mocks only: the password "wrong-password" shows the incorrect-details state.
      if ((body as { password: string }).password === "wrong-password") {
        throw new MockApiError(401, "invalid_credentials", "The email or password is incorrect.");
      }
      return { status: "signed_in" };
    case "POST /auth/password/reset":
      return { status: "check_email" };
    case "POST /auth/password/reset/confirm":
      return { status: "password_updated" };
    default:
      throw new Error(`${FIXTURE_SENTINEL}: no mock for ${endpoint}`);
  }
}
