"use client";

// ============================================================================
// 생성 큐 상태 카드(생성 중 / 오류) — BottomQueueSection 과 EmbeddedQuestionBank
// 두 표면이 각자 사본(renderQueueStatusCard / QueueStripCard)을 들고 있던 것을
// 공유 컴포넌트로 통일한다(26-07-21 스트리밍 사고의 원인 중복 제거).
// key 는 컴포넌트 내부가 아니라 호출부(map 사이트)가 소유한다.
// ============================================================================

import { AlertTriangle, Gem, Loader2, RotateCcw } from "lucide-react";
import { PearlIcon } from "@/components/icons/pearl-icon";
import { WorkbenchLoadingCard } from "@/components/workbench/workbench-loading-card";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import { getQuestionGenerationPlanConfig } from "@/lib/question-generation-plans";
import { getFriendlyQuestionGenerationError } from "@/lib/workbench-generation-errors";
import { readQuestionTypeDifficultySetting } from "@/lib/question-type-generation-settings";
import { countWords, typeLabel, type QueueItem } from "./generate-page-types";
import { StreamPreviewPane } from "./stream-preview-pane";

export function QueueStatusCard({
  item,
  onRetryGeneration,
  showPremiumBadgeWhenFlagOff = false,
}: {
  item: QueueItem;
  /** 생성 실패 카드에서 같은 조건으로 다시 생성 — 미지정 시 버튼을 숨긴다. */
  onRetryGeneration?: (item: QueueItem) => void | Promise<void>;
  /** 모델 셀렉터가 꺼져 있어도 이미 PREMIUM으로 생성된 항목은 배지를 보인다.
   *  BottomQueueSection(=custom/similar 페이지 소비 표면)이 켜고,
   *  EmbeddedQuestionBank 는 끈다(기존 두 사본의 유일한 실동작 차이). */
  showPremiumBadgeWhenFlagOff?: boolean;
}) {
  const planConfig = getQuestionGenerationPlanConfig(
    item.config.generationPlan || "STANDARD",
  );
  const planBadgeVisible =
    FEATURE_FLAGS.SHOW_MODEL_SELECTOR ||
    (showPremiumBadgeWhenFlagOff && planConfig.id === "PREMIUM");

  if (item.status === "generating") {
    const requestedCount = Object.values(item.config.typeCounts).reduce(
      (a, b) => a + Number(b),
      0,
    );
    return (
      <WorkbenchLoadingCard
        title={item.passageTitle}
        contentPreview={
          // 생성 카드는 프리뷰를 균일 길이로 고정 — 스트리밍 패널이 나중에
          // 마운트돼도 지문 프리뷰 줄수가 변하지 않아 카드 중단부 리플로우가 없다.
          `${item.passageContent.slice(0, 120)}...`
        }
        statusLabel="생성 중"
        progressLabel={`AI가 ${requestedCount}문제를 생성 중입니다...`}
        wordCount={countWords(item.passageContent)}
        showCheckbox={false}
        statusIcon={Loader2}
        variant="analyzing"
        fixedHeight
        metaSlot={
          item.streamPreview ? (
            <StreamPreviewPane preview={item.streamPreview} />
          ) : undefined
        }
        ariaLabel={`${item.passageTitle} - 문제 생성 중`}
        planBadge={
          planBadgeVisible ? (
            <span className="shrink-0 inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">
              {planConfig.id === "PREMIUM" ? (
                <Gem className="w-3 h-3" />
              ) : (
                <PearlIcon className="w-3 h-3" />
              )}
              {planConfig.shortLabel}
            </span>
          ) : null
        }
      />
    );
  }

  if (item.status === "error") {
    const questionType = Object.keys(item.config.typeCounts).find(
      (typeId) => Number(item.config.typeCounts[typeId]) > 0,
    );
    const errorDetail = getFriendlyQuestionGenerationError(
      item.error,
      questionType,
    );
    const requestedTypes = Object.entries(item.config.typeCounts)
      .filter(([, count]) => Number(count) > 0)
      .map(([typeId, count]) => `${typeLabel(typeId)} ${count}개`)
      .join(", ");
    // 유형별 난이도 설정이 배치 난이도를 덮는다(서버 readQuestionTypeDifficultySetting
    // 과 동일 규칙). 배치 값을 그대로 찍으면 KILLER 로 돌린 실패 카드에 INTERMEDIATE
    // 가 표시돼 사용자가 무엇으로 실패했는지 오인한다(26-07-26 실사용 신고).
    const effectiveDifficulty = questionType
      ? readQuestionTypeDifficultySetting(
          item.config.questionTypeSettings?.[questionType],
          item.config.difficulty,
        )
      : item.config.difficulty;

    return (
      <div className="h-[340px] overflow-hidden rounded-xl border border-red-200 bg-red-50/30 p-4">
        <div className="flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-500 shrink-0" />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 min-w-0">
              <h4 className="text-[13px] font-bold text-slate-800 truncate">
                {item.passageTitle}
              </h4>
              {planBadgeVisible && (
                <span className="shrink-0 inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">
                  {planConfig.id === "PREMIUM" ? (
                    <Gem className="w-3 h-3" />
                  ) : (
                    <PearlIcon className="w-3 h-3" />
                  )}
                  {planConfig.shortLabel}
                </span>
              )}
            </div>
            <span className="text-[11px] text-red-500 font-medium">
              생성 실패
            </span>
            {requestedTypes && (
              <p className="mt-1 text-[11px] font-medium text-slate-500">
                {requestedTypes} · {effectiveDifficulty}
              </p>
            )}
            {errorDetail && (
              <p className="mt-1 line-clamp-5 break-words text-[11px] leading-4 text-red-600">
                {errorDetail}
              </p>
            )}
          </div>
        </div>
        {onRetryGeneration && (
          <button
            type="button"
            onClick={() => onRetryGeneration(item)}
            title="이 카드에 사용된 유형·난이도·조건 그대로 다시 생성합니다"
            className="mt-3 inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-red-200 bg-white px-3 text-[11.5px] font-bold text-red-600 shadow-sm transition-colors hover:bg-red-50"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            같은 조건으로 다시 생성하기
          </button>
        )}
      </div>
    );
  }

  return null;
}
