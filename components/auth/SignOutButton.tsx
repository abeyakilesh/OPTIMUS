"use client";

import { useRouter } from "next/navigation";

export default function SignOutButton() {
  const router = useRouter();

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  return (
    <button
      onClick={signOut}
      className="rounded-md border border-line px-2.5 py-1.5 text-[12.5px] text-body transition hover:border-ink/30 hover:text-ink"
    >
      Sign out
    </button>
  );
}
