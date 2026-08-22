"use client";

// ============================================================================
// listRows 행 본문 — **메모 경계** (2026-08-15 마키 선택 렉 실측 수술)
//
// ── 왜 분리했나 (실측 근거) ────────────────────────────────────────────────
// PassageCardGrid 는 memo 도 가상화도 없이 `visiblePassages.map()` 한 번으로 전
// 행을 그린다. 그래서 **선택이 한 칸 바뀔 때마다 전 행의 JSX 를 다시 만든다.**
// 실측(.tmp-studio-qa/perf-dragselect.mjs · perf-profile-commit.mjs, 508행 목록):
//   · 마키 드래그 중          : 그리드 렌더 0회 (deferCommit 정상 — 여긴 문제 없음)
//   · 드래그를 **놓는 순간**  : 그리드 렌더 2회 → 롱태스크 **871~901ms** 화면 정지
//   · 체크박스 1개 토글       : 역시 렌더 2회(같은 비용)
//   · CPU 프로파일 self-time  : `jsxDEV` 418ms(13.3%) 최상위 — 앱 코드 핫스팟 없음.
//     즉 병목은 "무엇을 계산하느냐"가 아니라 **행 element 를 508벌 다시 만드는 것**.
//
// 이 컴포넌트가 memo 이므로, 선택이 바뀌어도 **isChecked 가 실제로 달라진 행만**
// 다시 렌더된다(나머지 507행은 element 재생성 0). 부모는 행마다 `<PassageListRow/>`
// 하나만 만들면 된다.
//
// ── 이 파일을 고칠 때의 계약 ───────────────────────────────────────────────
// **모든 prop 은 참조 안정이어야 한다.** 하나라도 렌더마다 새 참조면 memo 가
// 통째로 무력화돼 위 수술이 원상복구된다(그리고 아무도 눈치채지 못한다).
// 특히 콜백은 호출부에서 useCallback 으로 고정할 것 — 인라인 화살표 금지.
// 파생값(hasReviewDraft 등)은 p 에서 **이 안에서** 계산한다(부모가 계산해
// 내려보내면 prop 이 하나 더 늘어 실수 여지만 커진다).
// ============================================================================

import { memo, type MutableRefObject } from "react";
import { Check, CheckCircle2, Loader2, PencilLine } from "lucide-react";

import { CardDetailIconButton } from "@/components/ui/card-detail-icon-button";
import { DragHandle } from "@/components/ui/drag-handle";
import { PassageActivityLabel } from "@/components/workbench/passage-activity-ring";
import { PassageInlineTitle } from "@/components/workbench/passage-inline-title";
import type { QuestionCardItem } from "@/components/workbench/question-card";
import type { PassageActivity } from "@/lib/passage-activity";
import { formatMinuteTimestamp } from "./passage-card-grid-helpers";
import type { PassageItem } from "./generate-page-types";
import { PassageQuestionsSummary } from "./passage-questions-summary";
import { PassageReportsSummary } from "./passage-reports-summary";

export interface PassageListRowProps {
  p: PassageItem;
  isChecked: boolean;
  isLearningGenerating: boolean;
  /**
   * 「생성 중」 활동 표식(계약: @/lib/passage-activity) — null = 이 행은 조용함.
   * 테두리 링은 부모(행 루트)가 그리고, 이 행 본문은 메타줄 라벨만 담당한다.
   * ⚠ 이 값은 memo 비교 대상이다 — 부모가 잡 생멸 시에만 새 참조를 만든다는
   *   전제(시그니처 메모)가 깨지면 목록 전체가 폴링 틱마다 다시 그려진다.
   */
  activity: PassageActivity | null;
  /** 행 아래 인라인 확장이 열려 있는가 — 「지문 수정」 버튼의 aria-expanded. */
  expanded: boolean;
  passageBulkAction: "move" | "remove" | "delete" | null;
  hideReviewToggle: boolean;
  rowPrimaryAction: "detail" | "edit";
  classBadgePassageIds?: ReadonlySet<string>;
  questionsByPassage?: Map<string, QuestionCardItem[]>;
  /**
   * 문항 이력 지연 로더(additive) — 전달되면 questionsByPassage 에 목록이
   * 없어도 서버 집계(p._count.questions) > 0 인 행에 「생성된 문제」 토글을
   * 그리고, 팝오버 최초 오픈 시 이 로더로 목록을 지연 조회한다(스튜디오처럼
   * 일괄 프리로드가 없는 호스트용). ⚠ memo 비교 대상 — useCallback 고정 전제.
   */
  onLazyLoadQuestions?: (passageId: string) => Promise<QuestionCardItem[]>;
  reviewActionPassageIds?: Set<string>;
  /** 폴더 드래그 핸들 등록용 — ref 객체라 그 자체는 항상 안정. */
  passageHandleRefs: MutableRefObject<Map<string, HTMLElement>>;
  // ── 아래 콜백은 전부 참조 안정 전제(useCallback) ──
  toggleCheckbox: (id: string, e?: React.MouseEvent) => void;
  scheduleCardSelectionClick: (fn: () => void) => void;
  handleOpenAnalysisModal: (passageId: string) => void | Promise<void>;
  runRowPrimaryAction: (id: string) => void;
  onOpenQuestionDetail?: (q: QuestionCardItem) => void;
  onPassageRenamed?: (passageId: string, title: string) => void;
  onToggleExtractionReview?: (passage: PassageItem) => void;
  onEditPassageInline?: (passage: PassageItem) => void;
}

function PassageListRowInner({
  p,
  isChecked,
  isLearningGenerating,
  activity,
  expanded,
  passageBulkAction,
  hideReviewToggle,
  rowPrimaryAction,
  classBadgePassageIds,
  questionsByPassage,
  onLazyLoadQuestions,
  reviewActionPassageIds,
  passageHandleRefs,
  toggleCheckbox,
  scheduleCardSelectionClick,
  handleOpenAnalysisModal,
  runRowPrimaryAction,
  onOpenQuestionDetail,
  onPassageRenamed,
  onToggleExtractionReview,
  onEditPassageInline,
}: PassageListRowProps) {
  const reviewDraft = p.extractionReviewDraft ?? null;
  const hasReviewDraft = reviewDraft != null;
  const isReviewCommitted = reviewDraft?.reviewStatus === "COMMITTED";
  const reviewStampLabel = isReviewCommitted ? "검수완료" : "검수필요";
  const created = formatMinuteTimestamp(p.createdAt);
  const updated = formatMinuteTimestamp(p.updatedAt);
  // 「생성된 문제」 토글 재료 — 프리로드 목록이 있으면 그것이 정본, 없으면
  // lazy 호스트에 한해 서버 집계(_count)로 토글 노출을 판정한다.
  const rowQuestions = questionsByPassage?.get(p.id) ?? [];
  const lazyQuestionCount =
    onLazyLoadQuestions && rowQuestions.length === 0
      ? (p._count?.questions ?? 0)
      : 0;

  return (
    <>
      {/* Drag handle (folder 이동) — passageBulkAction 중에는 숨김 */}
      {passageBulkAction === null && (
        <DragHandle
          ref={(node) => {
            if (node) passageHandleRefs.current.set(p.id, node);
            else passageHandleRefs.current.delete(p.id);
          }}
          className="shrink-0"
        />
      )}
      <button
        type="button"
        aria-pressed={isChecked}
        aria-label={`${p.title} passage ${isChecked ? "deselect" : "select"}`}
        onClick={(e) => toggleCheckbox(p.id, e)}
        className={`flex size-[18px] shrink-0 items-center justify-center rounded transition-all ${
          isChecked
            ? "border border-blue-600 bg-blue-600 text-white"
            : "border border-slate-300 bg-white text-transparent hover:border-blue-400 hover:text-blue-400"
        }`}
      >
        <Check className="h-3 w-3" />
      </button>
      {/* min-w-[220px]: 제목이 이 폭 밑으로 압착되지 않는다 —
          폭 부족분은 행 루트 flex-wrap 이 우측 그룹 낙하로 흡수 */}
      <div className="min-w-[220px] flex-1">
        {/* 제목 — truncate 금지: 길면 break-keep 으로 줄바꿈(가변 높이 행).
            「담김」 배지(§3.10.4 additive): classBadgePassageIds 에 든 행만
            제목 옆에 소형 배지 — 미전달 호스트는 else 분기(기존 노드 그대로). */}
        {classBadgePassageIds?.has(p.id) ? (
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <PassageInlineTitle
              passageId={p.id}
              title={p.title}
              onRenamed={onPassageRenamed}
              titleClassName="break-keep text-[13px] font-semibold text-slate-800"
            />
            <span className="shrink-0 rounded bg-blue-50 px-1 py-0.5 text-[10px] font-medium text-blue-600">
              담김
            </span>
          </div>
        ) : (
          <PassageInlineTitle
            passageId={p.id}
            title={p.title}
            onRenamed={onPassageRenamed}
            titleClassName="break-keep text-[13px] font-semibold text-slate-800"
          />
        )}
        <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5">
          {created ? (
            <span
              className="shrink-0 text-[10.5px] tabular-nums text-slate-400"
              title={
                updated && updated !== created
                  ? `등록 ${created} · 수정 ${updated}`
                  : `등록 ${created}`
              }
            >
              {created}
            </span>
          ) : null}
          {isLearningGenerating && (
            <span
              className="learning-generating-text shrink-0 whitespace-nowrap text-[10.5px] font-bold"
              title="이 지문의 학습자료가 백그라운드에서 생성되고 있습니다"
            >
              학습자료 생성중
            </span>
          )}
          {/* 활동 라벨 — 링이 "돈다"를, 이쪽이 "무엇이"를 말한다. 등록 일시와
              같은 줄(gap-x-1.5)이라 세로 리듬이 늘지 않는다. isLearningGenerating
              과는 상호배타(부모가 activity 를 null 로 양보시킨다). */}
          {activity ? <PassageActivityLabel activity={activity} /> : null}
        </div>
      </div>
      {/* 우측 그룹 — 이력 클러스터·검수/상세 액션을 한 덩어리(shrink-0)로 묶는다.
          행 루트가 flex-wrap 이라 폭이 부족하면 이 그룹이 통째로 제목 아래 줄로
          낙하 — 제목 압착과 배지 세로 래핑을 동시에 막는다.
          max-md:w-full — 768px 미만은 전역 모바일 가드(globals.css
          smoat-large-ui: min-width:0 !important)가 제목 min-w-[220px] 를
          무효화하므로, min-width 에 기대지 않고 그룹을 항상 둘째 줄로 강제
          낙하시킨다(2026-08-11 재검증 V2 — w390 압착 재발 봉인). */}
      <div className="ml-auto flex shrink-0 items-center gap-1.5 max-md:w-full max-md:justify-end">
        {/* 생성 이력 클러스터 — 기존 팝오버 재사용(§3.8.4 순서: 학습자료 → 문제).
            공유 컴포넌트 내장 stopPropagation 래퍼(div 전체)가 여백 클릭까지
            삼켜 행 클릭(=선택 토글)이 죽으므로, 캡처 단계에서 여백 클릭을 선택
            토글로 승격한다 — 팝오버 트리거 버튼 클릭만 원래 동작 유지. */}
        {rowQuestions.length > 0 ||
        lazyQuestionCount > 0 ||
        (p.reports?.length ?? 0) > 0 ? (
          <div
            className="max-w-[220px] shrink-0 [&>div]:mt-0 [&>div]:border-t-0 [&>div]:pt-0"
            onClickCapture={(e) => {
              const target = e.target;
              // ⚠ 팝오버 행은 role="button" div(포털 렌더 — React 트리로 캡처가
              // 통과한다). button 만 보면 행 클릭이 여기서 선택 토글로 오변환돼
              // §3.9.5 행선지(문제 상세·분석 모달)가 죽는다(2026-08-11 U3 스모크
              // 실측) — role="button" 도 통과시킨다.
              if (
                target instanceof Element &&
                target.closest('button,[role="button"]')
              ) {
                return;
              }
              // 여백 클릭 — 내장 래퍼가 버블을 끊기 전에 여기서 멈추고 행 클릭과
              // 같은 선택 토글로.
              e.stopPropagation();
              if (e.detail > 1 || e.defaultPrevented) return;
              if (e.button !== 0) return;
              if (e.metaKey || e.ctrlKey || e.altKey) return;
              scheduleCardSelectionClick(() => toggleCheckbox(p.id));
            }}
          >
            <PassageReportsSummary
              passageId={p.id}
              reports={p.reports ?? []}
              onOpen={handleOpenAnalysisModal}
            />
            <PassageQuestionsSummary
              questions={rowQuestions}
              onOpenQuestion={onOpenQuestionDetail}
              fallbackCount={lazyQuestionCount > 0 ? lazyQuestionCount : undefined}
              loadQuestions={
                lazyQuestionCount > 0 && onLazyLoadQuestions
                  ? () => onLazyLoadQuestions(p.id)
                  : undefined
              }
            />
          </div>
        ) : null}
        {/* 분석 상태 배지는 폐기(2026-08-11 사용자 지시) — 분석 여부는 우측 지문
            도시에(선택 시)가 정본으로 보여 준다. */}
        <div className="flex shrink-0 items-center gap-1.5">
          {hasReviewDraft && !hideReviewToggle
            ? (() => {
                const reviewBusy = reviewActionPassageIds?.has(p.id) ?? false;
                const interactive = !!onToggleExtractionReview;
                return (
                  <button
                    type="button"
                    aria-pressed={isReviewCommitted}
                    aria-label={reviewStampLabel}
                    disabled={!interactive || reviewBusy}
                    title={
                      interactive
                        ? isReviewCommitted
                          ? "검수완료 — 누르면 검수필요로 되돌립니다"
                          : "검수필요 — 누르면 검수완료로 표시합니다"
                        : reviewStampLabel
                    }
                    onClick={(e) => {
                      e.stopPropagation();
                      if (reviewBusy) return;
                      onToggleExtractionReview?.(p);
                    }}
                    className={
                      "flex size-8 items-center justify-center rounded-md border bg-white transition-colors disabled:pointer-events-none disabled:opacity-50 " +
                      (isReviewCommitted
                        ? "border-emerald-500 text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700"
                        : "border-red-200/80 text-red-300 hover:border-emerald-500 hover:bg-emerald-50 hover:text-emerald-600")
                    }
                  >
                    {reviewBusy ? (
                      <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                    ) : (
                      <CheckCircle2 className="size-3.5" aria-hidden="true" />
                    )}
                  </button>
                );
              })()
            : null}
          {/* 행 1차 액션(§3.10.18 E18-f) — 기본은 기존 「상세보기」(Maximize2).
              스튜디오만 edit 모드로 「지문 수정」(PencilLine)이 되며, 공유
              컴포넌트의 기본값은 22개 파일이 쓰므로 손대지 않고 호출부에서
              icon/title/aria-label 만 덮어쓴다. */}
          <CardDetailIconButton
            className="size-8 shrink-0 rounded-md"
            iconClassName="size-3.5"
            {...(rowPrimaryAction === "edit" && onEditPassageInline
              ? {
                  icon: PencilLine,
                  title: "지문 수정",
                  "aria-label": "지문 수정",
                  // 확장 노드와 1:1 연결(스크린리더가 이 버튼이 무엇을
                  // 여닫는지 알 수 있게).
                  "aria-expanded": expanded,
                  "aria-controls": `row-editor-${p.id}`,
                }
              : null)}
            onClick={(e) => {
              e.stopPropagation();
              runRowPrimaryAction(p.id);
            }}
          />
        </div>
      </div>
    </>
  );
}

export const PassageListRow = memo(PassageListRowInner);
