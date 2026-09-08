"use client";

// ============================================================================
// 「지문 추가」 런처 — 지문 목록 툴바(정렬·검색 옆) 상주 (26-09-01 사용자 지시)
//
// 구 위치는 소스 스위처의 sticky 우측 클러스터(U11-7)였다 — "이 지문 추가 기능은
// [정렬·검색] 옆으로 보내줘" 지시로 목록 툴바로 이사했다. 팝오버 3방법(기출/직접
// 입력/파일 업로드)과 집중 모드 진입 채널(onSelectIntake)은 원형 그대로다.
//
// · INTAKE_METHODS 는 source-switcher 의 export 를 그대로 쓴다(단일 소스 —
//   집중 모드 방법 필과 이 팝오버가 같은 정의를 공유해야 라벨이 못 갈린다).
// · data-tour="add-passage" 는 버튼을 따라왔다 — E26 투어는 앵커 **속성**으로
//   버튼을 찾으므로 위치 이동에 무사하다(라벨·속성 자구 불변).
// · PassageCardGrid 의 toolbarAction(additive) 슬롯으로 주입된다 — 그리드는
//   memo 가 아니고(실측 기각 이력) 이 컴포넌트도 참조 안정 프롭(useCallback
//   handleSelectIntake)만 받으므로 렌더 비용 무해.
// ============================================================================

import { useState } from "react";
import { Plus } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { INTAKE_METHODS, type IntakeMethodKey } from "./source-switcher";

export function AddPassageLauncher({
  onSelectIntake,
}: {
  onSelectIntake: (k: IntakeMethodKey) => void;
}) {
  const [open, setOpen] = useState(false);

  // 팝오버 항목 클릭 — 닫고 집중 모드 진입(호스트가 뷰·탭 전환을 소유).
  const pick = (k: IntakeMethodKey) => {
    setOpen(false);
    onSelectIntake(k);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-tour="add-passage"
          title="지문 추가 — 기출 지문·직접 입력·파일 업로드"
          aria-label="지문 추가 — 기출 지문·직접 입력·파일 업로드"
          className="inline-flex h-7 shrink-0 cursor-pointer items-center gap-1 whitespace-nowrap rounded-md bg-blue-600 px-2.5 text-[12px] font-bold text-white shadow-sm transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          지문 추가
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={6}
        className="w-72 border-slate-200 bg-white p-1.5 shadow-lg"
      >
        <p className="px-2 pb-1 pt-1.5 text-[10.5px] font-bold uppercase tracking-wider text-slate-400">
          어떻게 추가할까요?
        </p>
        {INTAKE_METHODS.map(({ key, label, desc, Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => pick(key)}
            className="flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2 py-2 text-left transition-colors hover:bg-blue-50/60"
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-blue-100 bg-blue-50 text-blue-600">
              <Icon className="h-4 w-4" aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="block text-[12.5px] font-bold text-slate-800">
                {label}
              </span>
              {/* truncate 금지(26-09-01 무절단 원칙) — 설명이 "…추출합…"으로
                  잘리던 구 스위처 팝오버의 실측 결함. 2줄까지 자연 줄바꿈. */}
              <span className="block break-keep text-[11px] leading-snug text-slate-400 line-clamp-2">
                {desc}
              </span>
            </span>
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
