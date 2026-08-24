/**
 * Box #5's gate. Next.js 16 renamed middleware.ts to proxy.ts — this repo's
 * AGENTS.md flags exactly this kind of breaking change, confirmed against
 * node_modules/next/dist/docs before writing this file. Proxy defaults to
 * the Node.js runtime here, so this can use the same node:crypto-based
 * session verification as the login route, not a separate Edge-only path.
 *
 * Scope is deliberately narrow: only /chat and /api/chat are gated. The
 * marketing site stays public — that's the whole point of a funnel.
 */

import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session";

function hasValidSession(request: NextRequest): boolean {
  const secret = process.env.OPTIMUS_SESSION_SECRET;
  // No secret configured means no token could ever have been legitimately
  // issued (the login route refuses to sign one) — deny outright rather
  // than trust a token signed under a predictable empty key.
  if (!secret) return false;
  return verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value, secret);
}

export function proxy(request: NextRequest) {
  if (hasValidSession(request)) return NextResponse.next();

  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ ok: false, reason: "authentication required" }, { status: 401 });
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", request.nextUrl.pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/chat", "/chat/:path*", "/api/chat"],
};
