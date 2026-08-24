import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session";
import LoginForm from "@/components/auth/LoginForm";

export const metadata = { title: "Sign in — OPTIMUS" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const destination = next && next.startsWith("/") ? next : "/chat";

  const secret = process.env.OPTIMUS_SESSION_SECRET;
  const cookieStore = await cookies();
  if (secret && verifySessionToken(cookieStore.get(SESSION_COOKIE)?.value, secret)) {
    redirect(destination);
  }

  return <LoginForm destination={destination} />;
}
