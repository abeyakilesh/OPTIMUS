"use client";

/**
 * The node palette. Driven by `PALETTE` in the renderer registry, so a new node
 * type appears here by being registered — not by editing this file.
 *
 * ⚠️ Adding nodes by hand is NOT wired yet. The buttons are visibly disabled
 * rather than dragging a node that no kernel event produced: a canvas that lets
 * you place an "Agent" nothing can run is the Atlas failure in miniature.
 */

import { Plus } from "lucide-react";
import { PALETTE, chromeFor } from "@/components/canvas/nodeTypes";

export function LeftRail() {
  return (
    <aside className="ow-rail">
      <button className="ow-rail-add" disabled title="Authoring is not wired yet">
        <Plus size={18} />
        <span>Add Node</span>
      </button>
      <div className="ow-rail-list">
        {PALETTE.map((p) => {
          const { Icon } = chromeFor(p.type);
          return (
            <button key={p.type} className="ow-rail-item" disabled title={`${p.label} — authoring not wired yet`}>
              <Icon size={17} strokeWidth={1.8} />
              <span>{p.label}</span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
