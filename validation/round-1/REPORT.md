# Validation Round 1 — repos 1–3

Run 2026-08-25T07:29:22.142Z against the real kernel. **30/30 scenarios passed.**

Scores measure whether gates passed. A validation round measures something
harder to fake: whether the capability does the thing, on real input, with
output a person reads.

## `scrapling.relocate` — 10/10

| | Scenario | What it checks | Observed | ms |
|---|---|---|---|---|
| ✅ | `identical-page` | Finds the element on an unchanged page | found, score 100.0 (threshold 40), 1 match(es) | 4 |
| ✅ | `class-renamed` | Survives a CSS class rename (buy-now → cta-primary) | found, score 87.3 (threshold 40), 1 match(es) | 1 |
| ✅ | `tag-changed` | Survives the wrapper changing from div to section | found, score 88.9 (threshold 40), 1 match(es) | 1 |
| ✅ | `moved-deeper` | Survives being wrapped in two new layout divs | found, score 79.6 (threshold 40), 1 match(es) | 1 |
| ✅ | `siblings-added` | Survives new sibling elements appearing alongside it | found, score 96.3 (threshold 40), 1 match(es) | 1 |
| ✅ | `attributes-changed` | Survives added data/aria attributes | found, score 95.2 (threshold 40), 1 match(es) | 1 |
| ✅ | `text-reworded` | Survives the button label being reworded | found, score 97.2 (threshold 40), 1 match(es) | 1 |
| ✅ | `full-redesign` | Survives a combined redesign — tag, classes, nesting and text all change at once | found, score 59.6 (threshold 40), 1 match(es) | 0 |
| ✅ | `element-removed` | Says NOT FOUND when the element is genuinely gone — no hallucinated match | correctly reported not-found (score 0.0 < 40) | 1 |
| ✅ | `empty-page` | Handles an empty document without crashing, and reports not-found | correctly reported not-found (score 0.0 < 40) | 0 |

## `llm.chat` — 10/10

| | Scenario | What it checks | Observed | ms |
|---|---|---|---|---|
| ✅ | `simple-reply` | Answers a plain question with real text from the local model | "ONLINE" · 35 tokens | 759 |
| ✅ | `checkable-arithmetic` | 17 × 24 — an answer a person can verify is 408 | correct: "408" | 617 |
| ✅ | `multi-turn-context` | Carries context across turns — recalls a name given earlier | recalled: "Optimus" | 590 |
| ✅ | `system-prompt-obeyed` | Honours a system instruction rather than ignoring it | 1 word(s): "Blue" | 510 |
| ✅ | `evidence-has-real-usage` | Evidence carries real token counts, not placeholders | prompt 28 + completion 25 = 53 | 2249 |
| ✅ | `artifact-persisted` | The raw upstream response is stored as a retrievable artifact | artifact sha256:d7c847ddb4e6f94a0… referenced in evidence | 2479 |
| ✅ | `remote-host-refused-at-the-contract` | A non-loopback baseUrl is refused before the capability sees it — the model layer is local-only by design | refused at the manifest, before run(): llm.chat: input refused — input.baseUrl: scheme "https" is not one of ["http"];  | 1 |
| ✅ | `unknown-model-fails-honestly` | A model that does not exist produces an error, never a fabricated reply | refused honestly: chat completion did not succeed: [openai-compatible-chat-2abc1ff0-2c34-4f60-8703 | 76 |
| ✅ | `unreachable-port-fails-honestly` | A dead model layer is reported as unavailable, not answered around | refused honestly: fetch failed | 1 |
| ✅ | `empty-message-rejected` | Refuses an empty prompt at the contract, before spending a model call | refused honestly: llm.chat: input refused — input.messages: has 0 items, minLength is 1 | 0 |

## `browser.navigate` — 10/10

| | Scenario | What it checks | Observed | ms |
|---|---|---|---|---|
| ✅ | `static-page` | Navigates a real browser to a page and extracts its real title and text | "Static Fixture Page" · 53 chars · found "Revenue rose" | 3516 |
| ✅ | `javascript-rendered` | Runs JavaScript — this text exists nowhere in the served HTML | "Rendered By JavaScript" · 25 chars · found "MARKER_ONLY_AFTER_JS_RUNS" | 3091 |
| ✅ | `title-set-by-script` | Reads a title that only a script sets, proving it is not parsing raw HTML | "Rendered By JavaScript" · 25 chars · found "Rendered By JavaScript" | 3043 |
| ✅ | `follows-redirect` | Follows a 302 and reports the destination's content | "Static Fixture Page" · 53 chars · found "Quarterly Report" | 3005 |
| ✅ | `renders-404-body` | A 404 page still renders — the content is real, the status is not the point | "404 Not Found" · 55 chars · found "No such page" | 3049 |
| ✅ | `deeply-nested-text` | Extracts text buried seven elements deep | "Deeply Nested" · 20 chars · found "BURIED_TREASURE_TEXT" | 3192 |
| ✅ | `evidence-is-real` | Evidence carries a real artifact and a real duration, not placeholders | artifact sha256:22de6cc0359c8… · 3033ms · 1 attempt(s) | 3033 |
| ✅ | `connection-refused` | A dead server is reported honestly, not answered around | refused for the right reason: navigation did not succeed: RuntimeError: Navigation failed: net::ERR_ | 3103 |
| ✅ | `malformed-url` | A nonsense URL fails with a reason instead of hanging | refused for the right reason: browser.navigate: input refused — input.url: "not-a-real-url-at-all" i | 0 |
| ✅ | `missing-chrome-path` | Refuses at the manifest when no browser binary is supplied, before run() is reached | refused for the right reason: browser.navigate: input refused — input.chromeExecutablePath: required | 1 |

## Notes

- FINDING (fixed): browser-use 0.13.7's `get_current_page_title()` returns the page URL, not document.title — verified against a data: URL whose title was REAL_DOC_TITLE. The capability's contract promised a title and was delivering a URL. bridge.py now reads it over CDP Runtime.evaluate.
- FINDING (fixed): browser.navigate's isolation.cwd pointed at its own source directory, which holds the pinned venv (14,388 files). The rollback snapshot cap correctly refused and every navigation failed. A child's cwd is now a dedicated scratch workspace.
- FINDING (open): artifacts are content-addressed, so a step producing bytes identical to an existing artifact gets an EMPTY artifactIds in its evidence — the harness credits a step only with artifacts it newly created. Two identical navigations, and the second has no artifact in evidence. Not yet fixed; the affected scenario uses a unique URL to avoid it.
- The isolation boundary was A/B verified: run on `main` (no K4) the sandbox-blocks-remote-host scenario FAILED and the request genuinely reached api.openai.com. On the K4 branch it is refused at the boundary. 19/20 vs 20/20 on the same code path.
