# OPTIMUS — Cost model

**Status:** draft for review · **Date:** 2026-08-16 · **Companion:** `PRD.md`, `REQUIREMENTS.md`

You asked repeatedly how this costs money and never got a straight answer. This
is the straight answer, with the arithmetic shown so you can check it.

**Budget of record:** existing $20/mo Claude subscription + **≤ ₹2000 one-off
discretionary**. No runway, no funding, one developer.

---

## 1. Where money can leak

Exactly four places. Nothing else in this project can cost you anything.

| # | Cost centre | Who pays today | Risk |
|---|---|---|---|
| 1 | **Model inference** (tokens) | free tiers via OmniRoute | **the only real risk** |
| 2 | **Compute/hosting** | your Mac | ₹0 until you invite strangers |
| 3 | **Storage/egress** | your SSD | ₹0 |
| 4 | **CI minutes** | GitHub free tier | ₹0 for a public repo |

---

## 2. What one mission actually costs

Measured shape of the v0.1 research mission (5 steps):

| Phase | Input tokens | Output tokens |
|---|---|---|
| Plan the objective | ~6,000 | ~1,200 |
| Step reasoning × 5 | ~50,000 | ~7,000 |
| Extraction/normalisation | ~15,000 | ~4,000 |
| Verification checks | ~8,000 | ~1,000 |
| **Total** | **~79,000** | **~13,200** |

Call it **~92k tokens per mission**, rounded up.

### Against the free pool

OmniRoute aggregates the *documented* free tiers of 43 provider pools / 516
models — its dashboard puts the honest, pool-deduped figure at **~1.53 B free
tokens/month**. Your three keys (Groq, Mistral, Gemini) are three of those pools.

```
1,530,000,000 tokens/month ÷ 92,000 tokens/mission ≈ 16,600 missions/month
```

**For you personally, running maybe 20 missions a day: ₹0, with three orders of
magnitude of headroom.** Cost centre 1 is solved for the single-user case.

### The honest caveats

- **Rate limits, not token totals, are the real ceiling.** A free tier may allow
  millions of tokens/month but only ~30 requests/minute. A 5-step mission is
  fine; forty concurrent missions are not. This constrains *concurrency*, not
  your monthly budget.
- **Free-tier quality is lower.** Planning is the hardest step and the one most
  hurt by a weak model. Mitigation in `PRD.md` risk table: plan with the best
  available free model, execute steps with cheap ones, and keep a paid key
  drop-in-able. **If planning accuracy is bad, the $20/mo Claude subscription
  you already pay for is the fallback — no new spend.**
- **15 of OmniRoute's providers are ToS-flagged** in its own docs. Read them
  before depending on one commercially.

---

## 3. The scale question — 1,000 users

Here is where the naive plan breaks, so be clear about it.

**If you serve 1,000 users from your keys:**

```
1,000 users × 10 missions/month × 92k tokens = 920,000,000 tokens/month
```

That fits inside 1.53 B on paper. **It still does not work**, for two reasons
that have nothing to do with volume:

1. **Provider terms.** Free tiers are for personal/development use. Reselling
   that capacity as a multi-tenant service breaches most of them. You would be
   one abuse report from losing every key at once.
2. **Rate limits.** 1,000 users are not evenly spread. A Monday-morning spike
   would queue behind a 30 req/min ceiling and the product would feel broken.

**Cost if you did it legitimately on paid APIs:**

```
920M tokens/month at a blended ~$0.30 per 1M (cheap tier)  ≈  $276/month
                  at Claude Sonnet rates (~$4.50 / 1M avg)  ≈  $4,100/month
```

Against a ₹2000 (~$24) budget, that is not a rounding error — it is the end of
the project. **You cannot fund inference for other people. Do not try.**

### Therefore: BYOK is not a cost optimisation, it is the architecture

Every user runs OPTIMUS with **their own key** (or their own free tiers via
their own OmniRoute). Your marginal cost per user is **₹0** — permanently, at
any user count.

| Model | Your cost at 1,000 users | Viable? |
|---|---|---|
| You pay for inference | $276 – $4,100/mo | ❌ |
| Free tiers, your keys, multi-tenant | ₹0 but breaches ToS + rate limits | ❌ |
| **BYOK, users self-host** | **₹0** | ✅ |
| BYOK, you host the app only | ~₹0 (see §4) | ✅ |

This is why `CLAUDE.md` says one standalone repo, local child processes, no
external API. It was already the right call; this is the arithmetic behind it.

---

## 4. Hosting — three stages, ₹0 for the first two

| Stage | What | Cost | When |
|---|---|---|---|
| **1. Local** | Everything on the MacBook i9. Nothing exposed. | **₹0** | now → v0.1 |
| **2. Free public** | Oracle Cloud Always Free (4 ARM cores / 24 GB RAM) or Cloudflare Tunnel from home. Serves the *app*; users bring keys. | **₹0** | when someone else should try it |
| **3. Paid** | A ₹500–800/mo VPS, only if free tiers throttle | ≤ ₹800/mo | only when real usage proves it |

The Dell Precision (32 GB) joins at stage 2 over Tailscale as a second worker if
you want more concurrency — still ₹0. See the hardware note in memory.

**Do not run the heavy repos locally.** Measured docker-compose service counts:
Dify **55 services**, firecrawl **15**, maxun **7**, Open WebUI 4. Running Dify
on a 16 GB laptop will swap and make everything else feel broken. These are
SERVICE-fate repos for stage 3 at the earliest.

---

## 5. CI cost

Public repo → GitHub Actions is **free and unlimited** for standard runners.
The Gauntlet currently runs ~1m30s per push. Nothing to optimise, nothing to pay.

If the repo ever goes private: 2,000 free minutes/month, and at ~2 min/run
that is ~1,000 runs/month. Still ₹0 in practice.

---

## 6. What you should actually spend the ₹2000 on

Nothing, yet. In priority order if you do:

1. **₹0 — nothing.** Stages 1 and 2 genuinely cost nothing. Spend when a real
   limit is hit, not in anticipation of one.
2. **A domain** (~₹800/yr) — only when someone other than you will type it.
3. **A ₹500–800/mo VPS** — only when the free tier demonstrably throttles.

**Do not buy:** GPUs (OmniRoute routes to hosted models), a paid scraping API
(browser-use + Scrapling + camoufox cover it), or model credits (the free pool is
1.53 B tokens/month).

---

## 7. Revenue — only if you want it later

Not required, and explicitly not a v0.1 concern. The BYOK architecture leaves
exactly one honest model available later: **charge for the app, never for the
tokens.** A one-off or subscription for the desktop app, while users bring their
own key, keeps your marginal cost at ₹0 at any scale. Anything that involves you
reselling inference re-introduces the $4,100/month problem above.

---

## 8. The one number to remember

> **Marginal cost per user = ₹0, at every scale, forever — but only because
> users bring their own key.** The moment OPTIMUS pays for someone else's
> inference, the project's economics break at roughly 20 users.
