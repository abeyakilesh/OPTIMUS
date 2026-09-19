"use client";

/**
 * What OPTIMUS has actually finished, and whether it can be believed.
 *
 * Every row is a real mission log. The verdict comes from the checks that ran,
 * never from a summary written afterwards — which is the whole reason a
 * results page is worth having rather than a list of green ticks.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/workspace/AppShell";
import { toSemanticView } from "@/lib/graph/semantics";
import type { Graph } from "@/lib/graph/model";
import { CheckCircle2, XCircle, ArrowRight } from "lucide-react";
import "./results.css";

interface Row {
  id: string;
  objective: string;
  verified: number;
  failed: number;
  total: number;
  green: boolean;
}

export function ResultsView() {
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    (async () => {
      const list = await fetch("/api/graph/missions").then((r) => r.json()).catch(() => ({ missions: [] }));
      const ids: string[] = list.missions ?? [];
      const out: Row[] = [];
      for (const id of ids.slice(0, 30)) {
        const b = await fetch(`/api/graph/${encodeURIComponent(id)}`).then((r) => r.json()).catch(() => null);
        if (!b?.ok) continue;
        const view = toSemanticView(b.graph as Graph);
        out.push({
          id,
          objective: view.objective || id,
          verified: view.verified,
          failed: view.failed,
          total: view.total,
          green: view.failed === 0 && view.verified === view.total && view.total > 0,
        });
      }
      setRows(out);
    })();
  }, []);

  return (
    <AppShell>
      <div className="res-wrap">
        <header className="res-head">
          <h1>Results</h1>
          <p>Finished work, and the proof behind it. Open one to see every step and its evidence.</p>
        </header>

        {!rows ? (
          <p className="res-muted">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="res-muted">Nothing has finished yet.</p>
        ) : (
          <ul className="res-list">
            {rows.map((r) => (
              <li key={r.id}>
                <Link href={`/missions/${encodeURIComponent(r.id)}`}>
                  <span className={`res-mark ${r.green ? "is-ok" : "is-bad"}`}>
                    {r.green ? <CheckCircle2 size={17} /> : <XCircle size={17} />}
                  </span>
                  <span className="res-body">
                    <b>{r.objective}</b>
                    <em>
                      {r.verified} of {r.total} verified
                      {r.failed > 0 ? ` · ${r.failed} failed` : ""}
                    </em>
                  </span>
                  <ArrowRight size={14} className="res-arrow" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
