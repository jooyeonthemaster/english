"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { NoticesTab } from "./_components/notices-tab";
import { AssignmentsTab } from "./_components/assignments-tab";
import { MaterialsTab } from "./_components/materials-tab";
import { ExamsTab } from "./_components/exams-tab";

// ---------------------------------------------------------------------------
// Tab config
// ---------------------------------------------------------------------------
const TABS = [
  { key: "notices", label: "공지" },
  { key: "materials", label: "수업자료" },
  { key: "assignments", label: "숙제" },
  { key: "exams", label: "시험" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function ResourcesPage() {
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get("tab") as TabKey) || "notices";
  const [activeTab, setActiveTab] = useState<TabKey>(initialTab);

  useEffect(() => {
    const tab = searchParams.get("tab") as TabKey;
    if (tab && TABS.some((t) => t.key === tab)) {
      setActiveTab(tab);
    }
  }, [searchParams]);

  return (
    <div className="flex flex-col h-full">
      {/* Tab bar */}
      <div className="sticky top-[var(--header-h)] z-20 bg-[var(--erp-surface)] border-b border-[var(--erp-border-light)] px-[var(--sp-3)]">
        <div className="flex">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                "flex-1 py-2.5 text-[var(--fs-sm)] font-medium transition-colors relative",
                activeTab === tab.key
                  ? "text-[var(--erp-primary)] font-semibold"
                  : "text-[var(--erp-text-muted)]",
              )}
            >
              {tab.label}
              {activeTab === tab.key && (
                <span className="absolute bottom-0 left-1/4 right-1/4 h-[2px] rounded-full bg-[var(--erp-primary)]" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 px-[var(--sp-3)] pt-[var(--pt-page)] pb-[var(--pb-page)]">
        {activeTab === "notices" && <NoticesTab />}
        {activeTab === "materials" && <MaterialsTab />}
        {activeTab === "assignments" && <AssignmentsTab />}
        {activeTab === "exams" && <ExamsTab />}
      </div>
    </div>
  );
}
