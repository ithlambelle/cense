import { apiRequest, isUnauthorized } from "./client";

// Whether the visitor is signed in: true, false, or null when it could not be
// read (offline, server trouble). Null must never be treated as signed out.
export async function readSignedIn(): Promise<boolean | null> {
  const me = await apiRequest("get", "/me");
  if (me.ok) return true;
  return isUnauthorized(me) ? false : null;
}
