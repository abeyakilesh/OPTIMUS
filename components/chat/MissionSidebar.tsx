"use client";

import { useEffect, useState, useCallback, useImperativeHandle, forwardRef } from "react";

export interface MissionSummary {
  id: string;
  objective: string;
  status: "proposed" | "running" | "green" | "red" | "rolled-back";
  startedAt: number;
}

export interface MissionSidebarHandle {
  refresh: () => void;
}

function StatusDot({ status }: { status: MissionSummary["status"] }) {
  if (status === "green") return <span className="h-2 w-2 shrink-0 rounded-full bg-pass" />;
  if (status === "running" || status === "proposed") {
    return <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-run" />;
  }
  return <span className="h-2 w-2 shrink-0 rounded-full border border-ink/50" />;
}

function relativeTime(ms: number): string {
  const diff = Date.now() - ms;
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

interface Props {
  activeMissionId: string | null;
  onSelect: (id: string | null) => void;
}

const MissionSidebar = forwardRef<MissionSidebarHandle, Props>(function MissionSidebar(
  { activeMissionId, onSelect },
  ref,
) {
  const [missions, setMissions] = useState<MissionSummary[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/missions");
      const data = await res.json();
      if (data.ok) setMissions(data.missions);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useImperativeHandle(ref, () => ({ refresh: load }), [load]);

  return (
    <aside className="flex h-full w-[260px] shrink-0 flex-col border-r border-line bg-mist/60">
      <div className="p-3">
        <button
          onClick={() => onSelect(null)}
          className="w-full rounded-lg border border-line-2 bg-white px-3 py-2 text-left text-[13px] font-medium text-ink transition hover:border-ink/30"
        >
          + New chat
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-3">
        <p className="label px-2 py-1.5 text-faint">History</p>

        {loaded && missions.length === 0 && (
          <p className="px-2 py-2 text-[12px] text-faint">No missions yet — ask something.</p>
        )}

        <ul className="space-y-0.5">
          {missions.map((m) => (
            <li key={m.id}>
              <button
                onClick={() => onSelect(m.id)}
                className={`flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-[12.5px] transition ${
                  activeMissionId === m.id ? "bg-white text-ink" : "text-body hover:bg-white/70 hover:text-ink"
                }`}
              >
                <StatusDot status={m.status} />
                <span className="min-w-0 flex-1 truncate">{m.objective}</span>
              </button>
              <p className="px-2 pb-1 text-[10.5px] text-faint">{relativeTime(m.startedAt)}</p>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
});

export default MissionSidebar;
