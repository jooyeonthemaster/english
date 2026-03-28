"use client";

import { FolderOpen } from "lucide-react";

export function MaterialsTab() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-[var(--erp-text-muted)]">
      <div className="w-16 h-16 rounded-full bg-[var(--erp-border-light)] flex items-center justify-center mb-4">
        <FolderOpen size={28} className="text-[var(--erp-text-muted)]" />
      </div>
      <p className="text-[var(--fs-base)] font-semibold text-[var(--erp-text-secondary)] mb-1">
        준비 중입니다
      </p>
      <p className="text-[var(--fs-xs)] text-[var(--erp-text-muted)] text-center max-w-[240px]">
        강사가 업로드한 수업 자료를 이곳에서 확인할 수 있습니다
      </p>
    </div>
  );
}
