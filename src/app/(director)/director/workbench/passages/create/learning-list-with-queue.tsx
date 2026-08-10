"use client";

import { useEffect, useMemo, useRef, type ComponentProps } from "react";
import { useRouter } from "next/navigation";
import { Clock, Gem, Loader2 } from "lucide-react";
import { PassageListClient } from "@/components/workbench/passage-list-client";
import { WorkbenchLoadingCard } from "@/components/workbench/workbench-loading-card";
import { PearlIcon } from "@/components/icons/pearl-icon";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import {
  getQuestionGenerationPlanConfig,
  normalizeQuestionGenerationPlan,
  sanitizeAiModelDisclosureText,
} from "@/lib/question-generation-plans";
import { StreamPreviewPane } from "@/app/(director)/director/workbench/generate/stream-preview-pane";
import { useLearningGenerationItems } from "./learning-generation-context";

type PassageListClientProps = ComponentProps<typeof PassageListClient>;

function PlanBadge({ plan }: { plan?: string }) {
  const cfg = getQuestionGenerationPlanConfig(
    normalizeQuestionGenerationPlan(plan),
  );
  if (!cfg) return null;
  if (cfg.id !== "PREMIUM" && !FEATURE_FLAGS.SHOW_MODEL_SELECTOR) return null;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-bold ${
        cfg.id === "PREMIUM"
          ? "border-violet-200 bg-violet-50 text-violet-700"
          : "border-sky-200 bg-sky-50 text-sky-700"
      }`}
    >
      {cfg.id === "PREMIUM" ? (
        <Gem className="h-3 w-3" />
      ) : (
        <PearlIcon className="h-3 w-3" />
      )}
      {cfg.shortLabel}
    </span>
  );
}

/**
 * 하단 "학습지 목록"(PassageListClient) 위에 진행 중인 학습지 생성 로딩 큐를 띄우는
 * 클라이언트 래퍼. 상단 워크스페이스가 LearningGenerationContext 로 발행한 진행중
 * (pending|analyzing) 항목을 구독해 목록 상단에 로딩 카드로 보여주고, 한 건이라도
 * 끝나면 router.refresh() 로 서버 목록을 새로고침해 완료된 학습지를 끌어온다.
 */
export function LearningListWithQueue(
  props: Omit<PassageListClientProps, "loadingCards" | "loadingCount">,
) {
  const router = useRouter();
  const generatingItems = useLearningGenerationItems();

  // 진행중 항목이 줄어들면(= 한 건이 완료/실패로 큐를 떠나면) 서버 목록을 새로고침해
  // 새로 완료된 학습지가 하단 목록에 나타나게 한다.
  const prevIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const current = new Set(generatingItems.map((item) => item.id));
    const prev = prevIdsRef.current;
    let someLeft = false;
    for (const id of prev) {
      if (!current.has(id)) {
        someLeft = true;
        break;
      }
    }
    prevIdsRef.current = current;
    if (someLeft) router.refresh();
  }, [generatingItems, router]);

  const loadingCards = useMemo(() => {
    if (generatingItems.length === 0) return null;
    return (
      <div className="mb-3">
        <div className="mb-2 flex items-center gap-1.5">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />
          <h3 className="text-[12.5px] font-bold text-slate-700">
            학습지 생성 중
          </h3>
          <span className="text-[11px] font-semibold tabular-nums text-blue-600">
            {generatingItems.length}건
          </span>
          <span className="text-[11px] font-medium text-slate-400">
            · 완료되면 아래 목록에 추가됩니다
          </span>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {generatingItems.map((item) => {
            const analyzing = item.status === "analyzing";
            return (
              <WorkbenchLoadingCard
                key={item.id}
                title={sanitizeAiModelDisclosureText(item.title)}
                contentPreview={item.contentPreview}
                statusLabel={analyzing ? "분석 중" : "대기 중"}
                progressLabel={
                  analyzing
                    ? "AI가 5층 분석을 수행 중입니다..."
                    : "분석 작업 대기열에서 준비 중입니다..."
                }
                wordCount={item.wordCount}
                variant={analyzing ? "analyzing" : "pending"}
                statusIcon={analyzing ? Loader2 : Clock}
                spinIcon={analyzing}
                showCheckbox={false}
                planBadge={<PlanBadge plan={item.promptConfig.generationPlan} />}
                // 실시간 생성 미리보기 — 문제 생성(md-stream)의 로딩 카드와 동일한
                // 패널. 이 카드가 사용자가 실제로 보는 표면이라 여기 없으면
                // 스트리밍이 "안 되는" 것처럼 보인다(26-07-25 실사고).
                metaSlot={
                  item.streamPreview ? (
                    <StreamPreviewPane preview={item.streamPreview} />
                  ) : undefined
                }
              />
            );
          })}
        </div>
      </div>
    );
  }, [generatingItems]);

  return (
    <PassageListClient
      {...props}
      loadingCards={loadingCards}
      loadingCount={generatingItems.length}
    />
  );
}
