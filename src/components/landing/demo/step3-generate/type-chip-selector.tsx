"use client";

// Step3 씬(카피 컬럼)용 유형 버튼 셀렉터 — 유형 목록/라벨은 워크벤치 단일 소스
// (QUESTION_TYPE_GROUPS). 버튼을 고르면 우측 라이브 데모가 그 유형의 문제를 생성한다.
// 정적 뱃지와 구분되는 "눌리는 버튼" 어포던스: 흰 배경+그림자+호버 리프트, 선택 전
// 첫 버튼 펄스 + 클릭 유도 문구.
import { MousePointerClick } from "lucide-react";
import { QUESTION_TYPE_GROUPS } from "@/lib/question-type-ui";
import type { DemoQuestionTypeId } from "../fixtures/questions";

export function TypeChipSelector({
  selected,
  onSelect,
  showHeader = true,
}: {
  selected: DemoQuestionTypeId | null;
  onSelect: (id: DemoQuestionTypeId) => void;
  /** PC 씬은 클릭 유도 헤더를 노출. 모바일 시트(스텝 안)는 자체 안내가 있어 숨긴다. */
  showHeader?: boolean;
}) {
  const nothingSelected = selected === null;

  return (
    <div className="space-y-3">
      {/* 클릭 유도 헤더 */}
      {showHeader ? (
        <div className="flex items-center gap-1.5 text-[13px] font-black text-blue-600">
          <MousePointerClick
            className={`size-4 ${nothingSelected ? "motion-safe:animate-bounce" : ""}`}
            aria-hidden="true"
          />
          유형을 클릭하면 오른쪽에서 문제가 바로 생성됩니다
        </div>
      ) : null}

      {QUESTION_TYPE_GROUPS.map((group, groupIndex) => (
        <div key={group.group}>
          <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">
            {group.group}
          </span>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {group.items.map((item, itemIndex) => {
              const active = selected === item.id;
              // 아직 아무것도 안 골랐으면 첫 버튼을 은은히 펄스시켜 클릭을 유도.
              const invite = nothingSelected && groupIndex === 0 && itemIndex === 0;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelect(item.id as DemoQuestionTypeId)}
                  aria-pressed={active}
                  className={`inline-block cursor-pointer rounded-full border px-3 py-1 text-[12.5px] font-bold transition-all duration-150 ${
                    active
                      ? "border-blue-600 bg-blue-600 text-white shadow-md"
                      : "border-slate-200 bg-white text-slate-700 shadow-sm hover:-translate-y-0.5 hover:border-blue-400 hover:text-blue-700 hover:shadow-md"
                  } ${
                    invite
                      ? "ring-2 ring-blue-400/60 motion-safe:animate-pulse"
                      : ""
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
