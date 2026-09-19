"use client";

import type { ReactNode } from "react";
import { AppSidebar } from "./AppSidebar";
import "./app-shell.css";

/** Every signed-in page sits inside this. One nav, one flow. */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="app-root">
      <AppSidebar />
      <div className="app-content">{children}</div>
    </div>
  );
}
