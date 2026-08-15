import { v } from "./style";
import {
  BrowserIcon,
  CodeIcon,
  ResearchIcon,
  DataIcon,
  EvidenceIcon,
  VerifyIcon,
  RememberIcon,
} from "./Icons";

const SOURCES = [
  { Icon: BrowserIcon, name: "Browser", note: "act on any site" },
  { Icon: CodeIcon, name: "Code", note: "read, write, test" },
  { Icon: ResearchIcon, name: "Research", note: "collect + cite" },
  { Icon: DataIcon, name: "Data", note: "shape + model" },
];

const OUTPUTS = [
  { Icon: EvidenceIcon, name: "Artifact", note: "content-addressed" },
  { Icon: VerifyIcon, name: "Proof", note: "reproducible" },
  { Icon: RememberIcon, name: "Skill", note: "replayable" },
];

const SPINE = [
  { k: "K1", name: "Capability broker", note: "one manifest for every tool" },
  { k: "K2", name: "Permission boundary", note: "least privilege, per action" },
  { k: "K3", name: "Artifact graph", note: "every output, addressed" },
  { k: "K4", name: "Execution scheduler", note: "isolated, resumable" },
  { k: "K5", name: "Verification spine", note: "nothing ships unproven" },
];

/** A rail with dots travelling along it. */
function Rail({ dots = 2, offset = 0 }: { dots?: number; offset?: number }) {
  return (
    <div className="relative hidden h-px min-w-[40px] flex-1 bg-line lg:block">
      {Array.from({ length: dots }).map((_, i) => (
        <span
          key={i}
          style={v({
            "--fx-dur": `${2.4 + i * 0.9}s`,
            "--fx-d": `${i * 1.15 + offset}s`,
          })}
          className="fx-dot-x absolute top-1/2 h-[5px] w-[5px] -translate-y-1/2 rounded-full bg-cyan shadow-[0_0_6px_1px_rgba(6,182,212,.55)]"
        />
      ))}
    </div>
  );
}

export default function Kernel() {
  return (
    <section id="engine" className="relative overflow-hidden border-b border-line bg-white">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60%_50%_at_50%_50%,var(--color-sky)_0%,transparent_70%)]"
      />

      <div className="mx-auto max-w-[1180px] px-6 py-24">
        <p className="label text-center text-cyan-dark">The engine room</p>
        <h2 className="font-display mx-auto mt-3 max-w-[19ch] text-balance text-center text-[clamp(1.85rem,3.6vw,2.6rem)] leading-[1.08] text-ink">
          Every capability enters through the same five gates.
        </h2>
        <p className="mx-auto mt-4 max-w-[62ch] text-center text-[15.5px] leading-relaxed text-body">
          Most AI tools bolt integrations onto a chat box. OPTIMUS runs a real
          kernel underneath — so a browser action, a shell command and a
          workflow node are all the same kind of object, with the same
          permissions, the same proof and the same undo.
        </p>

        {/* ══ diagram ══ */}
        <div className="mt-16 grid items-center gap-8 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,0.85fr)] lg:gap-0">
          {/* sources */}
          <div className="space-y-3">
            {SOURCES.map(({ Icon, name, note }) => (
              <div key={name} className="flex items-center">
                <div className="group flex w-full max-w-[230px] items-center gap-2.5 rounded-xl border border-line bg-white px-3 py-2.5 transition hover:border-cyan/45 lg:w-auto">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-sky text-cyan-dark">
                    <Icon className="fx-lift-icon h-[15px] w-[15px]" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[13px] font-semibold leading-tight text-ink">
                      {name}
                    </span>
                    <span className="block font-data text-[10px] text-faint">{note}</span>
                  </span>
                </div>
                <Rail dots={2} />
              </div>
            ))}
          </div>

          {/* kernel — a calm, static underglow. No pulse, no heartbeat. */}
          <div className="underglow relative mx-auto w-full max-w-[330px] rounded-2xl bg-white p-5">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="fx-ping absolute inline-flex h-full w-full rounded-full bg-cyan" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-cyan" />
              </span>
              <p className="font-data text-[11px] font-semibold uppercase tracking-[0.16em] text-ink">
                OPTIMUS KERNEL
              </p>
            </div>

            <ul className="mt-4 space-y-px overflow-hidden rounded-xl border border-line bg-line">
              {SPINE.map(({ k, name, note }) => (
                <li
                  key={k}
                  className="group flex items-center gap-2.5 bg-white px-3 py-2.5 transition hover:bg-sky/60"
                >
                  <span className="font-data text-[10px] font-semibold text-cyan-dark">{k}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] font-medium leading-tight text-ink">
                      {name}
                    </span>
                    <span className="block truncate font-data text-[9.5px] text-faint">
                      {note}
                    </span>
                  </span>
                  <span className="h-1 w-1 shrink-0 rounded-full bg-line-2 transition group-hover:bg-cyan" />
                </li>
              ))}
            </ul>

            <p className="mt-3.5 text-center font-data text-[10px] text-faint">
              same contract · same sandbox · same audit log
            </p>
          </div>

          {/* outputs */}
          <div className="space-y-3">
            {OUTPUTS.map(({ Icon, name, note }) => (
              <div key={name} className="flex items-center">
                <Rail dots={1} offset={0.5} />
                <div className="group flex w-full max-w-[230px] items-center gap-2.5 rounded-xl border border-pass/25 bg-pass-soft/25 px-3 py-2.5 transition hover:border-pass/55 lg:w-auto">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-white text-pass">
                    <Icon className="fx-lift-icon h-[15px] w-[15px]" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[13px] font-semibold leading-tight text-ink">
                      {name}
                    </span>
                    <span className="block font-data text-[10px] text-faint">{note}</span>
                  </span>
                </div>
              </div>
            ))}

            {/* mobile-only connector so the flow still reads when stacked */}
            <div className="relative mx-auto h-10 w-px bg-line lg:hidden">
              <span className="fx-dot-y absolute left-1/2 h-[5px] w-[5px] -translate-x-1/2 rounded-full bg-cyan" />
            </div>
          </div>
        </div>

        {/* the shared bus */}
        <div className="mt-14 hidden lg:block">
          <div className="relative h-px w-full overflow-hidden bg-line">
            {[0, 1, 2, 3, 4].map((i) => (
              <span
                key={i}
                style={v({
                  left: `${i * 7}%`,
                  "--fx-dur": `${7 + i * 1.4}s`,
                  "--fx-d": `${i * 1.3}s`,
                })}
                className="fx-bus absolute top-1/2 h-[4px] w-[4px] -translate-y-1/2 rounded-full bg-cyan/70"
              />
            ))}
          </div>
          <p className="mt-3 text-center font-data text-[10px] text-faint">
            one bus · one manifest schema · a skill, an MCP tool, an n8n node and
            a shell command are the same object here
          </p>
        </div>
      </div>
    </section>
  );
}
