#!/usr/bin/env python3
"""
The SERVICE boundary for browser-use (issue: absorb/browser-use, fate: SERVICE
per CLAUDE.md — "browser-use | PORT/SERVICE | ... Default browser backend").

Never rewrite browser-use's logic; run the real engine and talk to it. This
script is spawned as a child process by kernel/capabilities/browser-use/
navigate.ts through CapabilityContext.spawnProcess — never long-lived, never
holds a session across invocations: one JSON request on stdin, one JSON
response on stdout, exit.

Protocol (deliberately not full MCP — xmcp, the kernel-substrate piece that
would make MCP the standard registration path, isn't absorbed yet; this is a
narrower direct protocol for this one capability, upgradeable later without
touching the TypeScript side's permission-boundary contract):

  stdin  (one line, JSON):  {"url": str, "chromeExecutablePath": str,
                             "timeoutMs": int, "headless": bool}
  stdout (one line, JSON):  {"ok": true,  "url": str, "title": str, "text": str}
                          or {"ok": false, "error": str}

Exit code is always 0 when a response was written — errors are reported IN
the JSON, not via process exit code, so the TypeScript side has one place to
look. A non-zero exit with no stdout line means this script crashed before
it could even report the error (caught by the capability's own check).
"""
import asyncio
import json
import sys


async def run(request: dict) -> dict:
    from browser_use.browser.profile import BrowserProfile
    from browser_use.browser.session import BrowserSession

    profile = BrowserProfile(
        executable_path=request.get("chromeExecutablePath"),
        headless=request.get("headless", True),
        # The default profile downloads a few browsing-privacy extensions on
        # first launch. That's a real network call with no bearing on the
        # capability's correctness, and it fails loudly in a sandboxed CI
        # runner with no outbound internet — disable it, not paper over it.
        enable_default_extensions=False,
    )
    session = BrowserSession(browser_profile=profile)
    await session.start()
    try:
        await session.navigate_to(request["url"])
        title = await document_title(session)
        text = await session.get_state_as_text()
        return {"ok": True, "url": request["url"], "title": title, "text": text}
    finally:
        await session.stop()


async def document_title(session):
    """The page's real <title>, read over CDP.

    browser-use 0.13.7's `get_current_page_title()` returns the page URL, not
    the document title — verified directly: navigating to a data: URL whose
    title is "REAL_DOC_TITLE" returns the whole data: URL instead. A validation
    scenario caught it, because the capability's own output contract promises a
    title and was quietly delivering a URL.

    `Runtime.evaluate` gives the actual value, so this asks Chrome directly and
    falls back to the upstream method only if CDP is unavailable — degraded,
    never silently wrong about which one answered.
    """
    try:
        cdp = await session.get_or_create_cdp_session()
        result = await cdp.cdp_client.send.Runtime.evaluate(
            params={"expression": "document.title", "returnByValue": True},
            session_id=cdp.session_id,
        )
        value = result.get("result", {}).get("value")
        if isinstance(value, str):
            return value
    except Exception:
        pass
    return await session.get_current_page_title()


def main() -> None:
    line = sys.stdin.readline()
    try:
        request = json.loads(line)
    except json.JSONDecodeError as error:
        print(json.dumps({"ok": False, "error": f"malformed request: {error}"}))
        return

    try:
        result = asyncio.run(run(request))
    except Exception as error:  # noqa: BLE001 — deliberately broad: any failure
        # in the real engine must come back as a reported error, not a crash
        # with no stdout line at all.
        result = {"ok": False, "error": f"{type(error).__name__}: {error}"}

    print(json.dumps(result))


if __name__ == "__main__":
    main()
