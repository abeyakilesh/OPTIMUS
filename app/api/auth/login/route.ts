import { NextResponse, type NextRequest } from "next/server";
import { createSessionToken, passwordMatches, SESSION_COOKIE } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export interface LoginApiResponse {
  ok: boolean;
  reason?: string;
}

export async function POST(request: NextRequest) {
  const secret = process.env.OPTIMUS_SESSION_SECRET;
  const password = process.env.OPTIMUS_PASSWORD;

  // Fail closed, not open: no default password, no default secret. A
  // login route that "works" without either configured would be exactly
  // the fake gate Directive #4 rules out.
  if (!secret || !password) {
    return NextResponse.json(
      { ok: false, reason: "auth is not configured on this deployment (OPTIMUS_PASSWORD / OPTIMUS_SESSION_SECRET unset)" } satisfies LoginApiResponse,
      { status: 500 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, reason: "invalid JSON body" } satisfies LoginApiResponse, { status: 400 });
  }

  const submitted = (body as { password?: unknown })?.password;
  if (typeof submitted !== "string" || submitted.length === 0) {
    return NextResponse.json({ ok: false, reason: "requires { password: string }" } satisfies LoginApiResponse, { status: 400 });
  }

  if (!passwordMatches(submitted, password)) {
    return NextResponse.json({ ok: false, reason: "incorrect password" } satisfies LoginApiResponse, { status: 401 });
  }

  const response = NextResponse.json({ ok: true } satisfies LoginApiResponse);
  response.cookies.set(SESSION_COOKIE, createSessionToken(secret), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return response;
}
