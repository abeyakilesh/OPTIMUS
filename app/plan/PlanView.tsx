"use client";

/**
 * THE PLANNING AREA — describe a goal, read the proposed steps, then approve.
 *
 * The gap this fills: OPTIMUS could run a mission and watch it, but the mission
 * had to be written in code. A person had no way to ask for work, and no way to
 * SEE what was going to happen before it happened.
 *
 * A plan is a mission that has not been applied — the "pull request" half of
 * the execution model. Reading it is the review; approving it is the merge.
 *
 * ⚠️ HONEST ABOUT THE BLOCKER. Planning needs a model that passed the contract.
 * When none has, this page says exactly that and what to run, instead of an
 * empty box that looks broken.
 */

import { useEffect, useState } from "react";
import { AppShell } from "@/components/workspace/AppShell";
import { semanticsFor } from "@/lib/graph/semantics";
import { ClipboardList, Send, AlertTriangle, Check, ArrowRight } from "lucide-react";
import "./plan.css";

interface PlannedStep { id: string; capabilityId: string; dependsOn: string[]; checks: string[] }
interface Skill { id: string; does: string; agent: string; gives: string; plannable: boolean }

export function PlanView() {
  const [goal, setGoal] = useState("");
  const [skills, setSkills] = useState<Skill[]>([]);
  const [steps, setSteps] = useState<PlannedStep[] | null>(null);
  const [thinking, setThinking] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/library")
      .then((r) => r.json())
      .then((b) => b.ok && setSkills(b.capabilities.filter((c: Skill) => c.plannable)))
      .catch(() => {});
  }, []);

  const propose = async () => {
    if (!goal.trim()) return;
    setThinking(true);
    setProblem(null);
    setSteps(null);
    try {
      const res = await fetch("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal }),
      });
      const body = await res.json();
      if (body.ok) setSteps(body.steps as PlannedStep[]);
      else setProblem(body.reason ?? "OPTIMUS could not make a plan");
    } catch (e) {
      setProblem(String(e));
    } finally {
      setThinking(false);
    }
  };

  return (
    <AppShell>
      <div className="plan-wrap">
        <header className="plan-head">
          <h1>Plan the work</h1>
          <p>
            Describe what you want. OPTIMUS proposes the steps and you read them before
            anything runs — nothing touches the world until you approve it.
          </p>
        </header>

        <div className="plan-box">
          <textarea
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder="What do you want done?"
            rows={3}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void propose();
            }}
          />
          <button onClick={propose} disabled={thinking || !goal.trim()}>
            {thinking ? "Thinking…" : <><Send size={14} /> Propose a plan</>}
          </button>
        </div>

        {problem && (
          <div className="plan-problem">
            <AlertTriangle size={16} />
            <div>
              <b>OPTIMUS can&apos;t plan yet</b>
              <p>{problem}</p>
            </div>
          </div>
        )}

        {steps && (
          <section className="plan-result">
            <h2>Proposed steps</h2>
            <ol className="plan-steps">
              {steps.map((s, i) => {
                const sem = semanticsFor(s.capabilityId);
                return (
                  <li key={s.id}>
                    <span className="plan-num">{i + 1}</span>
                    <div>
                      <b>{sem.verb}</b>
                      <span className="plan-agent">{sem.agent}</span>
                      {s.dependsOn.length > 0 && (
                        <span className="plan-after">
                          after step {s.dependsOn.map((d) => steps.findIndex((x) => x.id === d) + 1).join(", ")}
                        </span>
                      )}
                    </div>
                    <span className="plan-checks"><Check size={11} /> {s.checks.length} check{s.checks.length === 1 ? "" : "s"}</span>
                  </li>
                );
              })}
            </ol>
            <div className="plan-approve">
              <button className="is-primary" disabled title="Running an approved plan is the next piece">
                Approve &amp; build <ArrowRight size={14} />
              </button>
              <span className="plan-muted">Approval is not wired to execution yet.</span>
            </div>
          </section>
        )}

        <section className="plan-skills">
          <h2><ClipboardList size={13} /> What OPTIMUS can use for this</h2>
          {skills.length === 0 ? (
            <p className="plan-muted">Loading the skill list…</p>
          ) : (
            <div className="plan-skill-grid">
              {skills.map((s) => (
                <div key={s.id} className="plan-skill">
                  <b>{s.does}</b>
                  <span>{s.agent} → {s.gives}</span>
                </div>
              ))}
            </div>
          )}
          <p className="plan-muted">
            A plan can only use these. If what you asked for needs something else,
            OPTIMUS will say so rather than inventing a step.
          </p>
        </section>
      </div>
    </AppShell>
  );
}
