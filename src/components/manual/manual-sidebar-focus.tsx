"use client";

import { useEffect } from "react";
import { useSidebarFocus } from "@/components/layout/sidebar-focus-context";

export function ManualSidebarFocus({ children }: { children: React.ReactNode }) {
  const { setCollapseRequested } = useSidebarFocus();

  useEffect(() => {
    setCollapseRequested(true);
    return () => setCollapseRequested(false);
  }, [setCollapseRequested]);

  return <>{children}</>;
}
