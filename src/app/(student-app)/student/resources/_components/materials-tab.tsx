"use client";

import { FolderOpen } from "lucide-react";

export function MaterialsTab() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-gray-400">
      <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
        <FolderOpen size={28} className="text-gray-400" />
      </div>
      <p className="text-base font-semibold text-gray-500 mb-1">
        준비 중입니다
      </p>
      <p className="text-xs text-gray-400 text-center max-w-[240px]">
        강사가 업로드한 수업 자료를 이곳에서 확인할 수 있습니다
      </p>
    </div>
  );
}
