"use client";

// ============================================================================
// 지문 세트 상세 모달 — 일반 문제 상세(QuestionDetailDialog)와 동일한 셸/2열 구조.
// 왼쪽=변형 없는 원본 공유 지문 1회. 오른쪽=멤버 탭(1번/2번…)으로 한 문항씩 —
// 리스트 카드와 동일하게 일반 문항 카드(QuestionBankCard, embedded)로 렌더(발문 위에 세트 전 멤버 변형을 병합한
// 지문 표시) + 멤버 단위 검수/수정/분리 액션 바.
// ============================================================================

import { useState } from "react";
import { CheckCircle2, Loader2, Pencil, Scissors, Trash2, X } from "lucide-react";

import { formatDateTime } from "@/lib/utils";
import { InteractivePassageView } from "@/components/workbench/interactive-passage-view";
import { QuestionBankCard } from "@/components/workbench/question-bank-card";
import { memberToBankItem } from "@/components/workbench/question-set-card";
import { reconstructPassageView } from "@/lib/question-sets/reconstruct";
import type { Anchor } from "@/lib/question-sets/types";
import type { QuestionSetForRender } from "@/actions/question-sets";

export function SetDetailDialog({
  open,
  set,
  splittingIds,
  onClose,
  onDeleteSet,
  onSplitMember,
  onApproveMember,
  onUnapproveMember,
  onEditMember,
}: {
  open: boolean;
  set: QuestionSetForRender | null;
  /** 분리 진행 중인 멤버 questionId 집합(스피너/중복 방지). */
  splittingIds?: Set<string>;
  onClose: () => void;
  onDeleteSet: () => void;
  onSplitMember: (questionId: string) => void;
  onApproveMember: (questionId: string) => void;
  onUnapproveMember: (questionId: string) => void;
  onEditMember: (questionId: string) => void;
}) {
  // 멤버 토글 — 선택한 멤버 인덱스(기본 1번). 한 번에 한 문항만 본다.
  const [activeTab, setActiveTab] = useState(0);
  if (!open || !set) return null;

  const members = set.members;
  // 분리/삭제로 멤버 수가 줄면 인덱스가 범위를 벗어날 수 있어 클램프.
  const safeTab = Math.min(Math.max(activeTab, 0), members.length - 1);
  const visibleMembers = [members[safeTab]];

  // 세트 전 멤버 변형(밑줄·빈칸·마커)을 하나로 병합한 지문 — 리스트 카드와 동일 레시피.
  // 각 멤버 발문 위에 표시된다(QuestionBankCard 가 유니버설 렌더러로 그림, 비구조형만). 왼쪽 패널은
  // 변형 없는 원본(canonicalPassage) 그대로 유지.
  const mergedPassage = reconstructPassageView(
    set.layout?.fullPassage ?? set.canonicalPassage,
    members.flatMap((m) => (Array.isArray(m.spans) ? m.spans : [])) as Anchor[],
  ).text;

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div className="relative z-10 mx-4 my-4 flex w-full max-w-[1680px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        {/* 헤더 — 일반 상세 모달과 동일 톤 */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 px-6 py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <h2 className="text-[15px] font-bold text-slate-800">세트 상세</h2>
            <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-blue-600">
              {set.setLabel || "지문 세트"} · {members.length}문항
            </span>
            <span className="text-[12px] font-medium tabular-nums text-slate-400">
              {formatDateTime(set.createdAt)}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={onDeleteSet}
              title="세트 삭제"
              aria-label="세트 삭제"
              className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md border border-red-200 bg-white text-[11px] font-semibold text-red-600 shadow-none transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-700"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={onClose}
              className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
              aria-label="닫기"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* 본문 — 일반 상세 모달과 동일 2열(왼쪽 지문 / 오른쪽 문제) */}
        <div className="grid flex-1 grid-cols-1 overflow-hidden lg:grid-cols-2">
          <div className="overflow-y-auto border-b border-slate-200 lg:border-b-0 lg:border-r">
            {set.canonicalPassage ? (
              <div className="px-6 py-5">
                <InteractivePassageView
                  content={set.canonicalPassage}
                  analysisData={null}
                  layout="vertical"
                />
              </div>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-slate-400">
                지문 없음
              </div>
            )}
          </div>

          <div className="relative flex flex-col overflow-hidden">
            {/* 멤버 토글 — 전체 / 1번 / 2번 … (여백에 단 탭) */}
            <div className="flex shrink-0 items-center gap-1 border-b border-slate-100 px-4 py-2">
              <span className="mr-1 text-[11px] font-semibold text-slate-400">
                문항 보기
              </span>
              {members.map((m, i) => (
                <button
                  key={m.itemId}
                  type="button"
                  onClick={() => setActiveTab(i)}
                  className={`rounded-md px-2.5 py-1 text-[12px] font-semibold tabular-nums transition-colors ${
                    safeTab === i
                      ? "bg-blue-50 text-blue-700"
                      : "text-slate-500 hover:bg-slate-50 hover:text-slate-700"
                  }`}
                >
                  {i + 1}번
                </button>
              ))}
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
              {visibleMembers.map((m) => {
                const memberIndex = members.indexOf(m);
                const splitting = splittingIds?.has(m.questionId) ?? false;
                return (
                  <div key={m.itemId} className="space-y-1.5">
                    {/* 액션 바 — 멤버 번호/난이도는 QuestionBankCard(embedded) 본문이 표시하므로
                        여기선 검수/수정/분리 버튼만(번호 중복 방지). */}
                    <div className="flex items-center gap-2">
                      <span className="flex-1" />
                      {/* 검수 토글 — 일반 카드와 동일 동작(멤버 단위 승인/취소). */}
                      <button
                        type="button"
                        onClick={() =>
                          m.approved
                            ? onUnapproveMember(m.questionId)
                            : onApproveMember(m.questionId)
                        }
                        title={
                          m.approved
                            ? "검수완료 — 누르면 검수필요로 되돌립니다"
                            : "검수필요 — 누르면 검수완료로 표시합니다"
                        }
                        className={
                          "flex h-6 shrink-0 items-center gap-1 rounded-md border bg-white px-1.5 text-[10.5px] font-semibold transition-colors " +
                          (m.approved
                            ? "border-emerald-500 text-emerald-600 hover:bg-emerald-50"
                            : "border-red-200 text-red-400 hover:border-emerald-500 hover:bg-emerald-50 hover:text-emerald-600")
                        }
                      >
                        <CheckCircle2 className="h-3 w-3" />
                        {m.approved ? "검수완료" : "미검수"}
                      </button>
                      <button
                        type="button"
                        onClick={() => onEditMember(m.questionId)}
                        title="이 문항을 편집합니다"
                        className="flex h-6 shrink-0 items-center gap-1 rounded-md border border-slate-200 bg-white px-1.5 text-[10.5px] font-semibold text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-800"
                      >
                        <Pencil className="h-3 w-3" />
                        수정하기
                      </button>
                      <button
                        type="button"
                        disabled={splitting}
                        onClick={() => onSplitMember(m.questionId)}
                        title="이 문항의 복제본을 단독 문항으로 추가합니다(세트는 그대로)"
                        aria-label="분리"
                        className="flex size-6 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-[10.5px] font-semibold text-slate-500 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {splitting ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Scissors className="h-3 w-3" />
                        )}
                      </button>
                    </div>
                    {/* 멤버 본문 — 리스트 카드와 동일하게 일반 문항 카드(QuestionBankCard)로 렌더.
                        모달은 embedded(체크박스·별·상단삭제·푸터 숨김) + 발문 위 병합 변형 지문.
                        검수/수정/분리는 위 액션 바가 담당. 구조형은 questionText 에 지문이 있어 병합 제외. */}
                    <QuestionBankCard
                      q={memberToBankItem(m, set)}
                      num={memberIndex + 1}
                      selected={false}
                      onToggle={() => {}}
                      embedded
                      showStar={false}
                      enableDrag={false}
                      mergedPassage={m.isStructural ? undefined : mergedPassage}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
