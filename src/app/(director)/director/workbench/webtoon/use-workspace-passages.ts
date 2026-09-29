"use client";

import {
  useCallback,
  useRef,
  type Dispatch,
  type SetStateAction,
} from "react";
import { toast } from "sonner";
import { createWorkbenchPassage } from "@/actions/workbench";
import { isDraftPseudoId } from "@/lib/extraction/draft-passage-id";
import { resolveSelectionToPassageIds } from "@/lib/extraction/resolve-draft-selection";
import type { PassageInputRow } from "@/components/workbench/passage-registration/passage-input/types";

interface RowBaseline {
  title: string;
  content: string;
}

export interface ResolvedRowPassage {
  passageId: string;
  /** 이번에 Passage 가 새로 생겼는지(신규 저장·검수 전 자료 승격) — 내 지문함 새로고침용. */
  created: boolean;
}

/**
 * 워크스페이스 행 → 웹툰을 만들 Passage id.
 *
 * 생성 파이프라인은 DB 의 passage.content 를 읽는다. 그래서 내 지문함에서 불러온
 * 행을 교사가 고쳤다면, 기존 Passage 를 그대로 쓰면 수정분이 조용히 버려진다.
 *
 * - 불러온 뒤 손대지 않은 행 → 그 Passage 재사용(중복 생성 방지).
 * - 검수 전 자료(`draft:` 가짜 id) → 학습지·문제 생성과 같은 승격 경로로 실제
 *   Passage 를 만든다(가짜 id 를 생성 API 에 보내면 404).
 * - 고친 행 → 원본은 그대로 두고 수정본을 **새 지문**으로 저장해 그걸로 만든다.
 *   원본 갱신(updatePassageBody)은 쓰지 않는다: 워크스페이스 본문은 표시용으로
 *   줄바꿈을 접은 텍스트(formatExtractedTextForDisplay)라 저장하면 원본 행 구조
 *   (국어 운문 행갈이 등)가 영구히 망가지고, 교사 표시(highlight 오프셋)·분석이
 *   어긋나며, 웹툰용으로 일부만 잘라 쓴 경우 학습지 원본이 잘려 버린다.
 * - 저장 안 된 행 → 기존과 동일하게 새 지문으로 저장.
 *
 * 새로 확보한 Passage id 는 행에 다시 실어 둔다 — 생성 요청이 실패(크레딧 부족 등)해
 * 행이 남았을 때 재시도가 지문을 또 만들지 않도록.
 */
export function useWorkspacePassages({
  subjectScope,
  setRows,
}: {
  subjectScope?: "KOREAN";
  setRows: Dispatch<SetStateAction<PassageInputRow[]>>;
}) {
  // localId → 불러온(또는 마지막으로 저장한) 시점의 제목·본문.
  const baselinesRef = useRef(new Map<string, RowBaseline>());

  /** 내 지문함에서 워크스페이스로 담은 행의 원본 스냅숏을 기억한다. */
  const rememberBaselines = useCallback((rows: PassageInputRow[]) => {
    for (const r of rows) {
      if (r.passageId) {
        baselinesRef.current.set(r.localId, { title: r.title, content: r.content });
      }
    }
  }, []);

  const forgetRow = useCallback((localId: string) => {
    baselinesRef.current.delete(localId);
  }, []);

  /** 행이 이 Passage 를 가리키게 하고, 지금 텍스트를 새 기준으로 삼는다. */
  const adoptPassage = useCallback(
    (row: PassageInputRow, passageId: string) => {
      baselinesRef.current.set(row.localId, {
        title: row.title,
        content: row.content,
      });
      setRows((prev) =>
        prev.map((r) => (r.localId === row.localId ? { ...r, passageId } : r)),
      );
    },
    [setRows],
  );

  const createPassage = useCallback(
    async (
      row: PassageInputRow,
      title: string,
      text: string,
    ): Promise<string | null> => {
      // 국어 라우트에서 워크스페이스에 직접 입력한 지문은 subject='KOREAN' 으로
      // 저장돼야 한다 — 그래야 생성된 웹툰(passage.subject 기준 스코프)이 국어
      // 보관함에 남고 영어 지문 목록에 새지 않는다. createWorkbenchPassage 는
      // subject 를 받지 않으므로(passages 유닛 소유), 국어 생성 페이지와 동일한
      // subject-aware 액션(createDirectInputPassageMaterial)을 쓴다. 영어(미전달)
      // 경로는 기존 createWorkbenchPassage 그대로(source·draft 링크 보존, 무회귀).
      if (subjectScope === "KOREAN") {
        const { createDirectInputPassageMaterial } = await import(
          "@/actions/workbench"
        );
        const result = await createDirectInputPassageMaterial({
          title,
          content: text,
          subject: "KOREAN",
        });
        if (!result.success || !result.id) {
          toast.error(result.error || "지문 등록에 실패했습니다.");
          return null;
        }
        return result.id;
      }
      const result = await createWorkbenchPassage({
        title,
        content: text,
        source: row.source?.trim() || undefined,
        sourceDraftId: row.sourceDraftId ?? undefined,
        // 국어 웹툰 라우트 등록이면 Passage.subject="KOREAN" 태깅.
        subject: subjectScope,
      });
      if (!result.success || !result.id) {
        toast.error(result.error || "지문 등록에 실패했습니다.");
        return null;
      }
      return result.id;
    },
    [subjectScope],
  );

  const resolveRowPassage = useCallback(
    async (
      row: PassageInputRow,
      title: string,
      text: string,
    ): Promise<ResolvedRowPassage | null> => {
      const baseline = row.passageId
        ? baselinesRef.current.get(row.localId)
        : undefined;
      const edited =
        !!baseline &&
        (baseline.title.trim() !== row.title.trim() ||
          baseline.content.trim() !== text);

      if (row.passageId && !edited) {
        if (!isDraftPseudoId(row.passageId)) {
          return { passageId: row.passageId, created: false };
        }
        // 검수 전 자료 → 실제 지문으로 승격(검수필요 상태는 유지된다).
        const { resolvedById } = await resolveSelectionToPassageIds([
          row.passageId,
        ]);
        const realId = resolvedById[row.passageId];
        if (!realId) {
          toast.error(
            "검수 전 자료를 지문으로 준비하지 못했어요. 잠시 후 다시 시도해 주세요.",
          );
          return null;
        }
        adoptPassage(row, realId);
        return { passageId: realId, created: true };
      }

      const passageId = await createPassage(row, title, text);
      if (!passageId) return null;
      adoptPassage(row, passageId);
      if (edited) {
        toast.success("수정한 지문을 새 지문으로 저장했어요", {
          description:
            "원본 지문은 그대로 두고, 수정한 내용으로 웹툰을 만들어요.",
        });
      }
      return { passageId, created: true };
    },
    [adoptPassage, createPassage],
  );

  return { rememberBaselines, forgetRow, resolveRowPassage };
}
