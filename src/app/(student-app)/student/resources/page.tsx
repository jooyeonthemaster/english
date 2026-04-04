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
    <div className="flex flex-col px-5 pt-2 pb-6 gap-4">
      {/* Tab bar — pill 스타일 */}
      <div className="flex bg-gray-100 rounded-2xl p-1">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              "flex-1 py-2 text-xs font-semibold rounded-xl transition-all duration-200",
              activeTab === tab.key
                ? "bg-white text-black "
                : "text-gray-400",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div>
        {activeTab === "notices" && <NoticesTab />}
        {activeTab === "materials" && <MaterialsTab />}
        {activeTab === "assignments" && <AssignmentsTab />}
        {activeTab === "exams" && <ExamsTab />}
      </div>
    </div>
  );
}
