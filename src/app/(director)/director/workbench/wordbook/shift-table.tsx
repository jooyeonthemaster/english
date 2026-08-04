"use client";

// 뜻이 달라진 단어 테이블 — sense-table 의 shift 모드 분리체(500줄 규약).
// 마키(영역 드래그 담기)는 부모의 DragSelect 가 담당 — 행에 data-drag-item-id 만 단다.

import type { MouseEvent as ReactMouseEvent } from "react";
import { MoveRight } from "lucide-react";
import { PosChip } from "./wordbook-ui";
import { BasketButton, ShareCell, TH, shiftItem } from "./table-bits";
import type { WordbookBasketItem, WordbookShiftRow } from "./wordbook-types";

interface ShiftTableProps {
  shiftRows: WordbookShiftRow[];
  shiftAxis: "era" | "grade";
  loading: boolean;
  selectedLemmaId: string | null;
  basketSenseIds: ReadonlySet<string>;
  addTitle: string;
  removeTitle: string;
  onRowClick: (lemmaId: string) => void;
  onBasketClick: (
    e: ReactMouseEvent,
    index: number,
    item: WordbookBasketItem,
  ) => void;
}

export function ShiftTable({
  shiftRows,
  shiftAxis,
  loading,
  selectedLemmaId,
  basketSenseIds,
  addTitle,
  removeTitle,
  onRowClick,
  onBasketClick,
}: ShiftTableProps) {
  const axisA = shiftAxis === "era" ? "2003~2015" : "고1";
  const axisB = shiftAxis === "era" ? "2016~2027" : "고3";
  const josa = shiftAxis === "era" ? "에" : "에서";

  return (
    <table className="w-full min-w-[860px] border-collapse text-[12.5px]">
      <thead className="sticky top-0 z-10 bg-white shadow-[inset_0_-1px_0_theme(colors.slate.200)]">
        <tr>
          <th className={`${TH} w-9`}>
            <span className="sr-only">담기</span>
          </th>
          <th className={TH}>단어</th>
          <th className={`${TH} w-16`}>품사</th>
          <th className={TH}>{axisA}{josa} 주로 쓰인 뜻</th>
          <th className={`${TH} w-8`} aria-hidden="true" />
          <th className={TH}>{axisB}{josa} 주로 쓰인 뜻</th>
          <th className={`${TH} w-24`} title="양쪽에서 수집한 예문 개수">표본</th>
        </tr>
      </thead>
      <tbody>
        {loading
          ? // 찾기 질의는 전량 집계라 체감이 느리다 — 스켈레톤으로 자리를 지킨다
            Array.from({ length: 6 }).map((_, i) => (
              <tr key={i} className="border-b border-slate-100">
                <td className="py-2.5 pl-2">
                  <div className="size-6 animate-pulse rounded-full bg-slate-100" />
                </td>
                {(["w-16", "w-10", "w-32", "", "w-32", "ml-auto w-10"] as const).map((w, j) => (
                  <td key={j} className="px-2">
                    {w ? <div className={`h-3 animate-pulse rounded bg-slate-100 ${w}`} /> : null}
                  </td>
                ))}
              </tr>
            ))
          : shiftRows.map((r, i) => {
              const inBasket = basketSenseIds.has(r.bSenseId);
              const selected = selectedLemmaId === r.lemmaId;
              return (
                <tr
                  key={r.lemmaId}
                  data-drag-item-id={r.bSenseId}
                  onClick={() => onRowClick(r.lemmaId)}
                  // 배경 우선순위: 도시에 선택 > 담김 > hover
                  className={`cursor-pointer border-b border-slate-100 ${
                    selected ? "bg-blue-50/70" : inBasket ? "bg-blue-50/40" : "hover:bg-slate-50"
                  }`}
                >
                  <td className="py-2 pl-2 pr-1">
                    {/* 담는 대상은 B축(지금 시험에 나오는 뜻) — 그게 학습 가치다 */}
                    <BasketButton
                      active={inBasket}
                      title={inBasket ? removeTitle : addTitle}
                      onClick={(e) => onBasketClick(e, i, shiftItem(r))}
                    />
                  </td>
                  <td className="whitespace-nowrap px-2 font-semibold text-slate-900">
                    {r.lemma}
                  </td>
                  <td className="px-2">
                    <PosChip pos={r.pos} />
                  </td>
                  <td className="max-w-[220px] px-2 py-2">
                    <ShareCell senseKo={r.aSenseKo} share={r.aShare} fill="bg-slate-400" />
                  </td>
                  <td className="px-1 text-center">
                    <MoveRight className="mx-auto size-3.5 text-slate-300" />
                  </td>
                  <td className="max-w-[220px] px-2 py-2">
                    <ShareCell senseKo={r.bSenseKo} share={r.bShare} fill="bg-blue-500" />
                  </td>
                  <td
                    className="px-2 text-right tabular-nums text-slate-500"
                    title={`${axisA} 예문 ${r.aTotal}개 · ${axisB} 예문 ${r.bTotal}개`}
                  >
                    {r.aTotal}·{r.bTotal}
                  </td>
                </tr>
              );
            })}
        {!loading && shiftRows.length === 0 ? (
          <tr>
            <td colSpan={7} className="py-20">
              <div className="sticky left-0 max-w-[100vw] text-center">
                <p className="text-[13px] font-medium text-slate-600">
                  뜻이 달라진 단어를 찾지 못했습니다
                </p>
              </div>
            </td>
          </tr>
        ) : null}
      </tbody>
    </table>
  );
}
