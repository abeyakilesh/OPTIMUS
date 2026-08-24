import { describe, it, expect, vi } from "vitest";
import { createSessionToken, verifySessionToken, passwordMatches } from "../../lib/auth/session";

describe("session token — real HMAC, not a stub", () => {
  it("a token created with a secret verifies against that same secret", () => {
    const token = createSessionToken("secret-a");
    expect(verifySessionToken(token, "secret-a")).toBe(true);
  });

  it("rejects a token verified against a different secret", () => {
    const token = createSessionToken("secret-a");
    expect(verifySessionToken(token, "secret-b")).toBe(false);
  });

  it("rejects a tampered payload even with a valid-looking signature", () => {
    const token = createSessionToken("secret-a");
    const [, signature] = token.split(".");
    const tampered = `${Date.now() + 999_999_999}.${signature}`;
    expect(verifySessionToken(tampered, "secret-a")).toBe(false);
  });

  it("rejects a malformed token instead of throwing", () => {
    expect(verifySessionToken("not-a-real-token", "secret-a")).toBe(false);
    expect(verifySessionToken("", "secret-a")).toBe(false);
    expect(verifySessionToken(undefined, "secret-a")).toBe(false);
    expect(verifySessionToken(null, "secret-a")).toBe(false);
  });

  it("rejects an expired token", () => {
    const real = Date.now;
    vi.spyOn(Date, "now").mockReturnValue(real() - 8 * 24 * 60 * 60 * 1000);
    const token = createSessionToken("secret-a");
    vi.spyOn(Date, "now").mockReturnValue(real());

    expect(verifySessionToken(token, "secret-a")).toBe(false);
    vi.restoreAllMocks();
  });
});

describe("passwordMatches — real comparison, not always-true", () => {
  it("matches the correct password", () => {
    expect(passwordMatches("hunter2", "hunter2")).toBe(true);
  });

  it("rejects a wrong password", () => {
    expect(passwordMatches("wrong", "hunter2")).toBe(false);
  });

  it("rejects a password differing only in length, without throwing", () => {
    expect(passwordMatches("hunter2extra", "hunter2")).toBe(false);
    expect(passwordMatches("", "hunter2")).toBe(false);
  });
});
