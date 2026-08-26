# Defect classes

*One row per **class**, not per instance. Built 2026-08-26 by reading all 46 PRs, 11 issues and 44 commits
on `main` — every instance below cites a real ref. Nothing here was reconstructed from memory, and no class was
invented to reach a round number.*

## Why this file exists

CI has caught a great many mistakes in this repo, and until now the lessons lived scattered across PR bodies,
commit messages and issue comments. Nothing accumulated. The same class kept recurring in a new costume and
being rediscovered from scratch — **three times** for *a test that passes without exercising its subject*,
**four times** for *a description claiming changes it does not contain*. A defect that recurs was never
classified.

## Coverage

> **78 classes · 66 with a real detection mechanism · 12 UNDETECTED**
>
> The UNDETECTED figure above is the one that matters: those classes have nothing stopping them
> recurring today. Several of the "detected" are covered by a single test rather than a general
> mechanism — the count says a check exists, not that the class is solved.
>
> Deliberately no numbers in this paragraph. The line above is generated; the first draft of this
> sentence hand-counted "Eleven" and "sixty" beside it and was stale within two commits
> (`stale-duplicate`, caught in PR #62).
> Each UNDETECTED row names either the check that should exist or the issue tracking it; per THE ENFORCEMENT
> RULE, "we know about it" is not a mechanism.
>
> **This line is generated, not typed.** `scripts/defect-registry.mjs --update` writes it from the actual rows,
> and the gate fails if it drifts. The first draft of this file claimed *57 classes · 31 detected · 26
> UNDETECTED* with 69 rows present — `count-in-summary-disagrees-with-rows`, committed inside the registry that
> catalogues it, which is why the check exists.

**How to read a Detection line.** `file :: identifier` names something that actually exists and is checked by
`scripts/defect-registry.mjs` on every PR. `UNDETECTED` means exactly that — no automation, and the entry must
name a tracking issue or a reason it cannot be automated.

---

## A · Descriptions that do not match what they describe

### `stale-duplicate`

**Looks like:** One fact stored in two places; the copy nobody edits goes stale and is the one people read.

**Instances:** PR #33 (`gauntlet.yml` printed *"gate 10 · isolation invariants | no sandbox"* for a full day after K4 merged, while 24 assertions enforced it); PR #33 (CLAUDE.md said **554** ast-grep rules; the real count is **184**); issue #60 (`MemoryArtifactStore.has()` re-implemented the integrity comparison inline as `addressOf(found) === id` instead of calling `verifyIntegrity` — caught by mutation testing **within the hour**, when stripping verification out of `get()` left that adapter's `has()` still answering correctly off its own private copy of the rule). PR #62 — the paragraph directly beneath the registry's own generated coverage line hand-counted *"Eleven classes"* and *"sixty detected"*; both were stale within two commits, **inside the file whose gate exists to stop exactly this**. Fixed by removing the numbers from the prose rather than re-syncing them.

**Why it survived:** Both copies were correct when written. Nothing tied them together, so editing one never prompted the other.

**Detection:** `scripts/gate-coverage.mjs` :: derives the summary from `CI_STATUS.md`; `tests/unit/gate-coverage.test.ts` :: *the workflow actually invokes the generator*

**Rule:** A fact gets one home, and every reader derives from it.

---

### `stale-single-source`

**Looks like:** After consolidating to one copy, that copy goes stale against reality. Divergence is fixed; rot is not.

**Instances:** PR #33 (gate 6's blocker still read *"nothing absorbed yet"* with three repos absorbed — found **inside** the single source, in the same PR that created it); PR #38 (`CI_STATUS.md` said gate 2 had *7 tests*, actual **213**; gate 11 *6 tests*, actual **19**); PR #53 (*"No repo absorbed. Every repo sits at 0/100"* with three absorbed and scored).

**Why it survived:** Single-sourcing feels like completing the job. It stops two copies disagreeing with *each other* and does nothing about the survivor disagreeing with the world.

**Detection:** **UNDETECTED** — no freshness check exists for prose in `CI_STATUS.md`. Numbers that can be recomputed have been moved to where they are computed (PR #38), which shrinks the surface without closing it.

**Rule:** A single source needs its own freshness check, or you have traded two copies that disagree for one that is confidently wrong.

---

### `pr-body-not-diff`

**Looks like:** A PR description claims changes that are not in its diff.

**Instances:** PR #33 (described three CLAUDE.md rules that were real but in a **different git repo** — not one line in the diff); PR #35 (the workspace pointer file, called out explicitly rather than implied); PR #36 (body first said **20** files; `git diff --name-only` listed **21** — corrected before merge).

**Why it survived:** The edits were genuinely made. The author knew they existed and did not check *where*.

**Detection:** `.github/PULL_REQUEST_TEMPLATE.md` :: *Every change this description claims is actually in the diff* — a checklist item ticked by someone who ran `git diff --name-only`.

**Rule:** A description is a claim about a thing that exists somewhere else, and is checked against that thing before it ships.

---

### `commit-message-not-contents`

**Looks like:** A commit message describes something other than what the commit contains.

**Instances:** Commit `6e54fae` — message *"probe: post-private push test"*, contents **433 deletions of CLAUDE.md**. A staged `git rm --cached` from another branch survived a `git checkout` and was swept in by `--allow-empty`. Corrected in PR #47.

**Why it survived:** The outcome was intended and correct, so nothing looked wrong afterwards. Only the path was misdescribed, and `git log` is the only place that shows it.

**Detection:** **UNDETECTED** — no gate can know what a message *meant*. PR checklist item: *every commit's `--stat` matches its subject*.

**Rule:** A commit message is a contract with whoever reads `git log` — the description with the longest half-life in the project.

---

### `comment-and-code-disagree`

**Looks like:** A docstring or comment promises behaviour the implementation never had.

**Instances:** PR #28 — `ProcessSpec`'s docstring promised a *"minimal safe base"* environment; the implementation did `env: { ...process.env, ...spec.env }`, handing every child **every provider key in `.env`** plus `OPTIMUS_SESSION_SECRET`.

**Why it survived:** The comment was aspirational and read as descriptive. Nobody re-read it against the code beneath it.

**Detection:** `tests/kernel/sandbox.test.ts` :: the env-stripping assertion (`OPTIMUS_TEST_SECRET` must print `undefined` in the child)

**Rule:** Where a comment and the code disagree, assume the code is the insecure one until proven otherwise.

---

### `config-describes-nonexistent-system`

**Looks like:** A config file documents behaviour or variables the system does not have.

**Instances:** PR #43 — `.env.example` claimed OPTIMUS *"never talks to a provider"* (false) and that `ANTHROPIC_AUTH_TOKEN` accepts *"any non-empty value"* (false — OmniRoute validates against its own database); provider keys sat in OmniRoute's own `DOC_ONLY_ALLOWLIST` under *"Removed / Dead Variables"* while appearing live.

**Why it survived:** Example files are written once at the start and never re-run. Nothing executes them, so nothing contradicts them.

**Detection:** **UNDETECTED** — no check parses `.env.example` against real behaviour.

---

### `advertised-not-measured`

**Looks like:** A count obtained by asking is reported as a count obtained by measuring.

**Instances:** PR #45 — the providers page shipped **"Models routable: 286"**. Measured: exactly **1** answered (`ollama/llama3.2:latest`); `auto/best-fast` → 429, `dva/gpt-4o` → 400. Shipped in the very PR that fixed six other number defects.

**Why it survived:** The number came from a real API call, so it felt measured. The *label* was never audited — only the value.

**Detection:** `tests/e2e/providers.spec.ts` :: asserts the word *routable* cannot return and the advertised≠reachable caveat is present

**Rule:** A count is measured, or it is labelled advertised. Where they disagree, show both.

---

### `claim-wider-than-evidence-scope`

**Looks like:** Evidence is gathered over one scope and the conclusion is stated over a larger one. A search of one directory becomes "does not exist anywhere"; a sample of one third of a document becomes a characterisation of all of it. The sentence never carries the scope, so the mismatch is invisible once the command has scrolled away.

**Instances:** PR #61 — `OPTIMUS_AUDIT_2026-08-26.md` reported *"no Atlas file, `/roadmap/` directory, or domain files exist anywhere"* on the strength of `find . -iname "*atlas*"` run inside `OPTIMUS/`. One directory up sat **1.28 MB** across three files, and the audit's own recommended next step was *"split the Atlas"*. PR #62 — having read ~35% of `OPTIMUS and ATLAS RAW BRAIN 1.0.txt`, I characterised the remainder as *"a human learning syllabus"* and filed it as skippable. Lines 5954–7832 are a **50-section specification for OPTIMUS's knowledge-acquisition subsystem**, addressed to this repo's build bible by name, whose §49 is titled *"Relationship to the existing OPTIMUS kernel"*. The unread 65% contained the most relevant document in the corpus, and the dismissal was published as a scope-free judgement about the whole file.

**Why it survived:** Both directions of this are self-sealing. A negative result has no artifact anyone can open, so "X does not exist" invites no check. A characterisation ("this is a syllabus") reads as a summary rather than a claim, and summaries are not audited. In both cases the honest sentence — *"in the 35% I read"* — is longer and weaker-sounding than the wrong one, so it loses.

**Detection:** **UNDETECTED** — no gate can know the intended scope of a prose claim. Partially mitigated by `docs/OPERATING_CONTEXT.md` §1 and §1a, which record where the Atlas is and what is actually in it, so these two specific errors cannot be re-derived, and §7, which requires a control query and a coverage fraction before asserting an absence. That is a document, not a mechanism, and it is written down as such.

**Rule:** State the scope you covered in the same sentence as the conclusion, or do not state the conclusion. A sample characterises the sample.

---

### `count-in-summary-disagrees-with-rows`

**Looks like:** A summary states a total that no longer matches the thing it summarises.

**Instances:** PR #36 (body claimed 20 changed files, diff had 21); this very file's coverage line is the same risk.

**Why it survived:** Totals are typed by hand at the end and never recomputed.

**Detection:** `scripts/defect-registry.mjs` :: recomputes the class count from actual rows and fails on disagreement

---

## B · Tests and checks that cannot fail

### `test-passes-without-subject`

**Looks like:** A test stays green when the thing it names is deleted — it is testing something else.

**Instances:** PR #36 (`never opens a socket` passed with `validateInput` **removed**; K4 already blocked the socket); PR #36 (AC-3's `input: {}` began failing at the **manifest door** instead of at the check — still red, still passing, no longer testing verification); PR #66 (the same thing to the same test one door later, plus the `fail` demo in `kernel/cli.ts` and three check-logic suites — see `new-door-inherits-old-failures`, where this instance is recorded in full); PR #53/#57 (the absorption guard's file-based checks: every test left `BASE_SHA` unset, so `changed` was `[]` and `.some()` never ran its callback — the path stayed dead through **both the fix and the test written to prove the fix**); PR #18 (two mutations *looked* caught; one was caught by a second guard, the other by the harness's own exception net); PR #15 (an autojunk fixture purged a character absent from the other sequence, so the purge had zero observable effect).

**Why it survived:** Green is indistinguishable from relevant. Running a test is not the same as exercising it.

**Detection:** **UNDETECTED as a gate** — mutation testing is the mechanism and no runner is wired. PR checklist item: *every new test was run against a broken subject and observed to fail*.

**Rule:** A test must be shown to fail when its subject is removed, or it is not yet a test. (THE MUTATION RULE)

---

### `new-door-inherits-old-failures`

**Looks like:** A new validation layer is added UPSTREAM of an existing one. Every test that was proving the downstream layer blocks something keeps failing — so it stays green — but the refusal now comes from the new door, and the test has stopped exercising its subject. Uniquely nasty because the tests never go red: there is no moment where anyone is asked to look.

**Instances:** PR #36 added the input contract and AC-3's sabotage began failing at the manifest door instead of at `title.nonEmpty` (recorded under `test-passes-without-subject` too — one event, two sides). PR #66 added the output contract and did it **three more times in one commit**: (1) AC-3 again — its sabotage returned `artifactId: undefined`, which the new door refuses, so the *second* time this exact test has been captured by a *different* door; (2) `kernel/cli.ts`'s `npm run mission fail` demo, whose entire purpose is showing verification block a lie, started printing `capability.completed — output does not match its declared outputs` instead of `title.nonEmpty — expected a non-empty title`; (3) the `.fake` check-logic suites in `omniroute-chat`, `browser-use-navigate` and `scrapling-capability`, whose canned outputs used placeholder values (`artifactId: "x"`, a one-field fingerprint) the real manifests correctly refuse.

**Why it survived:** Adding a door feels like pure addition — nothing is deleted, nothing goes red, CI is green in both directions. The failing assertion is usually `expect(status).not.toBe("passed")`, which is true no matter which layer refused. And the person adding the door is thinking about the door, not about which existing tests were relying on getting past it. Note that (1) and (2) are the SAME sabotage: it was fixed once in the test and left unfixed in the demo, because only one of the two has any CI coverage at all.

**Detection:** `tests/kernel/acceptance.test.ts` :: AC-3 asserts `failed` contains `title.nonEmpty` and NOT `capability.completed` — that pair is what caught instance (1) in both PRs, and it is the generalisable form: **name which gate blocked, never merely that something did**; `tests/kernel/output-contract.test.ts` :: asserts the contract violation is reported instead of the check verdict when both would fail; `tests/kernel/scrapling-capability.test.ts` and `tests/kernel/capabilities/omniroute-chat.test.ts` :: the check-logic suites now assert `checks.map(c => c.checkId)` equals the declared check. **Partial** — instance (2) was found by running the demo by hand, because `kernel/cli.ts` has no CI coverage (scheduled for PR B).

**Rule:** A test that asserts a failure must name WHICH gate produced it. Adding a validation layer is not a pure addition: every test asserting a refusal downstream of it has to be re-read.

---

### `shape-not-meaning`

**Looks like:** An assertion checks a value's type or shape where its contract promises a specific meaning.

**Instances:** PR #33/#18 — `browser.navigate` shipped a **URL in its `title` field** from absorption until Validation Round 1, behind `expect(typeof output.title).toBe("string")`.

**Why it survived:** The assertion looks like a test and passes on every wrong string forever.

**Detection:** `tests/unit/model-contract.test.ts` :: *rejects the RIGHT SHAPE with the WRONG ANSWER* — the worked example, where valid JSON about Paris fails because Tokyo was asked

**Rule:** An assertion must test the value's MEANING, not its shape.

---

### `correct-diagnosis-wrong-conclusion`

**Looks like:** A defect is observed and correctly diagnosed, and the correct diagnosis is then used to justify removing the assertion that caught it.

**Instances:** PR #33 — a session observed `browser.navigate`'s bad `title`, polled it **5 times over 1.5s** to rule out a race, correctly identified it as upstream, and deleted the assertion with an honest paragraph explaining why.

**Why it survived:** The reasoning sounds sound, which makes it harder to catch than a plain wrong answer.

**Detection:** **UNDETECTED** — this is a judgement failure, not a code pattern. The assertion rule in CLAUDE.md is the counter.

**Rule:** *"The capability doesn't control this"* is true and irrelevant. Fix it in the adapter or change the contract; never weaken the assertion to match the bug.

---

### `unreachable-guard-claimed-critical`

**Looks like:** A defensive branch is documented as load-bearing while no input can reach it.

**Instances:** PR #57 — the repair's contract-violation guard, commented *"the most important branch in the file"*. Deleting it left **all 12 tests green**: a violation with `found: true` is stopped by the found-guard, and with `found: false` it forces `next >= current` and declines anyway.

**Why it survived:** It was written first and read as primary. Nothing tried to reach it.

**Detection:** `tests/kernel/relocate-repair.test.ts` :: *never yields a repair when the contract check failed* — asserts the behaviour rather than crediting the branch

---

### `predicate-asserts-more-than-it-checks`

**Looks like:** A TypeScript type predicate (`function f(v: unknown): v is T`) validates fewer fields than `T` declares. The compiler takes the signature at its word, so every downstream use is typed on a claim nothing verified — and `tsc` stays green precisely where it should have caught the gap.

**Instances:** PR #65 — adding a required `trust` field to `LlmChatMessage` should have broken `app/api/missions/route.ts`, which builds `LlmChatMessage[]` from an HTTP body. `tsc --noEmit` exited **0**. The cause was `isValidMessages(value: unknown): value is LlmChatMessage[]`, which checked `role` and `content` and nothing else: the predicate asserted the new field into existence. Untagged messages would have reached the broker and been refused at runtime with a 503 rather than a 400 — and had the manifest field been optional, they would have reached the model. PR #66 — the sweep #65 asked for. `looksLikeCapability(value: unknown): value is Capability` in `tests/kernel/registry.test.ts` checked `manifest?.id` and `typeof run === "function"`: **six manifest fields asserted, one examined**, in the predicate the registry-completeness test uses to decide what counts as a capability. Adding required `outputs` to the manifest would have widened the gap silently.

**Why it survived:** A predicate is the one place TypeScript deliberately stops checking and defers to the author, and it looks like validation while being an assertion. The failure is also invisible in the direction people test: the predicate correctly rejects malformed input, so its tests pass. What it silently *accepts* is the type claim itself, and nothing exercises that.

**Detection:** `lib/missions/clientMessages.ts` :: the predicate narrows to a `ClientMessage` type it fully checks, and the kernel-side type is produced by `asOperatorMessages` rather than asserted; `tests/kernel/message-provenance.test.ts` :: asserts the boundary refuses client-supplied provenance; `tests/kernel/registry.test.ts` :: `MANIFEST_FIELD_PRESENT` is typed `Record<RequiredKeys<CapabilityManifest>, …>`, so adding a required field to the manifest fails `tsc` until a check for it exists, and an `it.each` over the same list deletes each field and requires a rejection. **Still partial, and the limit is now a measured one rather than an unexamined one.** The repo has **11** type predicates (PR #66 enumerated them); **3** narrow from `unknown` and only those can assert a field that does not exist — the other 8 narrow within an already-typed union, where the worst available error is mis-selecting a member that is itself fully typed. `tsc` never verifies a predicate's BODY in either case, so nothing general sweeps for this; what exists is a per-predicate mechanism on the one that guards the manifest.

**Rule:** A type predicate must check every field of the type it asserts, or narrow to a smaller type it does check.

---

### `check-cannot-fail-by-construction`

**Looks like:** A check's failing branch is unreachable because of how its input is produced.

**Instances:** PR #57 — `relocateContractHonored`'s `found=false` branch asserts `score >= percentage` must not hold, but the capability reported `score: 0` on every miss, which is below every threshold.

**Why it survived:** The check was written correctly against a contract the producer silently violated.

**Detection:** `tests/kernel/relocate-repair.test.ts` :: the honest-miss case now carries a real score (66.5), making the branch reachable

**Rule:** A check that cannot fail is not a check.

---

### `orphan-module`

**Looks like:** Code that exists, has green tests, and protects nothing because nothing calls it.

**Instances:** PR #29/#31 — `kernel/rollback.ts` was imported by **nothing but its own test**. It passed AC-5, was load-bearing for zero capabilities, and gated every AVAILABLE score.

**Why it survived:** Its own tests passed, so it looked finished. Nothing asked whether production used it.

**Detection:** `tests/kernel/rollback-wiring.test.ts` :: mutation *"unwire it from the harness"* fails 4 tests — reverting to the orphan state now breaks the suite

---

### `test-hands-answer-to-subject`

**Looks like:** A test supplies the very information the production caller would have to discover, hiding that the production path cannot get it.

**Instances:** PR #29 — AC-5 handed `rollback()` the exact file the mission had created. `snapshot()` took an explicit watched-file list, so real use required the caller to already know what a capability would touch. Nothing ever knew, so it stayed unwired for months.

**Why it survived:** The test passed and read as proof the module worked.

**Detection:** `kernel/rollback.ts` :: `rollbackScope()` derives the radius from `manifest.isolation`, so no caller hand-feeds it

---

### `environment-dependent-test`

**Looks like:** A test's verdict depends on the machine it runs on.

**Instances:** PR #26 — the *model layer unreachable* e2e assumed CI has no OmniRoute; it failed the moment it ran where OmniRoute was live. Now pinned to **port 9** (discard). PR #43 — `npm test` made **real credentialed calls to three third parties** on every run until `playwright.config.ts` blanked the provider keys.

**Why it survived:** It passed on the author's machine and in CI, which are the only two places anyone looked.

**Detection:** `playwright.config.ts` :: blanks `GROQ_API_KEY`/`MISTRAL_API_KEY`/`GEMINI_API_KEY`; `tests/e2e/missions.spec.ts` :: pins the unreachable case to port 9

---

### `rotted-test-asserting-copy`

**Looks like:** A test asserts exact prose that later changes, failing while the product is correct.

**Instances:** PR #8 — the testimonial e2e asserted `/not inventing any/i`, a sentence since rewritten. Now asserts the invariant it cares about: **zero `<blockquote>` elements** plus placeholder copy.

**Why it survived:** It was correct when written; the assertion was tied to wording rather than to the property.

**Detection:** `tests/e2e/landing.spec.ts` :: the blockquote-count invariant

---

### `fixture-generation-bug`

**Looks like:** The fixture generator is wrong, so the golden encodes a defect and every test agrees with it.

**Instances:** PR #15 — the xpath excluded `html`/`body`/`head` but not `<ul>`, so an off-by-one picked the wrong `<li>`; and the first autojunk fixture purged a character absent from the other sequence, making the purge unobservable.

**Why it survived:** Goldens are trusted by definition. A wrong golden makes the port look faithful to it.

**Detection:** `kernel/fixtures/generate_golden.py` :: pinned by sha256 in `kernel/fixtures/goldens.json`, checked by `scripts/fidelity-check.mjs`

---

### `generator-invents-inputs`

**Looks like:** A regeneration script silently replaces the real inputs with new ones, producing a clean-looking golden derived from nothing.

**Instances:** PR #54 — my first draft of `generate_sequence_matcher_golden.py` invented its own cases, which would have replaced `autojunk-trigger`, `unicode-emoji` and `partial-overlap` with fabricated ones while looking like a faithful regeneration and passing everything.

**Why it survived:** The output is well-formed and the diff looks like a routine refresh.

**Detection:** `scripts/fidelity-check.mjs` :: re-runs the generator and diffs against the committed golden; `tests/unit/fidelity-check.test.ts` :: *catches a generator changed without its golden being regenerated*

---

### `grading-a-cache`

**Looks like:** A check validates a stored response instead of the system it claims to exercise.

**Instances:** PR #51 — the model contract's three probe prompts were fixed, and the gateway caches on message content. Identical prompt **0.08s**, novel prompt **28.99s**; varying `seed` or `user` did not miss the cache. Every run after the first graded a stored string, and `maxAgeDays` re-qualification would have re-read the very entry it existed to replace.

**Why it survived:** It passed, quickly. A fast green check attracts no attention.

**Detection:** `kernel/models/contract.ts` :: `withNonce()`; `tests/unit/model-qualification.test.ts` :: *sends a unique request-id line, because the gateway caches on message content*

**Rule:** A suspiciously fast pass is a signal, not a win.

---

## C · Rules and gates that enforce nothing

### `rule-without-mechanism`

**Looks like:** A rule is written down clearly, believed to be in force, and executed by nothing.

**Instances:** PR #41 — `.github/branch-protection.md` documented the non-negotiables **with the exact `gh api` command** and nobody ran it: `GET .../protection` → **404**, `/rulesets` → `[]`, for **38 PRs**. PR #41 — gate 11 (35 of 100 score points) was a hand-typed value in a vitest file. PR #33 — *"these gates are not implemented"* was a hardcoded table nothing derived from truth.

**Why it survived:** Writing the rule down feels like completing it. Building the mechanism looks like a follow-up rather than like the actual thing.

**Detection:** `.github/branch-protection.json` :: applied and verified; `scripts/gate-coverage.mjs` :: derives the absent-gate list; every rule in CLAUDE.md now names its mechanism or is marked UNENFORCED

**Rule:** A rule that isn't executed by something is a comment. (THE ENFORCEMENT RULE)

---

### `applied-not-verified`

**Looks like:** A setting is applied and the task closed, without checking that it does anything.

**Instances:** PR #41 — the corollary was written into the PR that applied branch protection, precisely because running the command and closing #37 would repeat the original mistake one level up. Discharged by PR #42, a deliberately-red PR confirmed `BLOCKED`.

**Why it survived:** The API returns 200. That looks like proof.

**Detection:** `.github/branch-protection.md` :: a six-item checklist ending in *a deliberately-red PR that is actually refused*, all six ticked with the evidence that ticked them

**Rule:** Applying a setting is not verifying it.

---

### `closed-on-fix-not-observation`

**Looks like:** An issue tracking *"this has never been observed working"* is closed when the fix is written rather than when the behaviour is seen.

**Instances:** Issue #44 — titled *"the kernel/** → e2e change-detection fix has never been observed running"*, closed `COMPLETED` at 13:04:38Z with **zero comments**. The behaviour was first observed at 14:05:39Z on PR #50, an hour later. Evidence attached retrospectively.

**Why it survived:** The fix was correct, so closing felt accurate.

**Detection:** **UNDETECTED** — no automation can tell a fix from an observation.

**Rule:** Don't let *"we fixed it"* and *"we watched it work"* blur.

---

### `protection-with-trivial-required-list`

**Looks like:** Branch protection is applied while requiring almost nothing, so it looks enforced and blocks nothing.

**Instances:** PR #41 — the config as it stood listed **two** contexts: `change detection` and `gate coverage (read me)`. Applying it would have protected `main` while **build, unit and every security gate stayed optional** — a protected branch that lets a compile failure through, wearing a green padlock. Now **12**.

**Why it survived:** A padlock icon and a 200 from the API are the whole visible surface.

**Detection:** `tests/unit/gate-coverage.test.ts` and `.github/branch-protection.json` :: the required-context list is explicit and reviewed; `scripts/defect-registry.mjs` does not cover this — see `.github/branch-protection.md`

---

### `gate-not-run-on-own-code`

**Looks like:** A gate is filtered so that changes to the gate itself do not trigger it.

**Instances:** PR #9 — `supply-chain` was gated on `deps` alone, so PR #8's rewrite of `scripts/license-gate.mjs` **skipped the gate it rewrote**. It merged unproven by its own PR.

**Why it survived:** It passed on `push` after the merge — which is after the point where it could block anything.

**Detection:** `.github/actions/ci-filter/action.yml` :: `ci` filter includes `scripts/**`; `supply-chain` runs on `ci` as well as `deps`

**Rule:** A gate must run when the gate's own code changes.

---

### `gate-scoped-to-wrong-trigger`

**Looks like:** A workflow's trigger filter silently excludes whole classes of PR.

**Instances:** PR #30 — `on.pull_request.branches: [main]` meant a PR to any other base ran **zero gates**. PR #29 (stacked on #28) came back with four Vercel entries and nothing else: no build, no typecheck, no unit, no CodeQL, no secret scan.

**Why it survived:** The PR page showed checks — just not ours. Green-ish is enough to move on.

**Detection:** `.github/workflows/gauntlet.yml` :: the branch filter is removed from `pull_request`

---

### `change-detection-fail-open`

**Looks like:** Change detection omits a path, so edits there skip the gates that cover them.

**Instances:** PR #38 — the `app` filter listed `app/`, `components/`, `lib/`, `public/` and root files but **not `kernel/**`**, so a change to the broker, harness, permission boundary or any capability skipped `e2e` and `perf`. Demonstrated on PR #36: 9 kernel files including the harness's invocation path, and `e2e` reported `skipping`.

**Why it survived:** `skipping` renders the same colour as success.

**Detection:** `.github/actions/ci-filter/action.yml` :: `kernel/**` in the `app` filter — first observed working on PR #50, evidenced on issue #44

**Rule:** A gate that silently does not run is worse than one that fails, because it reports the same colour as success.

---

### `dead-path-prefix`

**Looks like:** A path prefix in a check matches nothing in the repo, so the check can never fire.

**Instances:** PR #53 — `absorption-guard.mjs` filtered `changed.filter(f => f.startsWith("capabilities/"))`, but capabilities live at **`kernel/capabilities/`**. Both the one-repo-per-PR check and file-based absorption detection were dead from the first commit.

**Why it survived:** The guard printed *"Absorption rules satisfied"* either way.

**Detection:** `tests/unit/absorption-guard.test.ts` :: *looks for capabilities under kernel/capabilities/, the path they are actually at* and *detects capabilities from the file list, and counts them*

---

### `detector-fires-on-presence-not-event`

**Looks like:** A detector keys on a file *path* when the thing it is detecting is an *event* at that path. Touching the path is enough to trigger it, so ordinary maintenance of an existing thing is reported as the creation of a new one.

**Instances:** PR #65 — `absorption-guard.mjs` demanded an Absorption Score from a PR that added a required `trust` field to `llm.chat`'s manifest, absorbing nothing. Its file-based detector was `changed.some((f) => f.startsWith("kernel/capabilities/"))`, and `git diff --name-only` cannot distinguish an edit from an addition. Every future PR maintaining an absorbed capability would have hit the same wall, and the cheap way out — pasting a fabricated score to make the gate green — is precisely the defect the guard exists to prevent.

**Why it survived:** The detector was *added* in a PR that genuinely absorbed something, so its first and only exercise was a true positive. A path-prefix test also reads as obviously correct: capabilities do live there. Nothing distinguished "a capability exists here" from "a capability arrived here" until a PR did the former without the latter.

**Detection:** `scripts/absorption-guard.mjs` :: keys on `git diff --diff-filter=A`, so only an ADDED capability counts; `tests/unit/absorption-guard.test.ts` :: asserts **both** directions against real history — an edit-only commit must not demand a score, and the commit that actually added `scrapling-relocate.ts` must still demand one. Narrowing a detector is one character from disabling it, so both are pinned.

**Rule:** Detect the event, not the location. If the signal is "this was created", diff for creation.

---

### `detector-misses-own-convention`

**Looks like:** A pattern that decides whether a check applies does not match the project's own naming.

**Instances:** PR #53 — `/^absorb[:(]/` never matched this repo's actual convention `absorb/scrapling: …`, leaving the body's `**Fate:**` line as the *only* working detector. A PR omitting that line skipped every score check while printing success.

**Why it survived:** One of three detectors worked, which was enough to look functional.

**Detection:** `tests/unit/absorption-guard.test.ts` :: *recognises this repo's actual title convention, absorb/<repo>:*

---

### `orphan-check-blocks-forever`

**Looks like:** A required status context is reported by something that no longer exists, so it can never turn green.

**Instances:** PR #41 — the bare `CodeQL` check: default setup reports `not-configured` while a stale check of that name still reports and hard-fails with *"1 configuration not found"*. Requiring it would have blocked every PR forever. The real one, `static-security / CodeQL (javascript-typescript)`, **is** required.

**Why it survived:** Both contexts have plausible names; only one is ours.

**Detection:** `.github/branch-protection.json` :: `_comment_contexts` documents each deliberate exclusion; PR #47 confirmed `mergeStateStatus: CLEAN`

---

### `gate-blocks-own-fix`

**Looks like:** A required gate breaks, and because it is required, the PR fixing it cannot merge.

**Instances:** Gate 4 during PR #53/#54 — `npm i -g omniroute` failed transiently and blocked every PR including its own repair, for ~40 minutes.

**Why it survived:** Structural, not accidental: it follows from every gate being required, which is the property we want.

**Detection:** `CI_STATUS.md` :: *Break-glass — when a required gate locks out its own repair*, four escalation steps with fix-forward as the default (PR #55)

---

### `gate-dies-on-environment-artifact`

**Looks like:** A gate fails on a property of the runner rather than on the thing it checks, so it never reaches its own policy.

**Instances:** PR #8 — `license-checker` shells out to `npm ls --json --long --all`, which exits `ELSPROBLEMS` on extraneous or invalid **optional platform packages** (sharp, lightningcss). The licence gate died before reading a single licence.

**Why it survived:** It failed loudly but for a reason that looked like infrastructure noise.

**Detection:** `scripts/license-gate.mjs` :: policy asserted from the CycloneDX SBOM, generated from the lockfile, which has no such failure mode

---

### `fix-moves-failure-earlier`

**Looks like:** A replacement shares the failing dependency of the thing it replaced, so the fix relocates the failure instead of removing it.

**Instances:** PR #11 — `cyclonedx-npm` **also** shells out to `npm ls`, so PR #8's replacement of `license-checker` moved the `ELSPROBLEMS` failure one step earlier. It passed on `main` only because `main`'s lockfile happened to install a consistent tree on Linux.

**Why it survived:** The new tool was different enough to look like a different failure mode.

**Detection:** `scripts/license-gate.mjs` :: tolerates npm's optional-platform-dep exit status explicitly

---

### `substring-vs-token-match`

**Looks like:** A policy matcher compares substrings where the domain has structured tokens, producing false positives.

**Instances:** PR #8 — a substring test reads `LGPL-3.0-or-later` as containing `GPL-3.0` and would fail the build on sharp's libvips, which is permitted. Now compares whole SPDX tokens, with `-only`/`-or-later` normalised to the same base id. Proved on five scenarios including a deliberately-planted `AGPL-3.0` and an empty SBOM (which must fail, not vacuously pass).

**Why it survived:** It gave the right answer on the licences that were actually present.

**Detection:** `scripts/license-gate.mjs` :: whole-token SPDX comparison; empty SBOM exits 2

---

### `stale-webhook-payload`

**Looks like:** A re-run replays the original event payload, so edits made since are invisible to it.

**Instances:** PR #33 — `gh run rerun --failed` re-runs against the **original webhook payload**. The absorption guard kept failing on a blank PR template that had already been replaced, while passing locally the whole time. Only a push re-reads the body.

**Why it survived:** The re-run is the obvious response to a failure, and it produced the same failure, which read as a real defect.

**Detection:** `CI_STATUS.md` :: documented under the CI notes

---

## D · Numbers, measurement and inference

### `rounding-up`

**Looks like:** A percentage is rounded up, showing a full bar where headroom has already been spent.

**Instances:** PR #43 — `Math.round` rendered **998/1000 as "100%"**: a full bar with two requests already gone.

**Why it survived:** Rounding is the default, and 100% looks like a correct rendering of 99.8%.

**Detection:** `components/settings/ProvidersPanel.tsx` :: `Math.floor`; `tests/unit/providers.test.ts` :: the 998/1000 case

**Rule:** Never round up — CLAUDE.md's Directive #6 applied to a percentage.

---

### `two-renderers-disagree`

**Looks like:** Two code paths render the same underlying number with different rounding, so a page contradicts itself.

**Instances:** PR #43 — the recommendation rounded while the meters floored, so the page read *"100% of its tightest limit remaining"* directly above a bar showing **99%**.

**Why it survived:** Each path was individually defensible; nothing compared them.

**Detection:** `lib/providers/recommend.ts` :: shared pure module used by both route and client; `tests/unit/providers.test.ts` :: asserts agreement

---

### `empty-vs-zero`

**Looks like:** An absent measurement and a measurement of zero render identically.

**Instances:** PR #43 — Gemini publishes **no** rate-limit headers anywhere. A bar at 0% and a bar with no data look the same; only one is true. The card now reads *"Usage not available from this provider"* with Google's own reason.

**Why it survived:** A zero bar is a valid-looking rendering of missing data.

**Detection:** `components/settings/ProvidersPanel.tsx` :: `Meter` draws only from measured pairs; mutation-tested — *unmeasured limit renders as a full bar* fails 1 test

---

### `name-over-capability`

**Looks like:** A model, model list position, or identifier is trusted instead of the provider's own capability flags.

**Instances:** PR #43 — `models[0]` recommended `meta-llama/llama-prompt-guard-2-22m`, a **512-token safety classifier**, purely because Groq returned it first; the brief's example model `llama-3.3-70b-versatile` **404s** on this account; `glm-5-2` advertises `completion_chat: true, deprecation: null` and answers **403 tier_not_allowed**; `glm-5-2` and `zai-glm-5-2` are aliases, so the first fallback tried one model twice.

**Why it survived:** Names read as descriptions. A plausible name is more convincing than an unread flag.

**Detection:** `lib/providers/catalog.ts` :: capability read only from provider-reported fields; `tests/unit/providers.test.ts` :: asserts no capability is inferred from a model's name

---

### `observer-effect`

**Looks like:** The act of measuring consumes the thing being measured.

**Instances:** PR #43 — rate limits are published **only** on an inference response, so a 60-second poll would spend the allowance it reports. The number would become a function of the page being open.

**Why it survived:** Polling is the obvious design for a live dashboard.

**Detection:** `app/api/providers/status/route.ts` :: cheap status auto-refreshes and consumes nothing; limits are harvested only by an explicit *Test connection*, stated in the page footer

---

### `measuring-wrong-thing`

**Looks like:** A measurement is real but of a different quantity than the one being reported.

**Instances:** PR #62 — reported both Atlas files *"~49% duplicate"* from `sort | uniq | wc -l`, which counts distinct **lines**, not duplicated **content**. `RAW BRAIN 1.0` holds 4,608 blank lines, 5,706 `___` separators and 4,955 tree-character lines — **44% of the file is formatting**, and every repeat of `│` scored as duplication. Measured on substantive lines only: **13.6%**. The bad number was then used as a reason not to read the file. PR #50 — back-to-back contract runs made a 7B model look **~2× faster** than a 3B. Direct measurement showed near-identical token counts (19 vs 20) and llama3.2 genuinely faster per token (4.7 vs 3.1 tok/s). The first figure was measuring **VRAM eviction**, not inference. Four qwen runs spanned 11.7s–38.8s.

**Why it survived:** The numbers were reproducible and internally consistent.

**Detection:** **UNDETECTED** — no automation. PR #50 reports no latency figure at all rather than an unsound one.

**Rule:** One run is a sample, not a measurement.

---

### `sentinel-as-measurement`

**Looks like:** A sentinel value is returned in a field whose contract promises a measurement.

**Instances:** PR #57 — `scrapling.relocate` reported `score: 0` for every miss (`result?.score ?? 0`), so a near miss at 66.5 and a page with nothing on it were indistinguishable.

**Why it survived:** Zero is a plausible score, and the field's type was correct.

**Detection:** `kernel/scrapling.ts` :: `bestMatch()` reports the real best score; `tests/kernel/relocate-repair.test.ts` :: the honest-miss case asserts 66.5

---

### `default-below-noise-floor`

**Looks like:** A threshold ships below the level at which unrelated inputs already score, so the check passes on noise.

**Instances:** Issue #56 / PR #57 — golden case `unrelated-element` scores **49.63**: a `<div class="price">$899</div>` fingerprint against `<a href="/about">About</a>` in a nav. Scrapling's default `percentage` is **40**. At its own default the capability can return an unrelated element and report `found: true`.

**Why it survived:** Faithfully ported, so every fidelity test agrees with it. Fidelity and trustworthiness are different claims.

**Detection:** **UNDETECTED** — tracked in issue #56. `MIN_PERCENTAGE = 50` in the repair is set from this measurement, which bounds the repair but not the capability's own default.

---

### `fidelity-is-not-trustworthiness`

**Looks like:** A port matching its parent exactly is treated as proof the capability gives good answers.

**Instances:** Issue #56 — `scrapling.relocate` reproduces Scrapling 0.4.9 faithfully **and** returns unrelated elements at its default threshold. Both are true.

**Why it survived:** Gate 11 is the strongest evidence available, and it answers a different question.

**Detection:** **UNDETECTED** — gate 11 measures parity by design. Tracked in #56 and in #52's scoring discussion.

---

## E · Boundaries, wiring and blast radius

### `invariant-enforced-one-way`

**Looks like:** A guarantee is enforced where data is written and merely assumed where it is read. The write side is real, so the property is genuinely true of everything the system produced itself — and false the moment anything else touches the store.

**Instances:** Issue #60 — `ArtifactStore.put()` derived the id from the bytes; `get()` checked the file was present and returned it **without re-deriving the address**, so bytes altered underneath the store came back as the artifact requested and `artifact.exists` reported them green (*"readable, 1256 bytes"*). Named as facade #3 in `OPTIMUS_AUDIT_2026-08-26.md`. The same shape is open in the capability contract: `CapabilityManifest.inputConstraints` is required and enforced on every attempt, while a capability's **output** is unconstrained and undeclared — one direction of the contract holds, the other is trusted.

**Why it survived:** The requirement's own verification asked for the write half and nothing else. FR-4 read *"Hash test: re-writing identical bytes yields the same id; changed bytes yield a different one"* — which is entirely about `addressOf`, passes forever, and never once reads anything back. So the requirement was **fully satisfied while half of the property it stated was untrue**, and the phrase "content-addressed" appeared in 20 places across 14 files, including a user-facing surface, on that basis. Nothing was wrong except the half nobody wrote down.

**Detection:** `tests/kernel/artifact-integrity.test.ts` :: one conformance suite over every `ArtifactStore` implementation, with an automated mutation test asserting the tamper cases go red when `verifyIntegrity` is stripped from the real source. Partial by construction — it covers the artifact store, not the general class, and an adapter nobody adds to the table is not covered by it.

**Rule:** A round trip has two ends. Enforce the invariant at the end you do not control.

---

### `permission-without-radius`

**Looks like:** A permission says what a capability may do and nothing says where, so the grant is unbounded.

**Instances:** PR #28 — `fs:write` meant `~/.ssh/authorized_keys` was in scope; `net:write` meant anything could be POSTed anywhere. Verified: on `main`, a scenario pointing `llm.chat` at `https://api.openai.com` **completed** — TCP connected, TLS completed, the POST was delivered and OpenAI's own error came back in the failure reason. **19/20 vs 20/20 on identical scenario code.**

**Why it survived:** The permission list looked like a security model and was only half of one.

**Detection:** `kernel/sandbox.ts` :: `Isolation` on the manifest, deny-by-default, no wildcards; broker refuses to register an unbounded radius; mutation-tested (host allow-list removal fails 4 tests)

**Rule:** Permissions say WHAT; isolation says WHERE.

---

### `input-is-its-own-boundary`

**Looks like:** Permissions and isolation both hold, and step **input** still chooses what the capability does.

**Instances:** PR #36 — `browser.navigate.pythonExecutable` was a string handed to `spawn()`: `proc:spawn` gated *whether* a child ran and `isolation.cwd` gated *where*, while input picked **which binary**. `browser.navigate.url` accepted `file:///etc/passwd` → real Chromium → returned in `output.text`.

**Why it survived:** All five safety guarantees were satisfied the entire time, and the manifest was fully compliant.

**Detection:** `kernel/inputContract.ts` :: closed-set `inputConstraints`, required on every manifest, validated at the broker before `run()` on every attempt; mutation-tested (harness stops calling `validateInput` → 3 fail)

**Rule:** Permissions say WHAT, isolation says WHERE, the input contract says WHAT IT MAY BE ASKED TO DO.

---

### `flag-excuses-too-much`

**Looks like:** An escape-hatch flag, added for a real case, is accepted in cases it was never meant to cover.

**Instances:** PR #28 — an earlier draft let `unconfinedChildEgress` excuse **any** net permission. `web.fetch` calls `netFetch` in-process — entirely policeable — claimed the flag, and the broker waved it through. Caught by the acceptance suite before merge.

**Why it survived:** The flag exists for a genuine limitation (a child's sockets), which makes it read as generally applicable.

**Detection:** `kernel/sandbox.ts` :: the flag is accepted only alongside `proc:spawn`; regression test named after the mistake

---

### `secrets-to-child-process`

**Looks like:** A spawned process inherits the parent's whole environment, including every credential.

**Instances:** PR #28 — `env: { ...process.env, ...spec.env }` handed every child **every provider key in `.env`** plus `OPTIMUS_SESSION_SECRET`.

**Why it survived:** Inheriting the environment is the language default and is invisible at the call site.

**Detection:** `kernel/sandbox.ts` :: minimal env base; `tests/kernel/sandbox.test.ts` :: spawns node and asserts `OPTIMUS_TEST_SECRET` prints `undefined`

---

### `capability-registered-nowhere`

**Looks like:** A capability is absorbed, scored and validated while being unreachable from the running product.

**Instances:** PR #46 — three separate brokers registered three different sets. `scrapling.relocate` and `browser.navigate` were registered **nowhere**, after being scored 65/100 and 55/100 and validated across **20 live scenarios**. Every gate was green throughout, because no gate asked.

**Why it survived:** Their own tests constructed their own brokers, so the capabilities worked in every context anyone tested.

**Detection:** `kernel/registry.ts` :: one registry; `tests/kernel/registry.test.ts` :: every `Capability` exported under `kernel/capabilities/` must appear in `ALL_CAPABILITIES` (by import and inspection, not grep), and no file outside the registry may construct a `Broker`. Mutation-tested both ways.

---

### `shell-injection-via-interpolation`

**Looks like:** Untrusted-shaped input is glued into a command string and handed to a shell.

**Instances:** PR #6 — `absorption-guard.mjs` built `git diff --name-only ${base} ${head}` and ran it via `execSync`. CodeQL alert #6, `js/indirect-command-line-injection`, CWE-78/88. Exploitability was low (GitHub populates those fields with real hashes) and it was fixed anyway — this is the file that polices honest scores.

**Why it survived:** The inputs came from a trusted source, which made the shape look safe.

**Detection:** `scripts/absorption-guard.mjs` :: `execFileSync` with an argv array plus a `/^[0-9a-f]{7,40}$/i` shape check; `tests/unit/absorption-guard.test.ts` :: *rejects a malformed SHA instead of handing it to git*

---

### `gitignore-pattern-too-broad`

**Looks like:** An ignore pattern written for one file matches every file of that name.

**Instances:** PR #18 — a bare `README.md` matched **every** README in the repo, silently swallowing `docs/README.md` and `docs/adr/README.md` (written in PR #5, never committed) plus the browser-use capability's own README. Confirmed with `git check-ignore -v`.

**Why it survived:** Files that are ignored do not appear anywhere to suggest they are missing.

**Detection:** `.gitignore` :: pattern scoped to `/README.md`

---

### `untracked-but-not-ignored`

**Looks like:** A file is removed from git's index without an ignore entry, so the next `git add -A` re-commits it.

**Instances:** PR #47 — `CLAUDE.md` after commit `6e54fae`: invisible to git's tracked list, fully visible to `git add -A`.

**Why it survived:** `git status` showed it as untracked, which reads as handled.

**Detection:** `.gitignore` :: `CLAUDE.md`; `tests/unit/build-bible.test.ts` :: *is ignored, not merely untracked*

---

## F · Failures that misreport themselves

### `error-blames-wrong-boundary`

**Looks like:** One catch-all turns every failure into the same message, naming a component that was never reached.

**Instances:** PR #26/#27 — `ChatPanel` funnelled dead network, empty body, expired session and malformed reply into **"model layer unavailable"**. A user hit *"model layer unavailable — Failed to execute 'json' on 'Response'"* while the model layer was healthy; the message **cost two full sessions** chasing a working component.

**Why it survived:** The message was specific and confident, which is exactly what makes it expensive.

**Detection:** `lib/missions/client.ts` :: classifies by the boundary that actually failed (unreachable / timed-out / signed-out / malformed / rejected / not-found / model-layer), reading the body as **text before parsing**; `tests/e2e/missions.spec.ts` :: `data-failure-kind` assertions

**Rule:** A message that misreports which boundary broke is a demo that lies.

---

### `error-names-unreached-subsystem`

**Looks like:** A script aborts before reaching a subsystem, then prints an error about that subsystem's state.

**Instances:** Gate 4 (PR #55) — under `bash -e`, `npm i -g omniroute` failed and the script aborted **before the health loop ran**, yet reported *"OmniRoute did not become healthy in 60s"*. Nothing had been started; `/tmp/omniroute.log` did not exist. **Three investigations** chased the gateway, the API keys and the health check.

**Why it survived:** The message sits at the end of the script and reads as the script's verdict, not as unreachable code.

**Detection:** `.github/workflows/_ai-review.yml` :: retries with backoff, prints npm's **debug log** (npm otherwise emits only a pointer to a file on a runner about to be deleted), and asserts the binary is on `PATH` before trusting the install

**Rule:** Any step that can fail before its subject starts must say so.

---

### `pipeline-swallows-status`

**Looks like:** A command's exit status is masked by a pipeline, so a failure is read as success.

**Instances:** PR #55 follow-up — `if npm i -g omniroute … | tee /tmp/log; then break; fi` takes **tee's** status. Attempt 1 failed, the retry loop saw 0, broke, and the job ran a binary that did not exist: `nohup: failed to run command 'omniroute': No such file or directory`. A retry loop reporting success while installing nothing.

**Why it survived:** The loop was added minutes earlier *to fix* a swallowed error, and swallowed it differently.

**Detection:** `.github/workflows/_ai-review.yml` :: redirects to a file instead of piping

---

### `mislabelled-failure-reason`

**Looks like:** A failure is reported under the wrong category, hiding the real verdict.

**Instances:** PR #66 — `checkOutput` reuses the input contract's engine, which hardcoded the path prefix `"input"`, so a capability whose RETURN value violated its manifest was told `input.artifactId: required field is missing`. Both ends of a step are being validated by then, and the message sent the reader to the wrong one. Caught by the output door's own tests before it shipped; fixed by making the root label a parameter. PR #13 — the harness reported `budget-exhausted` for a step that simply failed its check on its only permitted attempt. Nothing had run away; the label hid the real reason. PR #62 — `defect-registry.mjs --update` exited 1 with *"Could not find a coverage line to update"* when the line was present **and already correct**: "no change" and "no such line" shared one exit path, so a no-op reported a structural fault. Fixed by testing for the line's existence separately from whether the replacement changed anything.

**Why it survived:** Both are failures, so the step was red either way and nobody read further.

**Detection:** `kernel/harness.ts` :: distinguishes giving up from running out of road; AC-4 asserts each budget terminates for its own reason; `kernel/outputContract.ts` :: passes an explicit `"output"` root to the shared constraint engine, and `tests/kernel/output-contract.test.ts` asserts the violation names the output end

---

### `refusal-reason-wrong`

**Looks like:** A grader returns the right verdict with a reason that is untrue about the input.

**Instances:** PR #50 — the refusal grader matched only `/unknown/`, so `"I don't know."` — a correct refusal in the wrong wording — was reported as *"neither UNKNOWN nor a refusal"*. Both outcomes are failures, so the verdict was right; the reason was false, and reasons are what a repair loop reads.

**Why it survived:** The pass/fail column was correct, which is what tests assert.

**Detection:** `kernel/models/contract.ts` :: `DECLINED` matcher separating three outcomes; `tests/unit/model-contract.test.ts` :: *rejects declining in the wrong form*

---

### `silent-continue-on-error`

**Looks like:** A control-flow feature is implemented such that it never takes effect, and the state fold records the opposite of what happened.

**Instances:** PR #13 — `continue-on-error` steps sat pending forever because their failed dependency still blocked them, and emitting `step.blocked` folded state into the **opposite** of the truth.

**Why it survived:** The steps did not run, which looks like the dependency-failure behaviour it was meant to override.

**Detection:** `kernel/scheduler.ts` :: emits a distinct `step.continued` event; AC coverage in `tests/kernel/`

---

### `guard-after-use`

**Looks like:** A value is consumed before the check that decides whether it is valid.

**Instances:** PR #26 — `onMissionCreated(data.missionId)` ran **before** the `ok` check, so a 401 passed `undefined` into the sidebar.

**Why it survived:** The happy path works, and the failure only shows as a subtly wrong UI.

**Detection:** `components/chat/ChatShell.tsx` / `lib/missions/client.ts` :: classification precedes any use of the payload

---

### `unguarded-parse-hangs-ui`

**Looks like:** A parse with no error handling leaves the interface stuck rather than reporting failure.

**Instances:** PR #26 — the reopen-a-mission effect had a bare `await res.json()` with **no try/catch at all**; a non-JSON reply left the spinner on *"thinking"* forever. A failed send also discarded the user's typed question — the reporting user lost three messages.

**Why it survived:** A hang has no error to log and no red state to notice.

**Detection:** `tests/e2e/missions.spec.ts` :: *an empty response body is reported as a transport failure* and *a failed send is retryable, and the retry does not duplicate the question*

---

### `state-coupling-clobber`

**Looks like:** Two distinct concerns share one state variable, so updating one silently triggers the other.

**Instances:** PR #25 — sidebar highlighting was wired through the same state that keyed `ChatPanel`'s remount, so finishing a real send triggered a redundant refetch that **visibly clobbered the real answer**. Caught by a new e2e test, not by inspection.

**Why it survived:** Each behaviour was correct alone; the coupling only shows in a timing-dependent sequence.

**Detection:** `components/chat/ChatShell.tsx` :: *which mission to load* separated from *which row to highlight*; `tests/e2e/missions.spec.ts` :: *renders a real reply bubble with a real evidence caption*

---

### `test-client-not-like-real-client`

**Looks like:** The test harness's client behaves differently from a real browser, so every test silently exercises the wrong state.

**Instances:** PR #24 — Chromium's `APIRequestContext` does not store a `Secure`-flagged session cookie the way a page does. Every *"authenticated"* e2e was silently **unauthenticated** until the login helper routed through `page.evaluate(fetch)`.

**Why it survived:** The tests passed. They were testing the signed-out path against pages that happened to render.

**Detection:** `tests/e2e/helpers/auth.ts` :: signs in through a real page-context `fetch`

---

### `shallow-clone-assumption`

**Looks like:** A test assumes git history that CI's shallow checkout does not have.

**Instances:** PR #53 — real-diff tests used `HEAD~1`; `actions/checkout` defaults to depth 1, so they passed locally and failed in CI. Replaced with git's empty-tree object `4b825dc…`, which needs no history — and incidentally exercises the one-repo-per-PR check for the first time. PR #65 — new absorption-guard tests located their fixture commits with `git log --diff-filter=A -1 -- <path>`, which needs history; `actions/checkout@v5` clones at depth 1, so `git log` sees one commit and the fixture lookup threw. Green locally, red in CI. **The same test file already carried a comment warning about this exact hazard**, written when `HEAD~1` failed the same way. Fixed by removing the dependency rather than accommodating it: the tests now build a throwaway git repo with one ADD and one EDIT, so clone depth is irrelevant and the scenario is exact instead of whatever history happens to contain.

**Why it survived:** Local git has full history; CI's does not, and nothing in the test names the assumption.

**Detection:** `tests/unit/absorption-guard.test.ts` :: `EMPTY_TREE` constant with the reason recorded

---

### `percent-encoded-path`

**Looks like:** A `file://` URL's `.pathname` percent-encodes characters, producing a path that does not exist.

**Instances:** PR #51 — `new URL(...).pathname` turned spaces in this repo's own path into `%20`, so `--record` hit `ENOENT`.

**Why it survived:** It works on any path without spaces, which is most machines.

**Detection:** `scripts/model-contract.ts` :: `fileURLToPath`

---

### `test-asserts-reversed-decision`

**Looks like:** A test still asserts a decision that has since been reversed, and passes only because of local state.

**Instances:** PR #47 — `build-bible.test.ts` asserted `CLAUDE.md` is **present and holds the bible**, written in PR #35 when that was the goal. It passed locally only because the file was still on disk; in CI, after checkout, it would throw on read and turn the unit gate **red for every PR**.

**Why it survived:** The working tree disagreed with the repository, and only CI sees the repository.

**Detection:** `tests/unit/build-bible.test.ts` :: rewritten to assert the current decision; old assertions **deleted, not skipped**

**Rule:** A skipped test asserting a reversed decision is a trap for whoever reads it next.

---

### `visibility-deletes-enforcement`

**Looks like:** A repository setting silently removes gates while every workflow keeps running and passing.

**Instances:** PR #48 — going private on GitHub Free returned **403** for branch protection *and* disabled CodeQL (*"Code scanning is not enabled for this repository"*), while the gauntlet kept going green. A direct `git push origin main` **succeeded**. It reads as hardening, which is what makes it worse than a misconfiguration.

**Why it survived:** Nothing announced it and nothing turned red. The only way to see it was to ask the API or push to `main` and watch it land.

**Detection:** `.github/workflows/gauntlet.yml` :: `gate coverage (read me)` fails the build when `repos/{owner}/{repo}.private` is not `false` — verified in CI printing `repository private: false`

---

### `advertised-option-the-gate-refuses`

**Looks like:** A UI offers an action that policy always rejects.

**Instances:** PR #48 — `allow_merge_commit: true` while `required_linear_history: true`. The repo advertised a merge button the gate could never accept.

**Why it survived:** Both settings are individually sensible; nothing compares them.

**Detection:** `.github/branch-protection.json` :: `required_linear_history` is declared here, and the repo's `allow_merge_commit` was set to `false` to match it

---

### `unsatisfiable-requirement`

**Looks like:** A requirement is set to a value that cannot be met, making every path depend on a bypass.

**Instances:** PR #6 / PR #41 — `required_approving_review_count: 1` on a one-developer repo. GitHub forbids approving your own PR, so with `enforce_admins: true` every PR became mergeable **only** by `--admin` bypass — reducing the whole config to theatre.

**Why it survived:** It reads as the strictest possible setting.

**Detection:** `.github/branch-protection.json` :: `_comment_reviews` records the value, the reason, and the condition for raising it

---

### `check-then-act-on-filesystem`

**Looks like:** Code asks whether a path exists and then reads or writes it, so anything that changes the path in between is acted on unchecked (TOCTOU).

**Instances:** PR #58 — `defect-registry.mjs` guarded with `existsSync(REGISTRY)` and later called `writeFileSync(REGISTRY, …)`; CodeQL alert #55, *"Potential file system race condition"*, and it was correct. Issue #60 — `DiskArtifactStore.get()` had the identical shape (`existsSync(path)` then `readFile(path)`); removed as a side effect of adding integrity checking, and it also stopped collapsing every read failure into *"No such artifact"*. PR #28 — the same shape in the sandbox's path containment, closed by resolving symlinks and then operating on the **resolved** path rather than re-deriving it.

**Why it survived:** `existsSync` reads as defensive, and produces a friendlier error than an exception. The gap it opens is invisible in single-threaded reasoning.

**Detection:** `.github/workflows/_static-security.yml` :: CodeQL `js/file-system-race`, a required context; the branch's `required_conversation_resolution` meant the alert **blocked the merge** rather than sitting unread.

**Rule:** Do the operation and handle its failure. A separate existence check is a second, racing operation that buys nothing.

---

### `mutation-test-races-shared-state`

**Looks like:** A test that deliberately corrupts a shared file to prove a gate can fail, running in parallel with a test that reads the same file — so an unrelated suite fails on a value it was never meant to see.

**Instances:** PR #54 / this PR — `tests/unit/fidelity-check.test.ts` sets `sequence-matcher-golden.json`'s `identical-strings` to `0.999` to prove the integrity check fires, restoring it in a `finally`. Vitest runs test **files** in parallel, so `tests/kernel/sequence-matcher.test.ts` read the golden mid-mutation and failed with *"expected 1 to be 0.999"* — a port that is perfectly correct, failing on someone else's sabotage.

**Why it survived:** It restores correctly, so the file is clean before and after and `git status` shows nothing. The failure is intermittent, lands on an **innocent file**, and reads as a real fidelity regression — the most expensive possible place for it to appear.

**Detection:** `scripts/fidelity-check.mjs` :: `FIDELITY_MANIFEST` override; `tests/unit/fidelity-check.test.ts` :: mutates a per-file `mkdtempSync` copy of `kernel/fixtures/`, never the real tree. Verified by three consecutive full-suite runs at 337 passed.

**Rule:** A mutation test owns a private copy of whatever it corrupts. Restoring afterwards is not enough when something else may read it in between.

---

### `negation-blind-matcher`

**Looks like:** A matcher detects a term and handles exactly one spelling of its negation, so every other way of saying "not that" reads as a positive claim.

**Instances:** PR #57 — `absorption-guard.mjs` decides a PR claims AVAILABLE with `/\bAVAILABLE\b/.test(body) && !/UNAVAILABLE/.test(body)`. A body reading **"Not AVAILABLE. Needs ≥90…"** — which states the opposite — failed with *"Claims AVAILABLE at 68/100. Requires >=90"*. The guard was enforcing the rule against a PR that was already obeying it.

**Why it survived:** `UNAVAILABLE` is the term Directive #4 uses, so every earlier PR happened to spell it that way. The check is right about the common case and silently wrong about a synonym.

**Detection:** **UNDETECTED** — the matcher is unchanged; the convention is to write `UNAVAILABLE` as one word. A tolerant version would need to handle "not available", "stays unavailable", "is not AVAILABLE" and similar, which is a real parsing problem rather than a regex tweak. Tracked alongside `parser-brittle-to-formatting` on #52's scoring work.

**Rule:** A matcher that looks for a claim must be tested against the sentence that denies it.

---

### `parser-brittle-to-formatting`

**Looks like:** A checker parses structured text with a pattern that cannot see through ordinary formatting, and reports the content as *missing* rather than as *unparsed*.

**Instances:** PR #57 — `absorption-guard.mjs` reads `| Label | max | value |` with `(\d{1,3})`. A score table written `| Fidelity | 35 | **8** |` failed with *"Score breakdown incomplete — missing: Fidelity, Safety, Robustness, Integration, Proof coverage"*, naming every component as absent when all five were present and bolded.

**Why it survived:** Every previous score table happened to be written without emphasis. The error message describes the parser's view, not the document's, and reads as a genuine omission.

**Detection:** **UNDETECTED** — the parser is unchanged; the workaround is to write score digits unbolded, which is a convention, not a mechanism. Needs either a tolerant pattern (`\*{0,2}(\d{1,3})\*{0,2}`) or an error that distinguishes *absent* from *unparsed*. Tracked as a follow-up on #52's scoring work.

**Rule:** A parser that cannot find something must say *"could not parse"*, never *"missing"* — they send the reader to different places.

---

### `wrong-model-of-what-was-fixed`

**Looks like:** A capability is presented as improved when the improvement is in a different dimension than the score suggests.

**Instances:** PR #18 — `browser.navigate` scored **48/100**, honestly *lower* than Scrapling's 55/100 despite a far more impressive demo, because the score tracks what is proven in required CI rather than what is impressive to watch.

**Why it survived:** A working live demo is the most persuasive evidence available and is not the evidence the rubric asks for.

**Detection:** `scripts/absorption-guard.mjs` + `tests/unit/absorption-guard.test.ts` :: score arithmetic, component maxima and AVAILABLE thresholds enforced on every PR

---

