/**
 * THE GATE THAT TURNS "I NOTICED" INTO A MECHANISM.
 *
 * On #89 the first run of the `github.resolve` tests silently reached the real
 * GitHub and returned hono's ACTUAL commit sha instead of the fixture's. Every
 * assertion still passed — the shapes were right, the values were plausible,
 * and the suite was green.
 *
 * It was caught by one thing only: the answer was TOO CORRECT. The test had
 * never been told hono's real sha, so a real sha coming back meant the test
 * double was never installed. That is not a detection mechanism, that is luck
 * wearing a lab coat, and it is exactly what THE ENFORCEMENT RULE names — a
 * belief ("tests never touch the network") with nothing executing it.
 *
 * What the belief actually rested on: `netRead` has had an injectable
 * `fetcher?` since the beginning, its docstring reading "Injectable so tests
 * never touch the real network." `netFetch` was added later with no such seam.
 * Nobody decided tests could reach the network; the seam was simply missing
 * from the newer surface, and no one could tell by looking.
 *
 * WHY A TEST THAT REACHES THE NETWORK IS A BROKEN TEST, even when it is green:
 *
 *   - it passes or fails on someone else's uptime, rate limit and DNS
 *   - it asserts against a value that can change without any commit here
 *   - it is slow in a way that hides which part is slow
 *   - and the worst one: it proves the REAL path works while claiming to prove
 *     the injected path works, so the injection can rot untested forever
 *
 * The last is what happened. The test believed it was exercising a double.
 *
 * LOOPBACK IS NOT THE NETWORK, and this gate drew that line wrong on its first
 * run — it failed the five `net-fetch.test.ts` tests, which start their own
 * HTTP server on 127.0.0.1 and call it. Those are the most hermetic tests in
 * the suite: they depend on nothing outside this process tree, and they are
 * the only tests that exercise the REAL `runFetch` path at all. Blocking them
 * would have deleted the only coverage of the code this gate exists to police.
 *
 * So the rule is not "no sockets" — it is "nothing this test did not itself
 * create." A server the test spawned has no uptime, no rate limit and no
 * owner. An external host has all three.
 *
 * ESCAPE HATCH, deliberately loud: a test that genuinely needs the live
 * network sets `OPTIMUS_ALLOW_REAL_NETWORK=1` for its own process. It is an
 * environment variable and not a helper function because it must be visible in
 * CI configuration rather than buried in a file nobody re-reads.
 */

const ALLOWED = process.env.OPTIMUS_ALLOW_REAL_NETWORK === "1";

/** Loopback only. Hostnames that RESOLVE to loopback are not here on purpose:
 *  this must be decidable from the string, and a DNS lookup to decide whether
 *  a request is allowed is itself a network call. */
const LOOPBACK = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]"]);

function isLoopback(url: string): boolean {
  try {
    return LOOPBACK.has(new URL(url).hostname);
  } catch {
    // An unparseable URL is not demonstrably local, so it is refused. Failing
    // closed matters more here than convenience.
    return false;
  }
}

if (!ALLOWED) {
  const real = globalThis.fetch;

  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === "string" ? input : input instanceof URL ? input.href : String((input as Request).url);

    // The message has to teach, because the person reading it is mid-debug and
    // has just watched a test fail that passed a minute ago.
    if (isLoopback(url)) return real(input, init);

    throw new Error(
      [
        `A test reached the real network: ${url}`,
        "",
        "This is refused, not because the request would fail, but because a test that",
        "reaches the network passes on someone else's uptime and stops exercising the",
        "injected path it was written to exercise. On #89 exactly this made a suite",
        "green while the test double was never installed.",
        "",
        "Inject the seam instead:",
        "  new Broker({ fetcher })        — for capabilities using ctx.netRead",
        "  new Broker({ netFetch })       — for capabilities using ctx.netFetch",
        "  new Broker({ spawn })          — for capabilities using ctx.spawnProcess",
        "",
        "If this test genuinely must hit the live network, run it with",
        "OPTIMUS_ALLOW_REAL_NETWORK=1 and say in the test WHY that is necessary.",
      ].join("\n"),
    );
  }) as typeof globalThis.fetch;

  // Kept reachable so the escape hatch is a real restore rather than a reimport.
  (globalThis as Record<string, unknown>).__realFetch = real;
}
