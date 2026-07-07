"use client";

// ============================================================================
// 학생 시험 리포트 — 리포트 에디터 PC/모바일 미리보기 토글
//
// value 'mobile' 일 때 상위(report-editor)가 문서 컨테이너를 max-w-[420px] 로
// 좁혀 모바일 뷰포트를 근사한다. 여기서는 순수 세그먼트 토글만 담당.
// 인쇄와는 완전히 무관 — PDF 저장은 화면 프리뷰가 아니라 body 직속 인쇄 포털
// (report-print-portal)의 클린 view 문서를 출력하므로 토글 상태가 산출물에
// 영향을 주지 않는다.
// ============================================================================

import { Monitor, Smartphone } from "lucide-react";
import { cn } from "@/lib/utils";

export type PreviewDevice = "pc" | "mobile";

interface DevicePreviewToggleProps {
  value: PreviewDevice;
  onChange: (device: PreviewDevice) => void;
}

const OPTIONS: { key: PreviewDevice; label: string; Icon: typeof Monitor }[] = [
  { key: "pc", label: "PC", Icon: Monitor },
  { key: "mobile", label: "모바일", Icon: Smartphone },
];

export function DevicePreviewToggle({ value, onChange }: DevicePreviewToggleProps) {
  return (
    <div
      role="group"
      aria-label="미리보기 기기"
      className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-50 p-0.5"
    >
      {OPTIONS.map(({ key, label, Icon }) => {
        const active = value === key;
        return (
          <button
            key={key}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(key)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
              active
                ? "bg-white text-blue-600 shadow-sm ring-1 ring-slate-200"
                : "text-slate-500 hover:text-slate-700",
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        );
      })}
    </div>
  );
}
