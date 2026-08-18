# ADR-0005 — Vercel hosts the surface, never the kernel

**Status:** accepted · **Date:** 2026-08-16 · **Refines:** ADR-0003, `COST_MODEL.md` §4

## Context

The landing page is being deployed to Vercel. Vercel makes Next.js deployment
effectively free and zero-effort, which creates an obvious temptation: once the
app is already there, put the rest of OPTIMUS there too.

That temptation must be closed off explicitly, because discovering the limit
halfway through building the kernel would mean rewriting the execution model
around a platform that cannot support it.

## Decision

**Vercel hosts the public marketing surface only.** The kernel — broker,
scheduler, sandbox, artifact store, verification spine — and every SERVICE-fate
engine run on the local machine (stage 1) or a long-lived host (stage 2:
Oracle Always Free / Cloudflare Tunnel). No mission ever executes on Vercel.

## Rationale

Vercel is serverless: a function wakes, answers one request in seconds, and is
destroyed. Every core requirement of a mission contradicts that model.

| Requirement | Source | Vercel |
|---|---|---|
| A step is a loop that retries within a wall-time budget | `CLAUDE.md` execution model | function capped at 10–60 s |
| OmniRoute runs as a **local child process**, never an external API | `CLAUDE.md` "BUNDLE" definition | no process survives a request |
| Browser engines drive real pages | WP-002 | no persistent browser, no Docker |
| Artifact store is content-addressed on disk | FR-4 | filesystem read-only except an ephemeral `/tmp` |
| Scheduler resumes after a crash without re-running completed steps | FR-5 | no durable local state at all |
| Missions run for minutes | PRD §3 | exceeds the limit by an order of magnitude |

The failure would also be *silent in development and loud in production* — the
worst shape. Everything works locally, then times out for a real user.

## Consequences

**Good:** the split is honest and cheap. The shop window is fast, global and
₹0; the engine stays where it can actually run. It also reinforces ADR-0003 —
if the kernel is properly behind ports and adapters, where it runs is a
deployment detail, not an architectural one.

**Bad:** two places to deploy instead of one, and the landing page cannot call
the kernel directly. Any future "try it live" demo needs the stage-2 host, not
a Vercel function.

**Guard:** no secret is ever configured in the Vercel dashboard. The six
variables Vercel detects come from `.env.example` and are intentionally empty;
`ANTHROPIC_BASE_URL` points at `localhost:20128`, which is meaningful only on a
machine actually running OmniRoute. Filling them in on Vercel would put live
provider keys on a public host to no purpose.

**Revisit if:** the kernel is ever split so that a genuinely stateless slice
(plan preview, artifact viewer) could serve from the edge. That slice could
live on Vercel; the executing kernel still could not.
