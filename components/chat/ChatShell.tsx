"use client";

import { useRef, useState } from "react";
import SignOutButton from "@/components/auth/SignOutButton";
import MissionSidebar, { type MissionSidebarHandle } from "@/components/chat/MissionSidebar";
import ChatPanel from "@/components/chat/ChatPanel";

export default function ChatShell() {
  // Two separate ids, on purpose. `loadMissionId` says "fetch and render
  // THIS mission from the server" — it only changes when the user
  // explicitly clicks a sidebar row or "+ New chat", and it's what
  // ChatPanel remounts on. `highlightId` is purely which sidebar row looks
  // selected. A freshly-sent message's own mission updates `highlightId`
  // (so its row lights up) but NOT `loadMissionId` — the panel already has
  // the real answer from its own POST response; forcing a remount would
  // throw that away and refetch the same thing from disk for no reason
  // (found via a genuinely failing e2e test, not by inspection).
  const [loadMissionId, setLoadMissionId] = useState<string | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const sidebarRef = useRef<MissionSidebarHandle>(null);

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <div className="flex flex-1 overflow-hidden">
        <MissionSidebar
          ref={sidebarRef}
          activeMissionId={highlightId}
          onSelect={(id) => {
            setLoadMissionId(id);
            setHighlightId(id);
          }}
        />
        <div className="flex-1 overflow-hidden">
          <ChatPanel
            key={loadMissionId ?? "new"}
            missionId={loadMissionId}
            onMissionCreated={(id) => {
              setHighlightId(id);
              sidebarRef.current?.refresh();
            }}
          />
        </div>
      </div>
    </div>
  );
}
