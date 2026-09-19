"use client";

/**
 * THE KNOWLEDGE VAULT — what OPTIMUS can do, and what it cannot.
 *
 * Reads the live broker. Every card here is a capability a mission can
 * actually call; nothing is listed because it exists on disk or because it
 * would be nice to have. The count is small on purpose — nexus listed 832
 * skills and ran none, and a library that flatters is worse than no library.
 */

import { useEffect, useState } from "react";
import { AppShell } from "@/components/workspace/AppShell";
import { chromeFor } from "@/components/canvas/nodeTypes";
import { Check, Lock, ArrowRight } from "lucide-react";
import "./library.css";

interface Shelves {
  wired: number;
  onDisk: number;
  downloadedNotWired: number;
  toDownload: number;
}

interface Capability {
  id: string;
  does: string;
  agent: string;
  gives: string;
  needs: string[];
  allowed: string[];
  plannable: boolean;
  whyNot?: string;
  version: string;
}

export function LibraryView() {
  const [data, setData] = useState<{
    capabilities: Capability[]; total: number; plannable: number;
    shelves?: Shelves; toDownload?: string[]; downloadedNotWired?: string[];
  } | null>(null);
  const [shelf, setShelf] = useState<"ready" | "here" | "missing">("ready");
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/library")
      .then((r) => r.json())
      .then((b) => (b.ok ? setData(b) : setError(b.reason ?? "could not read the library")))
      .catch((e) => setError(String(e)));
  }, []);

  return (
    <AppShell><div className="lib-shell">

      <header className="lib-head">
        <div>
          <h1>What OPTIMUS can do</h1>
          <p>
            Every skill below is wired into the kernel and callable by a mission right now.
            Nothing here is aspirational.
          </p>
        </div>
        {data && (
          <div className="lib-counts">
            <div><b>{data.total}</b><span>skills wired</span></div>
            <div><b>{data.plannable}</b><span>the planner may choose</span></div>
          </div>
        )}
      </header>

      {/* THREE SHELVES, and the sizes are deliberately uncomfortable. What is
          usable, what is downloaded but not wired, and what is not here at
          all. Hiding the last two is how a catalogue starts lying. */}
      {data?.shelves && (
        <nav className="lib-shelves">
          <button className={shelf === "ready" ? "is-active" : ""} onClick={() => setShelf("ready")}>
            <b>{data.shelves.wired}</b> Ready to use
            <em>wired into the kernel</em>
          </button>
          <button className={shelf === "here" ? "is-active" : ""} onClick={() => setShelf("here")}>
            <b>{data.shelves.downloadedNotWired}</b> Downloaded, not wired
            <em>on disk, no skill built yet</em>
          </button>
          <button className={shelf === "missing" ? "is-active" : ""} onClick={() => setShelf("missing")}>
            <b>{data.shelves.toDownload}</b> Not downloaded
            <em>from your missing-domains list</em>
          </button>
        </nav>
      )}

      {error ? <p className="lib-error">{error}</p> : null}
      {!data && !error ? <p className="lib-muted lib-pad">Loading…</p> : null}

      {shelf !== "ready" && data ? (
        <div className="lib-repos">
          {(shelf === "here" ? data.downloadedNotWired : data.toDownload)?.map((r) => (
            <span key={r} className="lib-repo">{r}</span>
          )) ?? <p className="lib-muted">Nothing here.</p>}
          {shelf === "here" ? (
            <p className="lib-note">
              These are on your machine. Each one needs a skill built before OPTIMUS can use it —
              downloading is not absorbing.
            </p>
          ) : (
            <p className="lib-note">
              OPTIMUS can fetch these itself, and verify each against the commit GitHub reports.
            </p>
          )}
        </div>
      ) : null}

      <div className="lib-grid" hidden={shelf !== "ready"}>
        {data?.capabilities.map((c) => {
          const { Icon } = chromeFor("capability");
          const isOpen = open === c.id;
          return (
            <article
              key={c.id}
              className={`lib-card ${c.plannable ? "" : "is-limited"} ${isOpen ? "is-open" : ""}`}
              onClick={() => setOpen(isOpen ? null : c.id)}
            >
              <div className="lib-card-head">
                <span className="lib-icon"><Icon size={16} /></span>
                <div>
                  <h2>{c.does}</h2>
                  <p className="lib-agent">{c.agent}</p>
                </div>
                {c.plannable ? (
                  <span className="lib-tag is-ok"><Check size={11} /> Ready</span>
                ) : (
                  <span className="lib-tag is-limited"><Lock size={11} /> Manual only</span>
                )}
              </div>

              <div className="lib-flow">
                <span className="lib-needs">
                  {c.needs.length ? c.needs.join(", ") : "nothing"}
                </span>
                <ArrowRight size={12} />
                <span className="lib-gives">{c.gives}</span>
              </div>

              {c.allowed.length > 0 && (
                <ul className="lib-perms">
                  {c.allowed.map((a) => <li key={a}>{a}</li>)}
                </ul>
              )}

              {isOpen && (
                <div className="lib-detail">
                  {/* The reason the planner cannot choose it — the RECORDED
                      one, so a limit is explained rather than asserted. */}
                  {c.whyNot ? (
                    <>
                      <h3>Why the planner can&apos;t choose this</h3>
                      <p>{c.whyNot}</p>
                    </>
                  ) : null}
                  <h3>Technical name</h3>
                  <code>{c.id}</code> <span className="lib-muted">v{c.version}</span>
                </div>
              )}
            </article>
          );
        })}
      </div>

      {data?.shelves && (
        <footer className="lib-foot">
          <p>
            <b>{data.shelves.wired} skills wired</b> out of {data.shelves.onDisk} repositories
            sitting on this machine, with {data.shelves.toDownload} more still to fetch.
            Every number here was counted just now — from the kernel, the filesystem, and
            OPTIMUS reading its own task list. Downloading a repository is not the same as
            being able to use it, so the two are never added together.
          </p>
        </footer>
      )}
    </div></AppShell>
  );
}
