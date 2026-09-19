import { redirect } from "next/navigation";

/**
 * `/signin` was a PLACEHOLDER that said "Not live yet. OPTIMUS is a
 * single-user local app right now — auth, accounts and teams land in a later
 * phase", with an `aria-disabled` form that did nothing.
 *
 * That was honest when it was written and became a lie the moment `/login`,
 * `lib/auth/session.ts` and `proxy.ts` shipped. Auth IS live: the session is
 * signed, verified, and gates every real route. Two pages both titled
 * "Sign in — OPTIMUS", one of which silently does nothing, is a trap — and it
 * caught the owner, who typed the right password into the wrong page and
 * concluded login was broken.
 *
 * THE SELF-DESCRIPTION RULE: a page describing the product's capabilities is a
 * claim about the product. This one stopped matching and nothing noticed,
 * because a placeholder has no test.
 *
 * Kept as a redirect rather than deleted so any existing bookmark still lands
 * somewhere that works.
 */
export default function SignInPage() {
  redirect("/login");
}
