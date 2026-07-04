"use client";

// ============================================================================
// 지문 세트 — set card renderer (문제관리 QuestionBankCard 와 레이아웃 통일)
// ============================================================================
// 공유 지문을 헤더의 '지문' 토글로 한 번만 펼치고, 그 아래 멤버 문항을 차례로 —
// CSAT 43~45 레이아웃. 카드 셸·헤더 지문 토글·접힘 미리보기(CollapsedPreview)·
// 보기 배지·해설(ExplanationSection)·푸터는 모두 일반 관리 카드의 부품/클래스를
// 그대로 재사용해, 같은 목록에서 한 묶음처럼 보인다. 세트 전용은 '세트' 배지 +
// 멤버 번호 + 분리/확대뿐.
// ============================================================================

import { useMemo, useState } from "react";
import { Loader2, Scissors } from "lucide-react";

import { isKoQuestionType } from "@/lib/korean/registry";
import { buildKoSetSharedPassage } from "@/lib/korean/sets/paper";
import { buildQuestionSetMergedPassage } from "@/lib/question-sets/render";
import { isStructuralType } from "@/lib/question-sets/types";
import { Badge } from "@/components/ui/badge";
import {
  QuestionBankCard,
  type QuestionBankItem,
} from "@/components/workbench/question-bank-card";
import type {
  QuestionSetForRender,
  QuestionSetMember,
} from "@/actions/question-sets";

/** 세트 멤버 → 일반 카드(QuestionBankCard)가 받는 QuestionBankItem 형태로 변환.
 *  세트 카드/상세 모달이 모두 이 함수로 멤버를 "일반 문항 카드"로 렌더한다(구조 완전 통일). */
export function memberToBankItem(
  member: QuestionSetMember,
  set: QuestionSetForRender,
): QuestionBankItem {
  return {
    id: member.questionId,
    type: "MULTIPLE_CHOICE",
    subType: member.typeId,
    questionText: member.questionText,
    // options 는 parseJson 된 unknown(보통 배열)·null — 문자열로 정규화해 안전 전달.
    options:
      member.options == null
        ? null
        : typeof member.options === "string"
          ? member.options
          : JSON.stringify(member.options),
    correctAnswer: member.correctAnswer,
    difficulty: member.difficulty,
    tags: null,
    aiGenerated: true,
    approved: member.approved,
    starred: false,
    inSet: true,
    setId: set.id,
    createdAt: set.createdAt,
    passage:
      set.passageId && set.passageTitle != null
        ? {
            id: set.passageId,
            title: set.passageTitle,
            content: set.canonicalPassage,
          }
        : null,
    explanation: member.explanation,
    _count: { examLinks: 0 },
    structuredData: member.structuredData,
  } as QuestionBankItem;
}

/** 세트 병합 변형 지문 — 전 멤버 anchor 를 base 에 얹어 한 번만 재구성(리스트/모달 공유 레시피). */
export function buildSetMergedPassage(set: QuestionSetForRender): string {
  return buildQuestionSetMergedPassage(set);
}

export function QuestionSetCard({
  set,
  onSplitMember,
  onOpenDetail,
  onDelete,
  recentlyViewed = false,
  selected = false,
  onToggleSelect,
  onApproveMember,
  onUnapproveMember,
  onEditMember,
}: {
  set: QuestionSetForRender;
  /** 멤버 분리 — 활성 문항의 복제본을 단독 문항으로 추가. 미지정 시 분리 버튼 숨김. */
  onSplitMember?: (questionId: string) => void | Promise<void>;
  /** 상세 — 지정 시 푸터 상세 아이콘 노출(세트 상세 모달). */
  onOpenDetail?: () => void;
  /** 세트 삭제(멤버 일괄). 미지정 시 버튼 숨김. */
  onDelete?: () => void | Promise<void>;
  /** 방금 상세를 열어봤다가 닫은 세트 카드 — 한 번 배경이 반짝인다. */
  recentlyViewed?: boolean;
  /** 선택 상태 — 세트 = 멤버 문항 전체가 선택됐는가(일반 카드 체크박스와 동일). */
  selected?: boolean;
  /** 선택 토글 — 세트의 멤버 문항 전체를 선택/해제. 미지정 시 체크박스 숨김. */
  onToggleSelect?: () => void;
  /** 활성(선택 탭) 멤버 검수 — 일반 카드 검수 버튼에 배선(멤버 단위). */
  onApproveMember?: (questionId: string) => void | Promise<void>;
  onUnapproveMember?: (questionId: string) => void | Promise<void>;
  /** 활성 멤버 수정 — 일반 카드 '수정하기'에 배선. */
  onEditMember?: (questionId: string) => void;
}) {
  const [splittingId, setSplittingId] = useState<string | null>(null);
  // 멤버 탭 — 상세 모달과 동일하게 한 번에 한 문항만 본다(기본 1번). 2·3번은 탭으로 전환.
  const [activeTab, setActiveTab] = useState(0);

  const handleSplitMember = onSplitMember
    ? async (questionId: string) => {
        if (splittingId) return;
        setSplittingId(questionId);
        try {
          await onSplitMember(questionId);
        } finally {
          setSplittingId(null);
        }
      }
    : undefined;

  // 멤버 anchor 를 모두 병합해 공유 지문을 한 번만 재구성.
  // 국어(KO) 세트는 anchor(_spans) 모델이 아니라 멤버 structuredData 의 KO 마커
  // (㉠·ⓐ·[A])를 병합 오버레이하는 모델 — 시험지 공유지문(buildKoSetSharedPassage)
  // 과 동일한 지문을 카드에도 그린다. 영어 세트는 codex 렌더 정합 경로(buildSetMergedPassage).
  const mergedPassage = useMemo(() => {
    if (
      set.members.length > 0 &&
      set.members.every((m) => isKoQuestionType(m.typeId))
    ) {
      const base = set.layout?.fullPassage ?? set.canonicalPassage;
      return buildKoSetSharedPassage(
        base,
        set.members.map((m) => m.structuredData),
      );
    }
    return buildSetMergedPassage(set);
  }, [set]);

  // 분리/삭제로 멤버 수가 줄면 인덱스가 범위를 벗어날 수 있어 클램프(모달과 동일).
  const safeTab = Math.min(
    Math.max(activeTab, 0),
    Math.max(set.members.length - 1, 0),
  );
  const activeMember = set.members[safeTab];
  if (!activeMember) return null;

  // 활성 멤버를 "일반 문항 카드(QuestionBankCard)" 그대로 렌더 — 체크박스·별·난이도/플랜 배지·
  // 생성된 시험 수·해설·검수/수정 푸터까지 전부 일반 카드와 동일하게 나온다. 세트 전용은
  // headerExtra(세트 배지·문항 탭·분리)와 병합 변형 지문(mergedPassage)뿐.
  const memberItem = memberToBankItem(activeMember, set);
  // 구조형(글의 순서/문장 삽입)은 questionText 에 표시 지문이 이미 있어 병합 지문 제외(중복 방지).
  const structural =
    activeMember.isStructural || isStructuralType(activeMember.typeId || "");
  const activeMergedPassage = structural ? undefined : mergedPassage;
  const splitting = splittingId === activeMember.questionId;

  // 멤버 분리 버튼 — PC(lg 이상)는 헤더 부가 행(headerExtra) 우측에, 모바일(<lg)은
  // 헤더 배지 그룹(headerBadgeExtra)의 '일반' 배지 오른쪽에 노출한다. 두 위치에 각각
  // 반응형 래퍼로 하나만 보이게 하므로 실제로는 한 번만 렌더된다.
  const renderSplitButton = () =>
    handleSplitMember ? (
      <button
        type="button"
        data-drag-select-ignore
        disabled={splitting}
        title="이 문항의 복제본을 단독 문항으로 추가합니다(세트는 그대로)"
        onClick={(e) => {
          e.stopPropagation();
          void handleSplitMember(activeMember.questionId);
        }}
        className="flex h-6 shrink-0 items-center gap-1 rounded-md border border-slate-200 bg-white px-1.5 text-[10.5px] font-semibold text-slate-500 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {splitting ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <Scissors className="h-3 w-3" />
        )}
        분리
      </button>
    ) : null;

  // 세트 배지 — PC는 헤더 아래 부가 행(headerExtra)에, 모바일은 발문 뒤 인라인
  // (promptInlineBadge)으로 이어붙여 "한 문장"처럼 보이게 한다.
  const setBadgeNode = (
    <Badge
      variant="outline"
      className="shrink-0 gap-1 border-blue-200 bg-blue-50 text-[10px] font-bold text-blue-600"
    >
      세트 · {set.members.length}문항
    </Badge>
  );

  const headerExtra = (
    <>
      {/* PC 전용 — 모바일은 발문 뒤 인라인 배지로 대체(max-lg:hidden). */}
      <span className="contents max-lg:hidden">{setBadgeNode}</span>
      {set.members.length > 1 && (
        <span className="flex flex-wrap items-center gap-1">
          <span className="mr-0.5 shrink-0 text-[11px] font-semibold text-slate-400">
            문항
          </span>
          {set.members.map((m, i) => (
            <button
              key={m.itemId}
              type="button"
              data-drag-select-ignore
              onClick={(e) => {
                e.stopPropagation();
                setActiveTab(i);
              }}
              className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] font-semibold tabular-nums transition-colors ${
                safeTab === i
                  ? "bg-blue-50 text-blue-700"
                  : "text-slate-500 hover:bg-slate-50 hover:text-slate-700"
              }`}
            >
              {i + 1}번
            </button>
          ))}
        </span>
      )}
      {handleSplitMember && (
        // PC 전용 위치 — 부가 행 우측 끝(ml-auto). 모바일에서는 숨기고 headerBadgeExtra로 이동.
        <span className="ml-auto hidden items-center lg:inline-flex">
          {renderSplitButton()}
        </span>
      )}
    </>
  );

  // 모바일(<lg) 전용 — 헤더 '일반' 배지 오른쪽에 분리 버튼을 노출한다. PC에서는 숨긴다.
  const headerBadgeExtra = handleSplitMember ? (
    <span className="inline-flex items-center lg:hidden">
      {renderSplitButton()}
    </span>
  ) : undefined;

  return (
    <QuestionBankCard
      q={memberItem}
      num={safeTab + 1}
      selected={selected}
      onToggle={onToggleSelect ?? (() => {})}
      hideCheckbox={!onToggleSelect}
      suppressDragItem
      mergedPassage={activeMergedPassage}
      headerExtra={headerExtra}
      // 모바일 발문 뒤 인라인 세트 배지 — CollapsedPreview가 lg:hidden으로 감싸 모바일만 노출.
      promptInlineBadge={setBadgeNode}
      // 단일 문항 세트는 모바일에서 부가 행이 비므로(배지는 인라인, 탭 없음) 그 행을 숨겨 여백 제거.
      headerExtraClassName={set.members.length > 1 ? undefined : "max-lg:hidden"}
      headerBadgeExtra={headerBadgeExtra}
      recentlyViewed={recentlyViewed}
      showStar={false}
      // 드래그 핸들(grip) 노출 — 일반 카드와 동일. 세트는 멤버 문항 전체를 한 덩어리로 끌어
      // 폴더 이동 등에 넘긴다(마키 영역선택은 suppressDragItem 로 계속 제외).
      getDragQuestionIds={() => set.members.map((m) => m.questionId)}
      showDetailButton
      onDetail={onOpenDetail}
      onDelete={onDelete ? () => void onDelete() : undefined}
      onApprove={
        onApproveMember
          ? () => void onApproveMember(activeMember.questionId)
          : undefined
      }
      onUnapprove={
        onUnapproveMember
          ? () => void onUnapproveMember(activeMember.questionId)
          : undefined
      }
      onEdit={
        onEditMember ? () => onEditMember(activeMember.questionId) : undefined
      }
    />
  );
}
