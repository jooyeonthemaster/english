"use client";

import { useState, type ReactNode } from "react";
import { Sparkles, Wand2 } from "lucide-react";

import { QuestionGenerationIcon } from "@/components/icons/workflow-icons";
import { WorkflowPageTitle } from "@/components/workbench/workflow-page-title";
import { cn } from "@/lib/utils";

import { CustomTypeCreatePanel } from "./custom-type-create-panel";
import { CustomTypeGeneratePanel } from "./custom-type-generate-panel";

type Tab = "create" | "generate";

function TabButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-[13px] font-bold transition-colors",
        active
          ? "border-blue-600 text-blue-700"
          : "border-transparent text-slate-500 hover:text-slate-700",
      )}
    >
      {icon}
      {children}
    </button>
  );
}

export function CustomTypeClient() {
  const [tab, setTab] = useState<Tab>("create");
  const [typesRefreshKey, setTypesRefreshKey] = useState(0);

  return (
    <div className="flex h-[100dvh] min-h-0 flex-col overflow-hidden bg-white md:-m-6">
      <div className="shrink-0 border-b border-slate-200/80 bg-white px-5 py-3">
        <WorkflowPageTitle
          icon={QuestionGenerationIcon}
          title="커스텀 유형"
          description="원본 문항을 분석해 우리 엔진에 없는 유형을 저장하고, 그 유형으로 지문에 동형 문항을 계속 생성합니다."
        />
      </div>

      <div className="flex shrink-0 gap-1 border-b border-slate-200 bg-slate-50 px-4">
        <TabButton
          active={tab === "create"}
          onClick={() => setTab("create")}
          icon={<Wand2 className="size-4" />}
        >
          유형 만들기
        </TabButton>
        <TabButton
          active={tab === "generate"}
          onClick={() => setTab("generate")}
          icon={<Sparkles className="size-4" />}
        >
          유형으로 생성
        </TabButton>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto bg-slate-100/60">
        {tab === "create" ? (
          <CustomTypeCreatePanel
            onCreated={() => {
              setTypesRefreshKey((k) => k + 1);
              setTab("generate");
            }}
          />
        ) : (
          <CustomTypeGeneratePanel typesRefreshKey={typesRefreshKey} />
        )}
      </div>
    </div>
  );
}
