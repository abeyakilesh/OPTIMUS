"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Check, EyeIcon, EyeOffIcon, Logo, LockIcon } from "@/components/landing/Icons";
import type { LoginApiResponse } from "@/app/api/auth/login/route";

const POINTS = [
  "Real kernel, real capabilities — nothing here is a demo",
  "Every result verified before it's shown to you",
  "Your own model, running locally",
];

export default function LoginForm({ destination }: { destination: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [reveal, setReveal] = useState(false);
  const [status, setStatus] = useState<"idle" | "checking" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!password || status === "checking") return;
    setStatus("checking");
    setError(null);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = (await res.json()) as LoginApiResponse;

      if (!res.ok || !data.ok) {
        setStatus("error");
        setError(data.reason ?? `sign in failed (${res.status})`);
        return;
      }

      router.push(destination);
      router.refresh();
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "network error");
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* ── form ── */}
      <div className="flex flex-col justify-center px-6 py-12 sm:px-12 lg:px-20">
        <Link href="/" aria-label="OPTIMUS home" className="mb-10">
          <Logo />
        </Link>

        <div className="w-full max-w-[360px]">
          <h1 className="text-[26px] font-semibold tracking-[-0.02em] text-ink">Sign in</h1>
          <p className="mt-2 text-[13.5px] leading-relaxed text-muted">
            OPTIMUS currently uses a single shared password while it&apos;s
            just you — there are no separate accounts yet.
          </p>

          <form onSubmit={submit} className="mt-8 space-y-4">
            <div>
              <label htmlFor="password" className="label mb-1.5 block text-faint">
                Password
              </label>
              <div className="flex items-center gap-2 rounded-lg border border-line-2 bg-white px-3 py-2.5 focus-within:border-cyan">
                <LockIcon className="h-4 w-4 shrink-0 text-faint" />
                <input
                  id="password"
                  type={reveal ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoFocus
                  autoComplete="current-password"
                  placeholder="Enter the access password"
                  className="w-full bg-transparent text-[14px] text-ink outline-none placeholder:text-faint"
                />
                <button
                  type="button"
                  onClick={() => setReveal((v) => !v)}
                  aria-label={reveal ? "Hide password" : "Show password"}
                  className="shrink-0 text-faint transition hover:text-body"
                >
                  {reveal ? <EyeOffIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {status === "error" && (
              <p className="rounded-lg border border-line-2 bg-mist px-3 py-2 text-[12.5px] text-muted">
                <span className="font-medium text-ink">Couldn&apos;t sign in</span> — {error}
              </p>
            )}

            <button
              type="submit"
              disabled={!password.trim() || status === "checking"}
              className="group inline-flex w-full items-center justify-center gap-2 rounded-lg bg-ink px-5 py-3 text-[14px] font-medium text-white transition hover:bg-ink/88 disabled:opacity-40"
            >
              {status === "checking" ? "Signing in…" : "Sign in"}
              {status !== "checking" && <ArrowRight className="fx-nudge h-4 w-4" />}
            </button>
          </form>
        </div>
      </div>

      {/* ── brand panel ── */}
      <div className="relative hidden overflow-hidden bg-ink lg:block">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute inset-0 bg-[radial-gradient(78%_62%_at_50%_18%,rgba(6,182,212,.3),transparent_72%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(40%_46%_at_85%_75%,rgba(6,182,212,.16),transparent_70%)]" />
        </div>

        <div className="relative flex h-full flex-col justify-center px-16">
          <h2 className="max-w-[18ch] text-[clamp(1.8rem,3.2vw,2.6rem)] font-semibold leading-[1.08] tracking-[-0.02em] text-white">
            Not answers. <span className="text-cyan">Outcomes you can check.</span>
          </h2>

          <ul className="mt-9 space-y-3.5">
            {POINTS.map((p) => (
              <li key={p} className="flex items-start gap-2.5 text-[14px] text-white/72">
                <Check className="mt-[3px] h-4 w-4 shrink-0 text-cyan" />
                {p}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
