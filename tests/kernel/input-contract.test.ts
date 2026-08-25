import { describe, it, expect, vi, afterEach } from "vitest";
import { Broker, BrokerError } from "../../kernel/broker";
import { Harness } from "../../kernel/harness";
import { MemoryArtifactStore } from "../../kernel/artifacts";
import { InputContractError, checkInput, type InputConstraints } from "../../kernel/inputContract";
import { llmChat, llmChatSucceeded } from "../../kernel/capabilities/omniroute/chat";
import { browserNavigate } from "../../kernel/capabilities/browser-use/navigate";
import type { Capability, CapabilityManifest } from "../../kernel/types";

/**
 * Gate 8, third leg — the input contract.
 *
 * The layer distinction these tests exist to pin down, because it is the
 * thing a future session is most likely to talk itself out of:
 *
 *   K4 refuses the outbound connection; it does not refuse a capability
 *   constructing a request to a host it was handed. Those are different
 *   layers.
 *
 * Every test name below says WHICH layer did the refusing, on purpose. A
 * session that wants to weaken one of these checks has to rename a test that
 * explains why it exists.
 */

const anyManifest = (over: Partial<CapabilityManifest> = {}): CapabilityManifest => ({
  id: "test.cap",
  version: "1.0.0",
  permissions: [],
  inputConstraints: {},
  defaultBudget: { maxAttempts: 1, maxWallTimeMs: 1_000, maxCost: 1 },
  description: "fixture",
  ...over,
});

afterEach(() => {
  vi.restoreAllMocks();
});

/* ══ the headline: refused at the broker, not at TCP ═══════════════════════ */

describe("a remote baseUrl is refused at the broker, not at TCP", () => {
  function kernel() {
    const broker = new Broker();
    broker.register(llmChat);
    broker.registerCheck(llmChatSucceeded);
    return { broker, store: new MemoryArtifactStore() };
  }

  it("refuses the step, naming the host it refused", async () => {
    const { broker, store } = kernel();
    const harness = new Harness({ broker, store });

    const outcome = await harness.runStep({
      id: "exfiltrate",
      capabilityId: "llm.chat",
      input: {
        baseUrl: "https://api.openai.com",
        apiKey: "sk-a-real-looking-credential",
        model: "gpt-4",
        messages: [{ role: "user", content: "hi" }],
      },
      dependsOn: [],
      checks: ["llm.chatSucceeded"],
    });

    expect(outcome.status).not.toBe("passed");
    const reason = outcome.evidence.checks.map((c) => c.reason).join(" ");
    expect(reason).toMatch(/input refused/i);
    expect(reason).toMatch(/api\.openai\.com/);
  });

  /**
   * ⚠️ This one passes with the input contract REMOVED, and that is not a
   * defect in the test — it is the honest scope of it. K4 already refuses
   * this socket, so the guarantee here belongs to K4, not to gate 8.
   *
   * It is kept because a regression in EITHER layer must be visible, and
   * deleted-or-renamed rather than left implying credit: sitting unlabelled
   * in a describe block named "refused at the broker" it would read as
   * evidence for the input contract, which mutation testing showed it is not.
   * (Removing `validateInput` from the harness fails 3 tests in this file.
   * This is not one of them.)
   */
  it("does not open a socket either way — K4's guarantee, retained here", async () => {
    const { broker, store } = kernel();
    // A spy that would RESOLVE if called, so a failure here is "it was
    // called", never "the network happened to be down".
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}"));

    await new Harness({ broker, store }).runStep({
      id: "exfiltrate",
      capabilityId: "llm.chat",
      input: {
        baseUrl: "https://api.openai.com",
        apiKey: "sk-a-real-looking-credential",
        model: "gpt-4",
        messages: [{ role: "user", content: "hi" }],
      },
      dependsOn: [],
      checks: ["llm.chatSucceeded"],
    });

    expect(fetchSpy, "the request must never have been attempted").not.toHaveBeenCalled();
  });

  it("still accepts the loopback baseUrl the capability is actually for", () => {
    const { broker } = kernel();
    // Not just "the bad one is refused" — a constraint that refuses everything
    // passes the test above while breaking the product.
    for (const baseUrl of ["http://127.0.0.1:20128", "http://localhost:20128", "http://[::1]:20128"]) {
      expect(() =>
        broker.validateInput("llm.chat", { baseUrl, model: "m", messages: [{ role: "user", content: "hi" }] }),
      ).not.toThrow();
    }
    // Including the discard-port form the e2e suite pins, which is a real
    // loopback address and must stay reachable — its unreachability is the
    // point of that test, and it has to fail at the TRANSPORT layer.
    expect(() =>
      broker.validateInput("llm.chat", {
        baseUrl: "http://127.0.0.1:9",
        model: "m",
        messages: [{ role: "user", content: "hi" }],
      }),
    ).not.toThrow();
  });
});

/* ══ the two layers are genuinely different, demonstrated ══════════════════ */

describe("the input contract and K4 catch the same URL at different layers", () => {
  /** The same capability with its baseUrl constraint deliberately loosened. */
  const unconstrained: Capability = {
    manifest: {
      ...llmChat.manifest,
      id: "llm.chat.unconstrained",
      inputConstraints: { ...llmChat.manifest.inputConstraints, baseUrl: { kind: "string" } },
    },
    run: llmChat.run,
  };

  it("without the contract, run() IS reached and K4 stops it only at the socket", async () => {
    const broker = new Broker();
    broker.register(unconstrained);
    broker.registerCheck(llmChatSucceeded);
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}"));

    const outcome = await new Harness({ broker, store: new MemoryArtifactStore() }).runStep({
      id: "s",
      capabilityId: "llm.chat.unconstrained",
      input: {
        baseUrl: "https://api.openai.com",
        apiKey: "sk-a-real-looking-credential",
        model: "gpt-4",
        messages: [{ role: "user", content: "hi" }],
      },
      dependsOn: [],
      checks: ["llm.chatSucceeded"],
    });

    const reason = outcome.evidence.checks.map((c) => c.reason).join(" ");
    // K4's voice, not the broker's — the capability ran, built the request
    // (Authorization header and all), and was stopped one layer later.
    expect(reason).toMatch(/sandbox|not allowed|may reach/i);
    expect(reason).not.toMatch(/input refused/i);
    // K4 holds: no socket either way. The difference is WHERE it stopped and
    // how much happened first, which is exactly why both layers exist.
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("with the contract, run() is never reached, so nothing is ever assembled", async () => {
    const broker = new Broker();
    let ran = false;
    broker.register({
      manifest: { ...llmChat.manifest, id: "llm.chat.observed" },
      async run(input, ctx) {
        ran = true;
        return llmChat.run(input, ctx);
      },
    });
    broker.registerCheck(llmChatSucceeded);

    await new Harness({ broker, store: new MemoryArtifactStore() }).runStep({
      id: "s",
      capabilityId: "llm.chat.observed",
      input: {
        baseUrl: "https://api.openai.com",
        apiKey: "sk-a-real-looking-credential",
        model: "gpt-4",
        messages: [{ role: "user", content: "hi" }],
      },
      dependsOn: [],
      checks: ["llm.chatSucceeded"],
    });

    expect(ran, "the capability must never have been handed the value").toBe(false);
  });
});

/* ══ the two holes K4 genuinely cannot see ═════════════════════════════════ */

describe("browser.navigate — holes no permission or isolation check could close", () => {
  const broker = new Broker();
  broker.register(browserNavigate);
  // Narrowed, not cast: if this constraint ever stops being an `executable`,
  // this test must break loudly rather than quietly test nothing.
  const chromeConstraint = browserNavigate.manifest.inputConstraints.chromeExecutablePath;
  if (chromeConstraint?.kind !== "executable") {
    throw new Error("browser.navigate.chromeExecutablePath is no longer an executable constraint");
  }
  const validChrome = chromeConstraint.allowed[0];

  it("refuses file:// — a child process's read is outside K4's readRoots entirely", () => {
    expect(() =>
      broker.validateInput("browser.navigate", {
        url: "file:///etc/passwd",
        chromeExecutablePath: validChrome,
      }),
    ).toThrow(/scheme "file" is not one of/);
  });

  it("refuses data: and javascript: for the same reason", () => {
    for (const url of ["data:text/html,<h1>x</h1>", "javascript:fetch('//evil.test')"]) {
      expect(() => broker.validateInput("browser.navigate", { url, chromeExecutablePath: validChrome })).toThrow(
        /scheme/,
      );
    }
  });

  it("refuses an arbitrary executable — proc:spawn gates WHETHER, never WHICH", () => {
    expect(() =>
      broker.validateInput("browser.navigate", {
        url: "https://example.com",
        chromeExecutablePath: validChrome,
        pythonExecutable: "/bin/sh",
      }),
    ).toThrow(/not a permitted executable/);
  });

  it("still allows the http(s) URLs and interpreters it is actually for", () => {
    expect(() =>
      broker.validateInput("browser.navigate", {
        url: "https://example.com/some/page?q=1",
        chromeExecutablePath: validChrome,
        pythonExecutable: "python3",
        headless: true,
      }),
    ).not.toThrow();
  });
});

/* ══ repaired input is re-validated, not trusted ═══════════════════════════ */

describe("input produced by a repair is checked like any other", () => {
  it("refuses a repair that invents a field the manifest never declared", async () => {
    const broker = new Broker();
    let attempts = 0;
    broker.register({
      manifest: anyManifest({
        id: "repairable",
        inputConstraints: { n: { kind: "number" } },
        defaultBudget: { maxAttempts: 3, maxWallTimeMs: 5_000, maxCost: 10 },
      }),
      async run() {
        attempts += 1;
        return { ok: false };
      },
    });
    broker.registerCheck({
      id: "never.passes",
      async run() {
        return { checkId: "never.passes", passed: false, reason: "by design" };
      },
    });

    const outcome = await new Harness({ broker, store: new MemoryArtifactStore() }).runStep(
      { id: "s", capabilityId: "repairable", input: { n: 1 }, dependsOn: [], checks: ["never.passes"] },
      // A repair that smuggles in an undeclared field. Today repairs are code;
      // the next kernel task makes an LLM write step input, and this is the
      // same door.
      () => ({ n: 2, smuggled: "payload" }),
    );

    expect(attempts, "attempt 1 runs; the repaired attempt 2 is refused before run()").toBe(1);
    const reason = outcome.evidence.checks.map((c) => c.reason).join(" ");
    expect(reason).toMatch(/undeclared field/);
  });
});

/* ══ registration refuses a constraint that would not protect anything ═════ */

describe("malformed constraints are refused at registration", () => {
  const reg = (inputConstraints: unknown) => () =>
    new Broker().register({
      manifest: anyManifest({ inputConstraints: inputConstraints as InputConstraints }),
      async run() {
        return {};
      },
    });

  it("refuses a manifest with no inputConstraints at all", () => {
    expect(reg(undefined)).toThrow(BrokerError);
    expect(reg(undefined)).toThrow(/declares no inputConstraints/);
  });

  it("refuses a url constraint that names neither allowedHosts nor anyHost", () => {
    // Same fail-closed shape as gate 10: you may take any host, but you must
    // SAY so. Silence is not a grant.
    expect(reg({ u: { kind: "url", allowedSchemes: ["https"] } })).toThrow(/anyHost/);
  });

  it("refuses a url constraint that claims both allowedHosts and anyHost", () => {
    expect(reg({ u: { kind: "url", allowedSchemes: ["https"], allowedHosts: ["a.test"], anyHost: true } })).toThrow(
      /pick one/,
    );
  });

  it("refuses a wildcard host, the same as isolation does", () => {
    expect(reg({ u: { kind: "url", allowedSchemes: ["https"], allowedHosts: ["*.test"] } })).toThrow(/wildcard/);
  });

  it("refuses an array whose elements are unconstrained", () => {
    expect(reg({ xs: { kind: "array" } })).toThrow(/unconstrained elements/);
  });

  it("refuses an empty enum, which would accept nothing while looking strict", () => {
    expect(reg({ s: { kind: "string", enum: [] } })).toThrow(/non-empty/);
  });

  it("refuses an unknown constraint kind rather than ignoring it", () => {
    // Ignoring it is how a typo becomes an unconstrained field that reads as
    // constrained. This matters most for manifests built at RUNTIME — the
    // MCP adapter will generate them from a remote tool listing.
    expect(reg({ s: { kind: "strnig" } })).toThrow(/unknown constraint kind/);
  });

  it("refuses an executable constraint with an empty allow-list", () => {
    expect(reg({ e: { kind: "executable", allowed: [] } })).toThrow(/non-empty/);
  });

  it("refuses inverted bounds", () => {
    expect(reg({ s: { kind: "string", minLength: 10, maxLength: 2 } })).toThrow(/minLength 10 > maxLength 2/);
    expect(reg({ n: { kind: "number", min: 5, max: 1 } })).toThrow(/min 5 > max 1/);
  });
});

/* ══ the checker itself ════════════════════════════════════════════════════ */

describe("checkInput", () => {
  it("refuses an undeclared field instead of ignoring it", () => {
    // Ignoring is how a new parameter gets added to a capability and never
    // acquires a constraint.
    expect(checkInput({ a: { kind: "string" } }, { a: "x", b: "y" })).toEqual([
      "input.b: undeclared field — this capability's manifest does not accept it",
    ]);
  });

  it("treats {} as 'the input must be empty', not 'anything goes'", () => {
    expect(checkInput({}, {})).toEqual([]);
    expect(checkInput({}, { anything: 1 })).toHaveLength(1);
  });

  it("distinguishes a missing required field from a missing optional one", () => {
    const c: InputConstraints = { need: { kind: "string", required: true }, want: { kind: "string" } };
    expect(checkInput(c, { need: "x" })).toEqual([]);
    expect(checkInput(c, { want: "x" })).toEqual(["input.need: required field is missing"]);
  });

  it("treats an explicit undefined as absent, so an optional field may be spread in", () => {
    expect(checkInput({ want: { kind: "string" } }, { want: undefined })).toEqual([]);
  });

  it("refuses null unless the constraint says nullable", () => {
    expect(checkInput({ a: { kind: "string" } }, { a: null })).toEqual(["input.a: null is not permitted"]);
    expect(checkInput({ a: { kind: "string", nullable: true } }, { a: null })).toEqual([]);
  });

  it("checks values, not just shapes — an enum miss is caught", () => {
    const c: InputConstraints = { role: { kind: "string", enum: ["user", "system"] } };
    expect(checkInput(c, { role: "user" })).toEqual([]);
    expect(checkInput(c, { role: "root" })[0]).toMatch(/"root" is not one of/);
  });

  it("does not let a prototype key masquerade as a declared field", () => {
    // `constraints["constructor"]` resolves to Object on a plain object, so a
    // membership test that used `in` or bare indexing would wave this through.
    expect(checkInput({ a: { kind: "string" } }, { constructor: "x" })[0]).toMatch(/undeclared field/);
    expect(checkInput({ a: { kind: "string" } }, { toString: "x" })[0]).toMatch(/undeclared field/);
  });

  it("descends into arrays and objects", () => {
    const c: InputConstraints = {
      messages: {
        kind: "array",
        of: { kind: "object", fields: { role: { kind: "string", enum: ["user"] } } },
      },
    };
    expect(checkInput(c, { messages: [{ role: "user" }] })).toEqual([]);
    expect(checkInput(c, { messages: [{ role: "user" }, { role: "admin" }] })[0]).toMatch(
      /input\.messages\[1\]\.role/,
    );
  });

  it("constrains the values of an open record without constraining its keys", () => {
    const c: InputConstraints = { attrs: { kind: "record", values: { kind: "string" }, maxEntries: 2 } };
    expect(checkInput(c, { attrs: { href: "/x", id: "y" } })).toEqual([]);
    expect(checkInput(c, { attrs: { href: 1 } })[0]).toMatch(/input\.attrs\.href: expected a string/);
    expect(checkInput(c, { attrs: { a: "1", b: "2", c: "3" } })[0]).toMatch(/maxEntries/);
  });

  it("refuses input that is not an object at all", () => {
    expect(checkInput({ a: { kind: "string" } }, "just a string")[0]).toMatch(/expected an object, got string/);
    expect(checkInput({ a: { kind: "string" } }, [1, 2])[0]).toMatch(/expected an object, got array/);
  });

  it("refuses a URL that does not parse, rather than throwing", () => {
    const c: InputConstraints = { u: { kind: "url", allowedSchemes: ["https"], anyHost: true } };
    expect(checkInput(c, { u: "not a url" })[0]).toMatch(/not a parseable URL/);
  });

  it("stops descending at the depth cap instead of blowing the stack", () => {
    // A hostile payload should hit a stated limit, not a RangeError.
    let nested: unknown = "leaf";
    for (let i = 0; i < 100; i += 1) nested = { a: nested };
    let c: InputConstraints = { a: { kind: "string" } };
    for (let i = 0; i < 100; i += 1) c = { a: { kind: "object", fields: c } };
    // The CONSTRAINT is refused at registration for nesting too deep...
    expect(() => new Broker().register({ manifest: anyManifest({ inputConstraints: c }), async run() { return {}; } })).toThrow(
      InputContractError,
    );
    // ...and a deep INPUT against a shallow constraint is simply undeclared.
    expect(checkInput({ a: { kind: "string" } }, nested as object)[0]).toMatch(/expected a string/);
  });

  it("caps how many violations it reports, so an error stays readable", () => {
    const many: Record<string, unknown> = {};
    for (let i = 0; i < 50; i += 1) many[`f${i}`] = i;
    expect(checkInput({}, many).length).toBeLessThanOrEqual(10);
  });
});
