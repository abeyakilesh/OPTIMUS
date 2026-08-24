# browser.navigate — SERVICE absorption of browser-use

Fate: **SERVICE** (CLAUDE.md: *"browser-use | PORT/SERVICE | LLM browser
agent... Default browser backend"*). Nothing here reimplements browser-use's
logic — `bridge.py` spawns the real, unmodified engine and talks to it over
stdin/stdout; `navigate.ts` is the OPTIMUS-side capability contract.

## Why SERVICE, not PORT

browser-use is 370 Python files: an agent loop, CDP-based browser control
(`cdp-use`, not Playwright), DOM extraction, an MCP server, LLM-provider
integrations. Prime Directive #5: *"Port small, service big... you get its
real byte-for-byte behavior for free."* Porting this to TypeScript would mean
re-deriving CDP protocol handling and DOM-to-text extraction by hand, with no
guarantee of matching upstream — running the real thing is both less work and
more faithful.

## Running this locally

```bash
python3 -m venv .venv
.venv/bin/pip install -r kernel/capabilities/browser-use/requirements.txt
```

You need a real Chromium-family browser. On macOS, Chrome at its default
install path works out of the box; elsewhere, point `chromeExecutablePath` at
any Chrome/Chromium binary (Playwright's cached Chromium builds work too —
see `~/Library/Caches/ms-playwright` if you've run Playwright elsewhere in
this repo).

## What's proven, and how

This capability was verified against a **real, locally-served HTTP fixture**
(loopback only, no external network dependency) before any TypeScript was
written:

```
$ echo '{"url":"http://127.0.0.1:PORT/fixture.html","chromeExecutablePath":"...","timeoutMs":30000}' \
    | python3 bridge.py
{"ok": true, "url": "...", "title": "...", "text": "Product Listing\n[15]<span id=pr-1 />\n\t$42.00"}
```

Real Chrome, launched via real CDP, rendered a real page, and the returned
text is exactly the fixture's content — not a fabricated response.

## A real upstream nuance, found while verifying this

`BrowserSession.get_current_page_title()` reads CDP's cached `target.title`
(`browser_use/browser/session.py`). Against a bare static page served with no
further navigation trigger, this was observed — reproducibly, across 5 polls
over 1.5s, not a one-off race — to still report the request URL rather than
the page's actual `<title>`. `get_state_as_text()` (real rendered DOM text)
was correct every time in the same run. `navigate.ts`'s check
(`browser.navigateSucceeded`) verifies `text`, not `title`, for exactly this
reason — `title` is returned as informational metadata, not something this
capability's correctness depends on.

## Why this isn't in the CI-required test suite

`tests/kernel/capabilities/browser-use-navigate.test.ts` exercises this
capability through the actual kernel harness (permission boundary, budget,
the `browser.navigateSucceeded` check) — but it needs Python 3 and a real
Chrome binary, neither of which the default `ubuntu-latest` gauntlet runner
has. The test is written to skip itself honestly when that environment isn't
present (`describe.skipIf`), rather than being silently absent from the repo
or, worse, mocked into something that would pass without ever touching real
browser-use.

Provisioning Python + Chrome in CI (extending `.github/actions/setup`) is
tracked as follow-up work, not pretended to be done here.

## What is NOT built

Only navigation + text extraction. None of the other 10 MCP tools
(`browser_click`, `browser_type`, `browser_extract_content`, the full
`retry_with_browser_use_agent` task loop) are wired. Each is real, separate
follow-up work — not claimed here.
