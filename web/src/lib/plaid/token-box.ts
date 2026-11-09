import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// The Plaid access token is stored only as ciphertext (US-12). AES-256-GCM,
// with a 32-byte key that lives in the app's environment (PLAID_TOKEN_KEY,
// a Vercel Sensitive variable), never in the database: a database dump, the
// service role key or a dashboard user sees ciphertext only. GCM also
// authenticates, so a changed ciphertext fails to open instead of decrypting
// to something else.
//
// The ciphertext is bound to its student and item (the associated data), so
// a value copied into another student's row does not open there.
//
// Format: "v1." then base64url(12-byte IV, 16-byte tag, ciphertext). The
// version leaves room to rotate the key later: open with the old key, seal
// with the new.

const VERSION = "v1.";
const IV_BYTES = 12;
const TAG_BYTES = 16;

export type TokenKey = Buffer & { readonly __brand: "TokenKey" };

// The key from its base64 form (openssl rand -base64 32), or null when it is
// missing or not exactly 32 bytes.
export function parseTokenKey(value: string | undefined): TokenKey | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!/^[A-Za-z0-9+/_-]+={0,2}$/.test(trimmed)) return null;
  const key = Buffer.from(trimmed, "base64");
  return key.length === 32 ? (key as TokenKey) : null;
}

function associatedData(studentId: string, itemId: string): Buffer {
  return Buffer.from(`cense:plaid-token:${studentId}:${itemId}`, "utf8");
}

export function sealToken(token: string, key: TokenKey, binding: { studentId: string; itemId: string }): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(associatedData(binding.studentId, binding.itemId));
  const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return VERSION + Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64url");
}

// The token, or null when the value is not ours, was changed, belongs to
// another student or item, or was sealed with another key.
export function openToken(sealed: string, key: TokenKey, binding: { studentId: string; itemId: string }): string | null {
  if (!sealed.startsWith(VERSION)) return null;
  const raw = Buffer.from(sealed.slice(VERSION.length), "base64url");
  if (raw.length <= IV_BYTES + TAG_BYTES) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, raw.subarray(0, IV_BYTES));
    decipher.setAAD(associatedData(binding.studentId, binding.itemId));
    decipher.setAuthTag(raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
    return Buffer.concat([decipher.update(raw.subarray(IV_BYTES + TAG_BYTES)), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
