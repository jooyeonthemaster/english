"use client";

import { ClipboardList, Plus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WorkflowPageTitle } from "@/components/workbench/workflow-page-title";

export function HubHeader({
  onAddStudent,
  onBulkImport,
}: {
  onAddStudent: () => void;
  onBulkImport: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <WorkflowPageTitle
        icon={Users}
        title="튜터 운영 홈"
        description="학생 등록·반 편성·학생 코드·기기·원비를 한 화면에서 관리합니다."
      />
      <div className="flex shrink-0 items-center gap-2">
        <Button
          onClick={onBulkImport}
          variant="outline"
          className="h-9 rounded-lg border-[#E5E8EB] text-sm font-bold text-[#4E5968] hover:bg-[#F7F8FA]"
        >
          <ClipboardList className="size-4" />
          대량 등록
        </Button>
        <Button
          onClick={onAddStudent}
          className="h-9 rounded-lg bg-blue-600 text-sm font-bold text-white hover:bg-blue-700"
        >
          <Plus className="size-4" />
          학생 등록
        </Button>
      </div>
    </div>
  );
}
