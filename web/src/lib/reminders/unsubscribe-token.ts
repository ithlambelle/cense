import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

// The unsubscribe link in every reminder email carries
// "<student id>.<signature>": an HMAC-SHA256 of the student id and this
// purpose, keyed with REMINDER_UNSUBSCRIBE_SECRET, in base64url. The student
// id is a random UUID, never the email. The signature means nobody can
// unsubscribe someone else by changing the id, and the purpose means a
// signature made for anything else can never be reused here. It does not
// expire: an old email's link should still work. Changing the secret breaks
// every link already sent.
const PURPOSE = "cense:reminders-unsubscribe:v1";
const TOKEN = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.([A-Za-z0-9_-]{43})$/;

function signature(studentId: string, secret: string): string {
  return createHmac("sha256", secret).update(`${PURPOSE}:${studentId}`).digest("base64url");
}

export function unsubscribeToken(studentId: string, secret: string): string {
  return `${studentId}.${signature(studentId, secret)}`;
}

// The student id when the token is genuine, otherwise null.
export function verifyUnsubscribeToken(token: string | null, secret: string): string | null {
  const match = token ? TOKEN.exec(token) : null;
  if (!match) return null;
  // compared as text, in constant time; both are always 43 characters
  const given = Buffer.from(match[2]);
  const expected = Buffer.from(signature(match[1], secret));
  return timingSafeEqual(given, expected) ? match[1] : null;
}
