"use client";

import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { resolveWebtoonImagePlan } from "@/lib/webtoon-models";
import {
  DEFAULT_WEBTOON_LANGUAGE,
  type WebtoonRow,
} from "../webtoon-page-types";
import { requestWebtoonGeneration } from "../webtoon-generate-request";

/**
 * 보관함 실패 카드 「다시 시도」.
 *
 * - 원래 등급(plan)을 실어 보낸다 — 빠뜨리면 서버 기본값(일반)으로 조용히 강등돼
 *   프리미엄 재시도가 일반으로 만들어졌다. 등급 없는 레거시 행은 undefined →
 *   서버 기본값.
 * - 생성 API 는 항상 새 행을 만든다. 새 행이 생기면 이 실패 카드는 그 행으로
 *   대체된 것으로 보고 숨긴다(superseded). 숨김은 이후 재조회(5초 폴링·호스트
 *   새로고침)에도 유지돼 같은 실패가 두 장 남지 않는다. DB 행은 지우지 않는다 —
 *   환불 실패 시 FAILED 행이 유일한 증거라 자동 삭제는 하지 않는다(세션 한정 숨김).
 * - 같은 카드 연타는 한 번만 보낸다(크레딧 이중 차감 방지).
 */
export function useLibraryRetry({
  items,
  refetch,
}: {
  /** 숨김 적용 전 원본 목록(재시도 대상 조회용). */
  items: WebtoonRow[];
  refetch: (showSpinner?: boolean) => Promise<void>;
}) {
  const [superseded, setSuperseded] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const retryingRef = useRef<Set<string>>(new Set());

  /** 재시도로 대체된 실패 카드를 목록에서 뺀다. */
  const hideSuperseded = useCallback(
    (rows: WebtoonRow[]) =>
      superseded.size === 0 ? rows : rows.filter((it) => !superseded.has(it.id)),
    [superseded],
  );

  const handleRetry = useCallback(
    async (id: string) => {
      const target = items.find((it) => it.id === id);
      if (!target || target.status !== "FAILED") return;
      if (retryingRef.current.has(id)) return;
      retryingRef.current.add(id);
      try {
        const result = await requestWebtoonGeneration({
          passageIds: [target.passageId],
          style: target.style,
          language: target.language ?? DEFAULT_WEBTOON_LANGUAGE,
          customPrompt: target.customPrompt ?? "",
          plan: target.plan ?? undefined,
        });
        if (result.created > 0) {
          setSuperseded((prev) => new Set(prev).add(id));
        }
        if (result.error) toast.error(result.error);
        if (result.started > 0) {
          toast.message("웹툰 재생성을 시작했습니다.", {
            description: `완료까지 ${
              resolveWebtoonImagePlan(target.plan).etaLabel
            } 걸려요. 완료되면 목록에 자동으로 표시됩니다.`,
          });
        }
        if (result.created > 0) await refetch(false);
      } finally {
        retryingRef.current.delete(id);
      }
    },
    [items, refetch],
  );

  return { handleRetry, hideSuperseded };
}
