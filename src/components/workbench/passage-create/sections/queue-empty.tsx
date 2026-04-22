"use client";

import { Layers } from "lucide-react";

export function QueueEmpty() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-3">
        <Layers className="w-6 h-6 text-slate-400" />
      </div>
      <h3 className="text-[14px] font-semibold text-slate-600 mb-1">
        등록된 지문이 없습니다
      </h3>
      <p className="text-[12px] text-slate-400 max-w-sm">
        위에서 지문을 등록하면 여기에 카드로 표시됩니다.
        AI 분석은 백그라운드에서 자동으로 진행됩니다.
      </p>
    </div>
  );
}
