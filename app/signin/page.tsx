import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "../../components/landing/Icons";

export const metadata: Metadata = {
  title: "Sign in — OPTIMUS",
};

/**
 * Placeholder, not a stub that fakes success. Auth is an explicit non-goal
 * until v0.3+ (docs/PRD.md, "Explicit non-goals for v0.1") — this page says
 * so instead of pretending a click here logs anyone in.
 */
export default function SignInPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 bg-mist px-6">
      <Link href="/" aria-label="OPTIMUS home">
        <Logo />
      </Link>

      <div className="w-full max-w-[380px] rounded-xl border border-line bg-white p-8 shadow-sm">
        <h1 className="text-[18px] font-medium text-ink">Sign in</h1>
        <p className="mt-1.5 text-[14px] leading-relaxed text-body">
          Not live yet. OPTIMUS is a single-user local app right now — auth,
          accounts and teams land in a later phase.
        </p>

        <form className="mt-6 flex flex-col gap-3" aria-disabled="true">
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-body">Email</span>
            <input
              type="email"
              disabled
              placeholder="you@company.com"
              className="rounded-md border border-line px-3 py-2 text-[14px] text-faint disabled:cursor-not-allowed disabled:bg-mist"
            />
          </label>
          <button
            type="button"
            disabled
            className="cursor-not-allowed rounded-lg bg-ink/40 px-4 py-2 text-[14px] font-medium text-white"
          >
            Continue
          </button>
        </form>

        <Link
          href="/"
          className="mt-6 block text-center text-[13px] text-faint transition hover:text-body"
        >
          ← Back to OPTIMUS
        </Link>
      </div>
    </main>
  );
}
