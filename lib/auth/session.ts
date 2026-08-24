/**
 * Box #5, smallest honest slice: one shared password, a real signed
 * session — not a per-user account system (no email, no user table),
 * and not a fake "click to continue" gate either. The token is
 * `<expiresAtMs>.<hex hmac>`, verified with a constant-time comparison so
 * a truncated/guessed signature can't be distinguished from a wrong one by
 * timing. Stateless — no session store, just a signature the server can
 * recompute.
 */

import { createHmac, scryptSync, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "optimus_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

export function createSessionToken(secret: string): string {
  const expiresAt = Date.now() + SESSION_TTL_MS;
  const payload = String(expiresAt);
  return `${payload}.${sign(payload, secret)}`;
}

export function verifySessionToken(token: string | undefined | null, secret: string): boolean {
  if (!token) return false;
  const dot = token.indexOf(".");
  if (dot === -1) return false;

  const payload = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  const expiresAt = Number(payload);
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return false;

  const expected = sign(payload, secret);
  const a = Buffer.from(signature, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Constant-time password check, via scrypt rather than a fast hash.
 * CodeQL correctly flagged an earlier HMAC-SHA256 version of this function
 * as "insufficient computational effort" for password hashing — a fast
 * hash makes offline brute-forcing cheap. There's no hash stored at rest
 * here (OPTIMUS_PASSWORD is compared directly each request, not persisted
 * as a hash), but the fix is the same either way: use a KDF meant for
 * passwords. scrypt also sidesteps timingSafeEqual's length-mismatch
 * exception the same way the digest approach did, since its output is
 * always the requested length regardless of input length.
 */
export function passwordMatches(submitted: string, expected: string): boolean {
  const salt = "optimus-password-compare";
  const a = scryptSync(submitted, salt, 32);
  const b = scryptSync(expected, salt, 32);
  return timingSafeEqual(a, b);
}
