"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MARKS, GatewayMark } from "./ProviderLogos";
import { recommend, fractionRemaining, type RankInput } from "@/lib/providers/recommend";
import type { ProviderStatus, MissionCostSample, TestResult } from "@/lib/providers/probe";
import type { OmniRouteStatus } from "@/lib/providers/omniroute";

/**
 * Settings → Model Providers.
 *
 * The one rule this screen is built around: every number is one a provider
 * actually sent. Where a provider publishes nothing, it says so in words and
 * draws no bar — an empty bar and a bar at zero look identical, and only one
 * of them is true.
 */

export interface StatusPayload {
  observedAt: string;
  providers: ProviderStatus[];
  omniroute: OmniRouteStatus;
  missionCost: MissionCostSample;
  pool: { measuredProviders: number; unmeasuredProviders: number; note: string };
}

const REFRESH_MS = 60_000;

/* ── small shared pieces ─────────────────────────────────────────────── */

function Dot({ tone }: { tone: "on" | "off" | "warn" }) {
  if (tone === "on") {
    return (
      <span className="relative flex h-2.5 w-2.5 shrink-0">
        <span className="fx-ping absolute inline-flex h-full w-full rounded-full bg-pass" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-pass" />
      </span>
    );
  }
  if (tone === "warn") return <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-run" />;
  return <span className="h-2.5 w-2.5 shrink-0 rounded-full border border-line-2 bg-white" />;
}

function Label({ children }: { children: React.ReactNode }) {
  return <span className="label text-faint">{children}</span>;
}

function n(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : value.toLocaleString("en-US");
}

/**
 * A bar is drawn ONLY from a measured pair. `null` renders the reason, never
 * a zero-width bar that reads as "empty".
 */
function Meter({
  remaining,
  limit,
  unit,
  absent,
}: {
  remaining: number | null;
  limit: number | null;
  unit: string;
  absent: string;
}) {
  const frac = fractionRemaining(remaining, limit);
  if (frac === null) {
    return <p className="font-data text-[11px] leading-relaxed text-faint">{absent}</p>;
  }
  // FLOOR, never round. 998/1000 is 99.8%, and Math.round renders that as
  // "100%" — a full bar while two requests are already gone. Directive #6's
  // "never round up" is about an Absorption Score, but the reason is general:
  // rounding toward the flattering answer is how a number stops being one.
  const pct = Math.floor(frac * 100);
  const tone = pct > 50 ? "bg-pass" : pct > 15 ? "bg-run" : "bg-cyan-dark";
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <span className="font-data text-[12px] text-ink">
          {n(remaining)} <span className="text-faint">/ {n(limit)} {unit}</span>
        </span>
        <span className="font-data text-[12px] font-medium text-ink">{pct}%</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-sky-2">
        <div className={`h-full rounded-full ${tone} transition-[width] duration-500`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function whenLocal(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

/* ── provider card ───────────────────────────────────────────────────── */

function ProviderCard({
  status,
  test,
  busy,
  onTest,
}: {
  status: ProviderStatus;
  test: TestResult | undefined;
  busy: boolean;
  onTest: () => void;
}) {
  const Mark = MARKS[status.id];
  const connected = status.reachable;
  const rl = test?.rateLimit ?? null;
  const measurable = status.usageSource === "inference-headers";

  return (
    <article className="flex flex-col gap-5 rounded-xl border border-line bg-white p-5">
      <header className="flex items-start gap-3">
        <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-line bg-sky text-cyan-dark">
          {Mark ? <Mark className="h-5 w-5" /> : null}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-[17px] leading-tight text-ink">{status.name}</h3>
          <div className="mt-1 flex items-center gap-2">
            <Dot tone={connected ? "on" : status.keyPresent ? "warn" : "off"} />
            <span className="font-data text-[11.5px] text-body">
              {connected ? "Connected" : status.keyPresent ? "Not connected" : "No key"}
            </span>
            {status.latencyMs !== null && connected ? (
              <span className="font-data text-[11.5px] text-faint">· {status.latencyMs}ms</span>
            ) : null}
          </div>
        </div>
      </header>

      <div className="grid gap-1">
        <Label>API key</Label>
        <p className="font-data text-[12.5px] text-ink">
          {status.maskedKey ?? <span className="text-faint">not set</span>}
        </p>
      </div>

      {status.error ? (
        <div className="rounded-lg border border-line-2 bg-mist p-3">
          <Label>Reported error</Label>
          <p className="mt-1 font-data text-[11.5px] leading-relaxed break-words text-body">{status.error}</p>
        </div>
      ) : null}

      <div className="grid gap-1">
        <Label>Models offered to this key</Label>
        <p className="font-data text-[12.5px] text-ink">
          {status.modelCount === null ? "—" : `${status.modelCount} available`}
        </p>
        {status.suggestedModel ? (
          <p className="font-data text-[11px] leading-relaxed text-faint">
            <span className="text-body">{status.suggestedModel}</span>
            {status.suggestedModelReason ? ` — ${status.suggestedModelReason}` : ""}
          </p>
        ) : status.models.length > 0 ? (
          <p className="font-data text-[11px] leading-relaxed text-faint">
            {status.models.slice(0, 3).join(" · ")}
          </p>
        ) : null}
      </div>

      {/* ── usage ── */}
      <div className="grid gap-3 border-t border-line pt-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <Label>Rate limit</Label>
          {rl ? <span className="font-data text-[10.5px] leading-tight text-faint">{rl.window}</span> : null}
        </div>

        {measurable && rl ? (
          <p className="font-data text-[10.5px] leading-relaxed text-faint">
            Limits are reported per model — this reading belongs to the model named below, not to
            the account as a whole.
          </p>
        ) : null}
        {!measurable ? (
          <p className="font-data text-[11px] leading-relaxed text-body">
            <span className="text-ink">Usage not available from this provider.</span>{" "}
            {status.usageNote}
          </p>
        ) : rl ? (
          <div className="grid gap-4">
            <Meter
              remaining={rl.remainingRequests}
              limit={rl.limitRequests}
              unit="requests"
              absent="requests: not reported on this response"
            />
            <Meter
              remaining={rl.remainingTokens}
              limit={rl.limitTokens}
              unit="tokens"
              absent="tokens: not reported on this response"
            />
            <dl className="grid gap-1.5">
              {test?.model ? (
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                  <dt className="font-data text-[11px] text-faint">Measured on</dt>
                  <dd className="font-data text-[11px] text-ink">{test.model}</dd>
                </div>
              ) : null}
              {test?.fellBackFrom ? (
                <p className="font-data text-[10.5px] leading-relaxed text-faint">
                  {test.fellBackFrom} was refused by the provider&rsquo;s own tier, so this reading is
                  the next candidate&rsquo;s.
                </p>
              ) : null}
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                <dt className="font-data text-[11px] text-faint">Requests reset</dt>
                <dd className="font-data text-[11px] text-ink">
                  {rl.resetRequestsAt ? (
                    <>
                      {whenLocal(rl.resetRequestsAt)}{" "}
                      <span className="text-faint">(derived from &ldquo;{rl.resetRequestsRaw}&rdquo;)</span>
                    </>
                  ) : (
                    <span className="text-faint">not reported by this provider</span>
                  )}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="font-data text-[11px] text-faint">Measured at</dt>
                <dd className="font-data text-[11px] text-ink">{whenLocal(rl.observedAt)}</dd>
              </div>
            </dl>
          </div>
        ) : (
          <p className="font-data text-[11px] leading-relaxed text-body">
            Limits are only returned on an inference call, never on the model list. Run a connection
            test to measure them — nothing here is filled in from published tier documentation.
          </p>
        )}
      </div>

      <div className="mt-auto flex items-center justify-between gap-3 border-t border-line pt-4">
        <div className="min-w-0">
          {test ? (
            <p className="font-data text-[11px] leading-relaxed text-body">
              {test.ok ? (
                <>
                  <span className="text-ink">{test.latencyMs}ms</span> · {test.model}
                </>
              ) : (
                <span className="break-words">{test.error ?? "test failed"}</span>
              )}
            </p>
          ) : (
            <p className="font-data text-[11px] leading-relaxed text-faint">
            {measurable ? "Sends one real request · max_tokens 1" : "Pings the catalogue · no quota spent"}
          </p>
          )}
        </div>
        <button
          type="button"
          onClick={onTest}
          disabled={busy || !status.keyPresent}
          className="shrink-0 rounded-lg border border-ink bg-ink px-3.5 py-2 font-data text-[11px] text-white transition-opacity hover:opacity-85 disabled:cursor-not-allowed disabled:border-line-2 disabled:bg-line disabled:text-faint"
        >
          {busy ? "Testing…" : "Test connection"}
        </button>
      </div>
    </article>
  );
}

/* ── the panel ───────────────────────────────────────────────────────── */

export default function ProvidersPanel({ initial }: { initial: StatusPayload }) {
  const [data, setData] = useState<StatusPayload>(initial);
  const [tests, setTests] = useState<Record<string, TestResult>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/providers/status", { cache: "no-store" });
      const text = await res.text();
      if (!res.ok) throw new Error(`status ${res.status}`);
      const json = JSON.parse(text) as StatusPayload;
      if (mounted.current) {
        setData(json);
        setRefreshError(null);
      }
    } catch (error) {
      // Say the refresh failed rather than leaving stale numbers looking live.
      if (mounted.current) setRefreshError(error instanceof Error ? error.message : "refresh failed");
    } finally {
      if (mounted.current) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const timer = setInterval(refresh, REFRESH_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  const runTest = useCallback(async (id: string) => {
    setBusy((b) => ({ ...b, [id]: true }));
    try {
      const res = await fetch("/api/providers/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const json = (await res.json()) as { result?: TestResult; reason?: string };
      if (json.result && mounted.current) setTests((t) => ({ ...t, [id]: json.result! }));
    } finally {
      if (mounted.current) setBusy((b) => ({ ...b, [id]: false }));
    }
  }, []);

  const rec = useMemo(() => {
    const inputs: RankInput[] = data.providers.map((p) => {
      const t = tests[p.id];
      const rl = t?.rateLimit ?? null;
      return {
        id: p.id,
        name: p.name,
        remainingRequests: rl?.remainingRequests ?? null,
        limitRequests: rl?.limitRequests ?? null,
        remainingTokens: rl?.remainingTokens ?? null,
        limitTokens: rl?.limitTokens ?? null,
        latencyMs: t?.latencyMs ?? null,
        model: t?.model ?? p.suggestedModel ?? null,
        usageMeasurable: p.usageSource === "inference-headers",
      };
    });
    return recommend(inputs);
  }, [data.providers, tests]);

  const or = data.omniroute;
  const measuredCount = Object.values(tests).filter((t) => t.rateLimit).length;

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-10 sm:px-8">
      {/* header */}
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-line pb-6">
        <div>
          <Label>Settings</Label>
          <h1 className="font-display mt-1.5 text-[30px] leading-none text-ink">Model providers</h1>
          <p className="mt-2.5 max-w-2xl text-[14px] leading-relaxed text-body">
            Every figure below is one a provider actually returned. Where a provider publishes
            nothing, this page says so rather than drawing a bar.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-data text-[11px] text-faint">
            {refreshError ? `refresh failed: ${refreshError}` : `checked ${whenLocal(data.observedAt)}`}
          </span>
          <button
            type="button"
            onClick={refresh}
            disabled={refreshing}
            className="rounded-lg border border-line-2 bg-white px-3.5 py-2 font-data text-[11px] text-ink transition-colors hover:bg-mist disabled:text-faint"
          >
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </header>

      {/* pool summary */}
      <section className="mb-6 rounded-xl border border-line bg-sky p-5">
        <div className="grid gap-5 sm:grid-cols-3">
          <div>
            <Label>Providers with measured limits</Label>
            <p className="font-data mt-1.5 text-[22px] text-ink">
              {measuredCount}
              <span className="text-[14px] text-faint"> / {data.providers.length}</span>
            </p>
          </div>
          <div>
            <Label>Mean tokens per mission</Label>
            <p className="font-data mt-1.5 text-[22px] text-ink">
              {data.missionCost.meanTokens === null ? "—" : n(data.missionCost.meanTokens)}
              {data.missionCost.sampleSize > 0 ? (
                <span className="text-[14px] text-faint"> · n={data.missionCost.sampleSize}</span>
              ) : null}
            </p>
          </div>
          <div>
            <Label>Missions remaining</Label>
            <p className="font-data mt-1.5 text-[13px] leading-relaxed text-body">
              not computable — needs measured pool limits
            </p>
          </div>
        </div>
        <p className="mt-4 border-t border-cyan-soft pt-3 font-data text-[11px] leading-relaxed text-body">
          {data.pool.note} <span className="text-faint">{data.missionCost.note}</span>
        </p>
      </section>

      {/* routing / gateway */}
      <section className="mb-6 rounded-xl border border-line bg-white p-5">
        <header className="mb-4 flex items-start gap-3">
          <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-line bg-sky text-cyan-dark">
            <GatewayMark className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-[17px] leading-tight text-ink">Routing · OmniRoute</h2>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <Dot tone={or.reachable ? (or.authenticated ? "on" : "warn") : "off"} />
              <span className="font-data text-[11.5px] text-body">
                {or.reachable ? (or.authenticated ? "Reachable · authenticated" : "Reachable · not authenticated") : "Not running"}
              </span>
              <span className="font-data text-[11.5px] text-faint">· {or.baseUrl}</span>
            </div>
          </div>
        </header>

        {or.error ? (
          <p className="mb-4 rounded-lg border border-line-2 bg-mist p-3 font-data text-[11.5px] leading-relaxed text-body">
            {or.error}
          </p>
        ) : null}

        <div className="grid gap-5 sm:grid-cols-3">
          <div>
            <Label>Models advertised</Label>
            <p className="font-data mt-1.5 text-[15px] text-ink">
              {n(or.advertisedModelCount)}
              {or.connectionCount !== null ? (
                <span className="text-[13px] text-faint">
                  {" "}
                  · {or.connectionCount} connection{or.connectionCount === 1 ? "" : "s"}
                </span>
              ) : null}
            </p>
            {/* This label used to read "Models routable", which was wrong and
                shipped. The gateway lists every provider it knows how to talk
                to, connected or not: 286 advertised here, and exactly one
                answered a real request. Advertised is a claim; only a request
                is evidence — the same mistake as trusting a model catalogue
                over a 403. */}
            <p className="mt-1 font-data text-[11px] leading-relaxed text-faint">
              advertised ≠ reachable — a model needs a configured connection
            </p>
          </div>
          <div>
            <Label>Requests through the gateway</Label>
            {or.usage ? (
              <>
                <p className="font-data mt-1.5 text-[15px] text-ink">{n(or.usage.totalRequests)}</p>
                <p className="mt-1 font-data text-[11px] leading-relaxed text-faint">
                  {or.usage.successRatePct}% success · {n(or.usage.totalTokens)} tokens · avg {or.usage.avgLatencyMs}ms
                </p>
              </>
            ) : (
              <p className="mt-1.5 font-data text-[11px] leading-relaxed text-body">{or.usageNote ?? "—"}</p>
            )}
          </div>
          <div>
            <Label>Counts what, exactly</Label>
            <p className="mt-1.5 font-data text-[11px] leading-relaxed text-body">
              Requests OmniRoute <em className="not-italic text-ink">routed</em>. A provider counts what
              it <em className="not-italic text-ink">served</em>. Different numbers; neither is shown as
              the other.
            </p>
          </div>
        </div>
      </section>

      {/* recommendation */}
      <section className="mb-6 rounded-xl border border-line bg-white p-5">
        <Label>Best choice right now</Label>
        {rec.best ? (
          <>
            <p className="mt-2 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
              <span className="font-display text-[19px] leading-snug text-ink">{rec.best.providerName}</span>
              <span className="font-data text-[15px] text-cyan-dark">{rec.best.model}</span>
            </p>
            <p className="mt-1.5 font-data text-[12px] text-body">{rec.best.reason}</p>
          </>
        ) : (
          <p className="mt-2 max-w-3xl text-[13.5px] leading-relaxed text-body">{rec.reason}</p>
        )}
        {rec.excluded.length > 0 ? (
          <ul className="mt-3 grid gap-1 border-t border-line pt-3">
            {rec.excluded.map((e) => (
              <li key={e.name} className="font-data text-[11px] leading-relaxed text-faint">
                <span className="text-body">{e.name}</span> — {e.why}
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      {/* providers */}
      <section className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {data.providers.map((p) => (
          <ProviderCard
            key={p.id}
            status={p}
            test={tests[p.id]}
            busy={Boolean(busy[p.id])}
            onTest={() => runTest(p.id)}
          />
        ))}
      </section>

      <p className="mt-8 border-t border-line pt-5 font-data text-[11px] leading-relaxed text-faint">
        Status refreshes every 60s and consumes no quota. Rate limits are NOT polled: they exist only
        on an inference response, so polling them would spend the allowance it reports on — the number
        would become a function of this page being open. Press &ldquo;Test connection&rdquo; to measure.
      </p>
    </div>
  );
}
