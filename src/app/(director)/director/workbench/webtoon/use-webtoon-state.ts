"use client";

import { useCallback } from "react";
import { toast } from "sonner";
import {
  DEFAULT_WEBTOON_IMAGE_PLAN,
  resolveWebtoonImagePlan,
  type WebtoonImagePlanId,
} from "@/lib/webtoon-models";
import type { WebtoonStyleId, WebtoonLanguageId } from "./webtoon-page-types";
import { DEFAULT_WEBTOON_LANGUAGE } from "./webtoon-page-types";
import {
  requestWebtoonGeneration,
  type WebtoonGenerateResult,
} from "./webtoon-generate-request";

interface PassageMin {
  id: string;
  title: string;
  content: string;
}

const NOTHING_STARTED: WebtoonGenerateResult = {
  created: 0,
  started: 0,
  error: null,
};

/**
 * 웹툰 생성 페이지의 생성 트리거.
 *
 * 목록·진행 상태는 임베드된 보관함(WebtoonLibraryClient)이 단일 소스로 폴링하고
 * 헤더 배지까지 올려 준다(onStatusCountsChange). 예전에는 이 훅이 최근 30건을
 * 따로 폴링해 배지를 셌는데, 보관함의 삭제·재시도를 몰라 「실패 N」이 낡은 채
 * 남았고 같은 행을 두 번 폴링했다 — 그 목록·폴러와 호출부 없는 핸들러(재시도·
 * 삭제·검수 토글·patch)는 걷어냈다.
 */
export function useWebtoonState() {
  const handleBatchGenerate = useCallback(
    async (
      passages: PassageMin[],
      style: WebtoonStyleId,
      customPrompt: string,
      language: WebtoonLanguageId = DEFAULT_WEBTOON_LANGUAGE,
      plan: WebtoonImagePlanId = DEFAULT_WEBTOON_IMAGE_PLAN,
    ): Promise<WebtoonGenerateResult> => {
      if (passages.length === 0) return NOTHING_STARTED;

      const result = await requestWebtoonGeneration({
        passageIds: passages.map((p) => p.id),
        style,
        language,
        customPrompt,
        plan,
      });

      // 디스패치에 실패해 곧바로 FAILED 가 된 행은 "시작"으로 세지 않는다 —
      // 실패 사유를 그대로 보여 주고, 호출부는 started 로만 성공을 판정한다.
      if (result.error) toast.error(result.error);
      if (result.started > 0) {
        toast.message(`${result.started}개 웹툰 생성을 시작했습니다.`, {
          description: `${
            result.started > 1
              ? `한 편에 ${resolveWebtoonImagePlan(plan).etaLabel}씩, 여러 편은 차례로 그려져 전체는 더 걸릴 수 있어요.`
              : `완료까지 ${resolveWebtoonImagePlan(plan).etaLabel} 걸려요.`
          } 다른 작업을 계속하셔도 완료되면 이 화면에 자동으로 표시됩니다.`,
        });
      }
      return result;
    },
    [],
  );

  return { handleBatchGenerate };
}
