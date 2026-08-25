import { parseFragmentLikeLxml, allDescendantElements, elementToDict } from "../../kernel/scrapling";
import type { RelocateOutput } from "../../kernel/capabilities/scrapling-relocate";
import type { Scenario, ScenarioResult } from "./types";

/**
 * Scrapling's real claim: a selector that survives a site redesign. So every
 * scenario takes a fingerprint from an ORIGINAL page and hunts it on a page
 * that has genuinely changed — and two scenarios check the harder half of
 * that promise, that it says "not found" instead of inventing a match.
 */

const ORIGINAL = `
<html><body>
  <header><nav><a href="/home" class="nav-link">Home</a></nav></header>
  <main>
    <div class="product-card featured" data-sku="A-1001">
      <h2 class="product-title">Wireless Headphones</h2>
      <span class="price" itemprop="price">£129.99</span>
      <button class="buy-now" id="buy-A-1001">Add to basket</button>
    </div>
  </main>
</body></html>`;

/** The element we want to keep finding: the buy button. */
function buyButtonFingerprint() {
  const root = parseFragmentLikeLxml(ORIGINAL);
  const el = allDescendantElements(root).find((e) => e.attribs?.id === "buy-A-1001");
  if (!el) throw new Error("fixture broken: buy button not found in ORIGINAL");
  return elementToDict(el);
}

const FP = buyButtonFingerprint();

function out(r: ScenarioResult): Partial<RelocateOutput> {
  return (r.output ?? {}) as Partial<RelocateOutput>;
}

function found(r: ScenarioResult): { ok: boolean; observed: string } {
  const o = out(r);
  if (r.threw) return { ok: false, observed: `kernel threw: ${r.threw}` };
  return {
    ok: r.status === "passed" && o.found === true,
    observed:
      o.found === true
        ? `found, score ${o.score?.toFixed(1)} (threshold ${o.percentage}), ${o.matches?.length} match(es)`
        : `NOT found — status ${r.status}, score ${o.score ?? "n/a"}`,
  };
}

function notFound(r: ScenarioResult): { ok: boolean; observed: string } {
  const o = out(r);
  if (r.threw) return { ok: false, observed: `kernel threw: ${r.threw}` };
  // The honest half: a passing CHECK with found=false is the correct answer.
  return {
    ok: r.status === "passed" && o.found === false,
    observed:
      o.found === false
        ? `correctly reported not-found (score ${o.score?.toFixed(1)} < ${o.percentage})`
        : `WRONG — claimed found=true with score ${o.score?.toFixed(1)}: a hallucinated match`,
  };
}

const CHECKS = ["relocate.contractHonored"];

export const scraplingScenarios: Scenario[] = [
  {
    id: "identical-page",
    intent: "Finds the element on an unchanged page",
    input: { fingerprint: FP, pageHtml: ORIGINAL },
    checks: CHECKS,
    verdict: found,
  },
  {
    id: "class-renamed",
    intent: "Survives a CSS class rename (buy-now → cta-primary)",
    input: { fingerprint: FP, pageHtml: ORIGINAL.replace('class="buy-now"', 'class="cta-primary"') },
    checks: CHECKS,
    verdict: found,
  },
  {
    id: "tag-changed",
    intent: "Survives the wrapper changing from div to section",
    input: {
      fingerprint: FP,
      pageHtml: ORIGINAL.replace("<div class=\"product-card featured\"", "<section class=\"product-card featured\"").replace("</div>", "</section>"),
    },
    checks: CHECKS,
    verdict: found,
  },
  {
    id: "moved-deeper",
    intent: "Survives being wrapped in two new layout divs",
    input: {
      fingerprint: FP,
      pageHtml: ORIGINAL.replace(
        '<button class="buy-now" id="buy-A-1001">Add to basket</button>',
        '<div class="row"><div class="col"><button class="buy-now" id="buy-A-1001">Add to basket</button></div></div>',
      ),
    },
    checks: CHECKS,
    verdict: found,
  },
  {
    id: "siblings-added",
    intent: "Survives new sibling elements appearing alongside it",
    input: {
      fingerprint: FP,
      pageHtml: ORIGINAL.replace(
        '<button class="buy-now"',
        '<span class="badge">New</span><span class="stock">In stock</span><button class="buy-now"',
      ),
    },
    checks: CHECKS,
    verdict: found,
  },
  {
    id: "attributes-changed",
    intent: "Survives added data/aria attributes",
    input: {
      fingerprint: FP,
      pageHtml: ORIGINAL.replace(
        'id="buy-A-1001"',
        'id="buy-A-1001" data-testid="add-to-cart" aria-label="Add to basket" data-analytics="pdp-cta"',
      ),
    },
    checks: CHECKS,
    verdict: found,
  },
  {
    id: "text-reworded",
    intent: "Survives the button label being reworded",
    input: {
      fingerprint: FP,
      pageHtml: ORIGINAL.replace("Add to basket", "Add to cart"),
    },
    checks: CHECKS,
    verdict: found,
  },
  {
    id: "full-redesign",
    intent: "Survives a combined redesign — tag, classes, nesting and text all change at once",
    input: {
      fingerprint: FP,
      pageHtml: `<html><body><main><article class="tile" data-sku="A-1001">
          <h3 class="tile__heading">Wireless Headphones</h3>
          <span class="tile__price">£129.99</span>
          <div class="tile__actions"><button class="btn btn--primary" id="buy-A-1001">Buy now</button></div>
        </article></main></body></html>`,
    },
    checks: CHECKS,
    verdict: found,
  },
  {
    id: "element-removed",
    intent: "Says NOT FOUND when the element is genuinely gone — no hallucinated match",
    input: {
      fingerprint: FP,
      pageHtml: `<html><body><main><p>This product has been discontinued.</p></main></body></html>`,
    },
    checks: CHECKS,
    verdict: notFound,
  },
  {
    id: "empty-page",
    intent: "Handles an empty document without crashing, and reports not-found",
    input: { fingerprint: FP, pageHtml: "<html><body></body></html>" },
    checks: CHECKS,
    verdict: notFound,
  },
];
