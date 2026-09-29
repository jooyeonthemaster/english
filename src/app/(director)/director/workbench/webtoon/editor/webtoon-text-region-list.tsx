"use client";

import { Plus } from "lucide-react";
import { webtoonTextRoleLabel, type WebtoonTextBox } from "@/lib/webtoon-text/types";

/** 자막 편집기 좌측 — 인식된(편집 가능) 텍스트 목록. */
export function RegionList({
  boxes,
  hoverId,
  selectedId,
  onSelect,
  onHover,
  onAddText,
}: {
  boxes: WebtoonTextBox[];
  hoverId: string | null;
  selectedId?: string | null;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
  onAddText: () => void;
}) {
  return (
    <div>
      <p className="text-[11px] leading-relaxed text-slate-500">
        고치고 싶은 텍스트를 누르면 바로 편집할 수 있어요. 수정한 부분만 새로 그려지고 나머지는
        원본 그대로 유지됩니다.
      </p>
      <button
        type="button"
        onClick={onAddText}
        className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-blue-300 bg-blue-50/50 py-2 text-[12px] font-semibold text-blue-700 transition hover:bg-blue-50"
      >
        <Plus className="size-3.5" /> 새 텍스트 박스 추가
      </button>
      <ul className="mt-3 space-y-1.5">
        {boxes.map((b) => (
          <li key={b.id}>
            <button
              type="button"
              onMouseEnter={() => onHover(b.id)}
              onMouseLeave={() => onHover(null)}
              onClick={() => onSelect(b.id)}
              className={`w-full rounded-lg border px-2.5 py-2 text-left transition ${
                selectedId === b.id
                  ? "border-blue-400 bg-blue-50 ring-1 ring-blue-300"
                  : hoverId === b.id
                    ? "border-blue-300 bg-blue-50/70"
                    : "border-slate-200 bg-white hover:border-slate-300"
              }`}
            >
              <div className="flex items-center gap-1.5">
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
                  {webtoonTextRoleLabel(b.role)}
                </span>
                {b.edited ? (
                  <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
                    수정됨
                  </span>
                ) : null}
              </div>
              <p className="mt-1 line-clamp-2 text-[12px] text-slate-700">{b.text}</p>
              {/* 이미지에 찍힌 원래 글자가 지금 글자와 다르면(깨진 글자 자동 교정·직접 수정·지우기)
                  취소선으로 함께 보여 준다 — 어느 말풍선이 깨져 있었는지 목록에서 바로 보인다. */}
              {!b.added && b.sourceText && b.sourceText !== b.text ? (
                <p className="mt-0.5 line-clamp-1 text-[10.5px] text-slate-400">
                  <span className="sr-only">이미지 원래 글자: </span>
                  <del>{b.sourceText}</del>
                </p>
              ) : null}
            </button>
          </li>
        ))}
        {boxes.length === 0 ? (
          <li className="text-[12px] text-slate-400">편집 가능한 텍스트가 없습니다.</li>
        ) : null}
      </ul>
    </div>
  );
}
